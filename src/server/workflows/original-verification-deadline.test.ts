import { createHash, randomUUID } from "node:crypto";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createOriginalVerificationExecutor } from "./original-verification-executor";
import { createOriginalVerificationRepository } from "./original-verification-repository";
import { runOriginalVerification, type OriginalVerificationClaim } from "./original-verification-worker";

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
function journey(stalled: "claim" | "lease" | "finish", leaseMs = 30_000) {
  const bytes = Buffer.from("%PDF-1.7\nSynthetic deadline original\n%%EOF");
  const claim: OriginalVerificationClaim = {
    jobId: randomUUID(), accessId: randomUUID(), organizationId: randomUUID(), documentId: randomUUID(), versionId: randomUUID(),
    uploadRevision: 4, purpose: "finance_review", leaseToken: randomUUID(), revision: 2,
    claimedAt: new Date(Date.now() - 1000).toISOString(), leaseExpiresAt: new Date(Date.now() + leaseMs).toISOString(),
    fileName: "synthetic.pdf", contentType: "application/pdf", byteSize: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"),
  };
  let resolveLate!: (value: unknown) => void;
  const pending = new Promise<unknown>((resolve) => { resolveLate = resolve; });
  const transport = {
    execute: vi.fn(async (text: string) => {
      if (text.includes(" AS claim")) return stalled === "claim" ? pending : [{ claim }];
      if (text.includes(" AS checked")) return stalled === "lease" ? pending : [{ checked: true }];
      if (text.includes(" AS result")) return stalled === "finish" ? pending : [{ result: null }];
      throw new Error("Unexpected synthetic SQL operation");
    }), terminate: vi.fn(async () => undefined),
  };
  const executor = createOriginalVerificationExecutor(transport), repository = createOriginalVerificationRepository(executor);
  const store = { readOriginal: vi.fn(async () => bytes) };
  return { claim, transport, executor, store, resolveLate,
    run: (signal?: AbortSignal) => runOriginalVerification(claim.jobId, { repository, store, signal }) };
}
describe("worker actual bounded repository composition, synthetic transport", () => {
  test.each(["claim", "lease", "finish"] as const)("settles unresolved %s SQL at the unchanged query limit", async (stalled) => {
    vi.useFakeTimers(); const f = journey(stalled), result = f.run();
    const expected = stalled === "claim" ? "claim_unavailable" : stalled === "lease" ? "lease_unavailable" : "recording_unknown";
    const check = expect(result).resolves.toEqual({ outcome: "failed", code: expected });
    await vi.advanceTimersByTimeAsync(8000); await check; await f.executor.close();
    expect(f.transport.terminate).toHaveBeenCalledOnce();
    const finished = f.transport.execute.mock.calls.filter(([text]) => text.includes(" AS result"));
    expect(finished).toHaveLength(stalled === "finish" ? 1 : 0);
    f.resolveLate([{ result: { jobId: f.claim.jobId, accessId: f.claim.accessId, state: "verified", revision: 3, outcomeCode: "recorded" } }]);
    await vi.advanceTimersByTimeAsync(1); expect(f.transport.execute.mock.calls.filter(([text]) => text.includes(" AS result"))).toHaveLength(finished.length);
  });
  test("real lease expiry interrupts a hanging finish and retains its unknown outcome", async () => {
    vi.useFakeTimers(); const f = journey("finish", 100), result = f.run();
    const check = expect(result).resolves.toEqual({ outcome: "failed", code: "recording_unknown" });
    await vi.advanceTimersByTimeAsync(100); await check; await f.executor.close();
    expect(f.transport.execute.mock.calls.filter(([text]) => text.includes(" AS result"))).toHaveLength(1);
  });
  test("external cancellation interrupts a dispatched claim without reading Storage", async () => {
    vi.useFakeTimers(); const f = journey("claim"), controller = new AbortController(), result = f.run(controller.signal);
    const check = expect(result).resolves.toEqual({ outcome: "failed", code: "claim_unavailable" });
    await vi.advanceTimersByTimeAsync(1); controller.abort(); await check;
    expect(f.store.readOriginal).not.toHaveBeenCalled(); await f.executor.close();
  });
  test("repository cannot extend a stored lease through a later caller deadline", async () => {
    vi.useFakeTimers(); const f = journey("lease", 19), repository = createOriginalVerificationRepository(f.executor);
    const result = repository.leaseIsCurrent(f.claim, { deadlineAt: Date.now() + 100_000 });
    const check = expect(result).rejects.toMatchObject({ code: "UNAVAILABLE" });
    await vi.advanceTimersByTimeAsync(19); await check; await f.executor.close();
  });
});
