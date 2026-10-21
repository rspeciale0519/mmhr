import { createHash, randomUUID } from "node:crypto";
import { afterEach, describe, expect, test, vi } from "vitest";

import { OriginalVerificationReadError, runOriginalVerification,
  type OriginalVerificationClaim, type OriginalVerificationCompletion, type OriginalVerificationStore } from "./original-verification-worker";

function fixture() {
  const bytes = Buffer.from("%PDF-1.7\nSynthetic original verification\n%%EOF");
  const claim: OriginalVerificationClaim = {
    jobId: randomUUID(), accessId: randomUUID(), organizationId: randomUUID(), documentId: randomUUID(), versionId: randomUUID(),
    uploadRevision: 4, purpose: "finance_review", leaseToken: randomUUID(), revision: 2,
    claimedAt: new Date(Date.now() - 1000).toISOString(), leaseExpiresAt: new Date(Date.now() + 30_000).toISOString(),
    fileName: "synthetic.pdf", contentType: "application/pdf", byteSize: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
  const repository = {
    claim: vi.fn(async (): Promise<unknown> => claim), leaseIsCurrent: vi.fn(async (): Promise<unknown> => true),
    finish: vi.fn(async (_claim: OriginalVerificationClaim, completion: OriginalVerificationCompletion): Promise<unknown> => ({
      jobId: claim.jobId, accessId: claim.accessId, state: completion.state, revision: 3, outcomeCode: "recorded",
    })),
  };
  const store = { readOriginal: vi.fn<OriginalVerificationStore["readOriginal"]>(async () => bytes) };
  return { bytes, claim, repository, store, run: () => runOriginalVerification(claim.jobId, { repository, store }) };
}
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("original verification worker source proposal, synthetic ports only", () => {
  test("hashes actual bytes and records exact manifest without approval or delivery claims", async () => {
    const f = fixture();
    await expect(f.run()).resolves.toEqual({ outcome: "recorded", jobId: f.claim.jobId, state: "verified" });
    expect(f.repository.leaseIsCurrent).toHaveBeenCalledTimes(2);
    const completion = f.repository.finish.mock.calls[0]![1];
    expect(completion).toEqual({ state: "verified", sha256: f.claim.sha256, byteSize: f.bytes.length,
      contentType: f.claim.contentType, readStartedAt: expect.any(String), bytesVerifiedAt: expect.any(String) });
    expect(Object.keys(completion).sort()).toEqual(["byteSize", "bytesVerifiedAt", "contentType", "readStartedAt", "sha256", "state"]);
  });
  test("does not read a busy job", async () => {
    const f = fixture(); f.repository.claim.mockResolvedValue(null);
    await expect(f.run()).resolves.toEqual({ outcome: "busy" }); expect(f.store.readOriginal).not.toHaveBeenCalled();
  });
  test.each(["wrong_job", "extra_path", "future_claim", "long_lease", "bad_size", "bad_revision", "expired", "claim_error"])(
    "denies claim before storage: %s", async (kind) => {
      const f = fixture();
      if (kind === "wrong_job") f.repository.claim.mockResolvedValue({ ...f.claim, jobId: randomUUID() });
      if (kind === "extra_path") f.repository.claim.mockResolvedValue({ ...f.claim, objectPath: "another/version" });
      if (kind === "future_claim") f.repository.claim.mockResolvedValue({ ...f.claim, claimedAt: new Date(Date.now() + 60_000).toISOString() });
      if (kind === "long_lease") f.repository.claim.mockResolvedValue({ ...f.claim, leaseExpiresAt: new Date(Date.now() + 120_000).toISOString() });
      if (kind === "bad_size") f.repository.claim.mockResolvedValue({ ...f.claim, byteSize: 25_000_001 });
      if (kind === "bad_revision") f.repository.claim.mockResolvedValue({ ...f.claim, revision: 3 });
      if (kind === "expired") f.repository.claim.mockResolvedValue({ ...f.claim, leaseExpiresAt: new Date(Date.now() - 1).toISOString() });
      if (kind === "claim_error") f.repository.claim.mockRejectedValue(new Error("private database credentials"));
      expect((await f.run()).outcome).not.toBe("recorded");
      expect(f.store.readOriginal).not.toHaveBeenCalled(); expect(f.repository.finish).not.toHaveBeenCalled();
    });
  test.each([false, "true"])("requires a current Boolean lease: %s", async (value) => {
    const f = fixture(); f.repository.leaseIsCurrent.mockResolvedValue(value);
    expect((await f.run()).outcome).not.toBe("recorded"); expect(f.store.readOriginal).not.toHaveBeenCalled();
  });
  test("does not finish after authority changes during the read", async () => {
    const f = fixture(); f.repository.leaseIsCurrent.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await expect(f.run()).resolves.toEqual({ outcome: "lease_lost" }); expect(f.repository.finish).not.toHaveBeenCalled();
  });
  test.each(["wrong_hash", "invalid_format", "typed_integrity", "storage_error"])("records only a safe failure: %s", async (kind) => {
    const f = fixture();
    if (kind === "wrong_hash") f.store.readOriginal.mockResolvedValue(Buffer.from("%PDF-1.7\nChanged immutable bytes"));
    if (kind === "invalid_format") f.store.readOriginal.mockResolvedValue(Buffer.from("Executable input"));
    if (kind === "typed_integrity") f.store.readOriginal.mockRejectedValue(new OriginalVerificationReadError("INTEGRITY"));
    if (kind === "storage_error") f.store.readOriginal.mockRejectedValue(new Error("private URL and token"));
    await expect(f.run()).resolves.toEqual({ outcome: "recorded", state: "failed", jobId: f.claim.jobId });
    expect(f.repository.finish.mock.calls[0]![1]).toEqual({ state: "failed", failureCode:
      kind === "invalid_format" ? "invalid_document" : kind === "storage_error" ? "storage_unavailable" : "document_integrity" });
  });
  test("aborts a delayed read at the exact lease deadline without completion", async () => {
    vi.useFakeTimers(); const f = fixture();
    f.store.readOriginal.mockImplementation(async (_claim, signal) => new Promise<Uint8Array>((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    }));
    const result = f.run(); await vi.advanceTimersByTimeAsync(30_001);
    await expect(result).resolves.toEqual({ outcome: "lease_lost" }); expect(f.repository.finish).not.toHaveBeenCalled();
  });
  test.each(["throw", "wrong_job", "wrong_access", "wrong_revision", "extra", "wrong_state"])(
    "does not retry an uncertain completion: %s", async (kind) => {
      const f = fixture();
      const receipt: Record<string, unknown> = { jobId: f.claim.jobId, accessId: f.claim.accessId, state: "verified", revision: 3, outcomeCode: "recorded" };
      if (kind === "throw") f.repository.finish.mockRejectedValue(new Error("private connection details"));
      else {
        if (kind === "wrong_job") receipt.jobId = randomUUID();
        if (kind === "wrong_access") receipt.accessId = randomUUID();
        if (kind === "wrong_revision") receipt.revision = 4;
        if (kind === "extra") receipt.privateToken = "private";
        if (kind === "wrong_state") receipt.state = "failed";
        f.repository.finish.mockResolvedValue(receipt);
      }
      await expect(f.run()).resolves.toEqual({ outcome: "failed", code: "recording_unknown" });
      expect(f.repository.finish).toHaveBeenCalledOnce(); expect(f.store.readOriginal).toHaveBeenCalledOnce();
    });
  test("treats a refused completion as lost authority", async () => {
    const f = fixture(); f.repository.finish.mockResolvedValue(null);
    await expect(f.run()).resolves.toEqual({ outcome: "lease_lost" }); expect(f.repository.finish).toHaveBeenCalledOnce();
  });
});
