import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createOriginalVerificationExecutor } from "./original-verification-executor";
import { createOriginalVerificationRepository } from "./original-verification-repository";
import type { OriginalVerificationClaim } from "./original-verification-worker";

function deferred() {
  let resolve!: (value: unknown) => void, reject!: (error: unknown) => void;
  const promise = new Promise<unknown>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function fixture() {
  const pending = deferred();
  const transport = { execute: vi.fn(() => pending.promise), terminate: vi.fn(async (): Promise<void> => undefined) };
  const executor = createOriginalVerificationExecutor(transport);
  const query = sql`SELECT job_id FROM mmhr_private.r7_original_verification_candidates_v1()`;
  return { pending, transport, executor, query };
}
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("owned original SQL execution", () => {
  test("keeps normal completion reusable and preserves rows", async () => {
    const f = fixture(), rows = [{ job_id: randomUUID() }];
    const result = f.executor.execute(f.query); f.pending.resolve(rows);
    await expect(result).resolves.toBe(rows);
    expect(f.executor.status()).toEqual({ state: "ready", cleanupState: "not_started" });
    expect(f.transport.terminate).not.toHaveBeenCalled();
    await expect(f.executor.execute(f.query)).resolves.toBe(rows);
    await f.executor.close(); expect(f.transport.terminate).toHaveBeenCalledOnce();
  });
  test.each(["signal", "deadline", "invalid_deadline"])("does not dispatch rejected preflight %s", async (kind) => {
    const f = fixture(), controller = new AbortController(); controller.abort();
    const context = kind === "signal" ? { signal: controller.signal } : { deadlineAt: kind === "deadline" ? Date.now() : NaN };
    await expect(f.executor.execute(f.query, context)).rejects.toMatchObject({ code:
      kind === "signal" ? "ABORTED" : kind === "deadline" ? "DEADLINE" : "INVALID_INPUT" });
    expect(f.transport.execute).not.toHaveBeenCalled(); expect(f.transport.terminate).not.toHaveBeenCalled();
    expect(f.executor.status().state).toBe("ready"); await f.executor.close();
  });
  test("permits one request and denies an unbounded queue", async () => {
    const f = fixture(), first = f.executor.execute(f.query);
    await expect(f.executor.execute(f.query)).rejects.toMatchObject({ code: "BUSY" });
    f.pending.resolve([]); await first;
    expect(f.transport.execute).toHaveBeenCalledOnce(); await f.executor.close();
  });
  test("aborts a dispatched request and rejects later work", async () => {
    const f = fixture(), controller = new AbortController();
    const result = f.executor.execute(f.query, { signal: controller.signal });
    const rejected = expect(result).rejects.toMatchObject({ code: "ABORTED" });
    await Promise.resolve(); expect(f.transport.execute).toHaveBeenCalledOnce(); controller.abort(); await rejected;
    await f.executor.close(); expect(f.transport.terminate).toHaveBeenCalledOnce();
    await expect(f.executor.execute(f.query)).rejects.toMatchObject({ code: "CLOSED" });
    f.pending.resolve([{ unsafeLateResult: true }]); await Promise.resolve();
    expect(f.executor.status()).toEqual({ state: "poisoned", cleanupState: "complete" });
  });
  test("aborts between admission and native dispatch", async () => {
    const f = fixture(), controller = new AbortController();
    const result = f.executor.execute(f.query, { signal: controller.signal });
    const rejected = expect(result).rejects.toMatchObject({ code: "ABORTED" }); controller.abort(); await rejected;
    expect(f.transport.execute).not.toHaveBeenCalled(); await f.executor.close();
  });
  test.each(["lease", "fixed"])("uses the smaller %s limit", async (kind) => {
    vi.useFakeTimers(); const f = fixture(), limit = kind === "lease" ? 17 : 8000;
    const result = f.executor.execute(f.query, { deadlineAt: Date.now() + (kind === "lease" ? 17 : 90_000) });
    const rejected = expect(result).rejects.toMatchObject({ code: "DEADLINE" });
    await vi.advanceTimersByTimeAsync(limit - 1); expect(f.executor.status().state).toBe("busy");
    await vi.advanceTimersByTimeAsync(1); await rejected; await f.executor.close();
    expect(f.transport.terminate).toHaveBeenCalledOnce();
  });
  test("does not accept a late settlement before a delayed timer callback", async () => {
    const f = fixture(), clock = vi.spyOn(Date, "now"), start = Date.now(); clock.mockReturnValue(start);
    const result = f.executor.execute(f.query, { deadlineAt: start + 100 });
    const rejected = expect(result).rejects.toMatchObject({ code: "DEADLINE" });
    clock.mockReturnValue(start + 101); f.pending.resolve([]); await rejected; await f.executor.close();
  });
  test("wall-clock rewind during admission cannot extend the fixed query limit", async () => {
    vi.useFakeTimers(); const f = fixture(), start = Date.now();
    vi.spyOn(Date, "now").mockReturnValueOnce(start).mockReturnValueOnce(start - 10_000).mockReturnValue(start - 10_000);
    const result = f.executor.execute(f.query), rejected = expect(result).rejects.toMatchObject({ code: "DEADLINE" });
    await vi.advanceTimersByTimeAsync(7999); expect(f.executor.status().state).toBe("busy");
    await vi.advanceTimersByTimeAsync(1); await rejected; await f.executor.close();
    expect(f.transport.terminate).toHaveBeenCalledOnce();
  });
  test("rejects native failure without private error details", async () => {
    const f = fixture(), result = f.executor.execute(f.query);
    const rejected = expect(result).rejects.toMatchObject({ code: "UNAVAILABLE", message: "Original verification SQL operation failed" });
    f.pending.reject(new Error("private password, SQL, parameters, and endpoint")); await rejected;
    await f.executor.close(); expect(f.executor.status().state).toBe("poisoned");
  });
  test("close interrupts pending work and is idempotent", async () => {
    const f = fixture(), result = f.executor.execute(f.query);
    const rejected = expect(result).rejects.toMatchObject({ code: "CLOSED" });
    await f.executor.close(); await rejected; await f.executor.close();
    expect(f.transport.terminate).toHaveBeenCalledOnce();
  });
  test.each(["failure", "never"])("exposes bounded cleanup %s without permitting recovery on the old client", async (kind) => {
    vi.useFakeTimers(); const f = fixture();
    f.transport.terminate.mockImplementation(kind === "failure" ? async () => { throw new Error("private cleanup endpoint"); }
      : () => new Promise<void>(() => undefined));
    const closed = f.executor.close(), rejected = expect(closed).rejects.toMatchObject({ code: "CLEANUP_FAILED" });
    await vi.advanceTimersByTimeAsync(2000); await rejected;
    expect(f.executor.status()).toEqual({ state: "closed", cleanupState: "failed" });
    await expect(f.executor.execute(f.query)).rejects.toMatchObject({ code: "CLOSED" });
    expect(f.transport.terminate).toHaveBeenCalledOnce();
  });
  test("fresh owned transport can recover after old transport termination", async () => {
    const old = fixture(); await old.executor.close();
    const fresh = fixture(), result = fresh.executor.execute(fresh.query); fresh.pending.resolve([]); await result;
    expect(old.transport.execute).not.toHaveBeenCalled(); expect(fresh.executor.status().state).toBe("ready"); await fresh.executor.close();
  });
  test.each([sql`SELECT 1`, sql`SET ROLE mmhr_original_verifier`, sql`SELECT job_id FROM mmhr_private.r7_original_verification_candidates_v1(); SELECT 1`,
    sql`SELECT mmhr_private.r7_original_verification_claim_v1(${"not a uuid"}::uuid) AS claim`])("denies non-verifier SQL and malformed identifiers", async (query) => {
    const f = fixture(); await expect(f.executor.execute(query)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(f.transport.execute).not.toHaveBeenCalled(); await f.executor.close();
  });
  test.each([true, false])("verifies exact restricted session and SQL timeout: %s", async (valid) => {
    const f = fixture(), login = `mmhr_original_verifier_${"a".repeat(32)}`;
    f.pending.resolve([{ role: login, session: valid ? login : "postgres", statement_timeout: "8s", safe_role: true }]);
    if (valid) await f.executor.verifyConnection(login);
    else await expect(f.executor.verifyConnection(login)).rejects.toMatchObject({ code: "UNAVAILABLE" });
    await f.executor.close();
  });
  test.each(["timeout", "role_flags", "extra", "role"])("rejects unsafe connection proof %s", async (kind) => {
    const f = fixture(), login = `mmhr_original_verifier_${"a".repeat(32)}`;
    const row: Record<string, unknown> = { role: login, session: login, statement_timeout: "8s", safe_role: true };
    if (kind === "timeout") row.statement_timeout = "0";
    if (kind === "role_flags") row.safe_role = false;
    if (kind === "extra") row.rawCredential = "private";
    if (kind === "role") row.role = "postgres";
    f.pending.resolve([row]); await expect(f.executor.verifyConnection(login)).rejects.toMatchObject({ code: "UNAVAILABLE" });
    expect(f.executor.status().state).toBe("poisoned"); await f.executor.close();
  });
  test.each(["token", "revision", "completion"])("denies malformed fixed RPC %s before native dispatch", async (kind) => {
    const f = fixture(), jobId = randomUUID(), token = kind === "token" ? "invalid" : randomUUID();
    const revision = kind === "revision" ? 3 : 2;
    const query = kind === "completion"
      ? sql`SELECT mmhr_private.r7_original_verification_finish_v1(${jobId}::uuid,${token}::uuid,
        ${revision}::integer,${JSON.stringify({ state: "failed", failureCode: "invalid_document", actor: "forged" })}::jsonb) AS result`
      : sql`SELECT mmhr_private.r7_original_verification_lease_current_v1(${jobId}::uuid,
        ${token}::uuid,${revision}::integer) AS checked`;
    await expect(f.executor.execute(query)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(f.transport.execute).not.toHaveBeenCalled(); await f.executor.close();
  });
  test("executes all four real repository calls and binds the earlier actual lease deadline", async () => {
    const jobId = randomUUID(), token = randomUUID(), earlier = Date.now() + 1000;
    const claim = { jobId, leaseToken: token, revision: 2, leaseExpiresAt: new Date(earlier).toISOString() } as OriginalVerificationClaim;
    const transport = { execute: vi.fn(async (text: string): Promise<unknown> => text.includes(" AS claim") ? [{ claim }]
      : text.includes(" AS checked") ? [{ checked: true }] : text.includes(" AS result") ? [{ result: null }] : [{ job_id: jobId }]),
      terminate: vi.fn(async (): Promise<void> => undefined) };
    const executor = createOriginalVerificationExecutor(transport), repository = createOriginalVerificationRepository(executor);
    await expect(repository.listCandidateIds()).resolves.toEqual([jobId]); await expect(repository.claim(jobId)).resolves.toBe(claim);
    await expect(repository.leaseIsCurrent(claim, { deadlineAt: Date.now() + 100_000 })).resolves.toBe(true);
    await expect(repository.finish(claim, { state: "failed", failureCode: "invalid_document" })).resolves.toBeNull();
    expect(transport.execute).toHaveBeenCalledTimes(4);
    expect(transport.execute.mock.calls[2]![0]).toContain("r7_original_verification_lease_current_v1");
    await executor.close();
  });
});
