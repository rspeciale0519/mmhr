import { createHash, randomUUID } from "node:crypto";
import { describe, expect, test, vi } from "vitest";

import { runDocumentScan, type DocumentScanClaim, type DocumentScanCompletion } from "./document-scan-worker";
import { DocumentStoreError } from "./document-store";

function fixture() {
  const bytes = Buffer.from("%PDF-1.7\nSynthetic worker input\n%%EOF");
  const claim: DocumentScanClaim = { organizationId: randomUUID(), documentId: randomUUID(), versionId: randomUUID(),
    jobId: randomUUID(), leaseToken: randomUUID(), revision: 3, correlationId: randomUUID(),
    leaseExpiresAt: new Date(Date.now() + 120_000).toISOString(), fileName: "synthetic.pdf", contentType: "application/pdf",
    byteSize: bytes.byteLength, sha256: createHash("sha256").update(bytes).digest("hex") };
  const clean = { versionId: claim.versionId, sha256: claim.sha256, state: "clean" as const, scanner: "clamav" as const,
    scannerVersion: "1.4.6", signatureVersion: 28139, signatureUpdatedAt: new Date(Date.now() - 3_600_000).toISOString(),
    scannedAt: new Date().toISOString(), failureCode: null };
  const repository = { claim: vi.fn(async (): Promise<unknown> => claim), leaseIsCurrent: vi.fn(async (): Promise<unknown> => true),
    finish: vi.fn(async (_claim: DocumentScanClaim, completion: DocumentScanCompletion): Promise<unknown> => ({
      versionId: claim.versionId, leaseToken: claim.leaseToken, revision: 4, state: completion.state, outcomeCode: "recorded" })) };
  const store = { readForScan: vi.fn(async () => bytes) };
  const scanner = { scan: vi.fn(async () => clean) };
  return { bytes, claim, clean, repository, store, scanner, run: () => runDocumentScan(claim.versionId, { repository, store, scanner }) };
}

describe("leased document scan processing", () => {
  test("verifies scoped immutable bytes and records clean evidence without approving or extracting", async () => {
    const f = fixture();
    await expect(f.run()).resolves.toEqual({ outcome: "recorded", state: "ready", versionId: f.claim.versionId });
    expect(f.repository.leaseIsCurrent).toHaveBeenCalledTimes(2);
    expect(f.store.readForScan).toHaveBeenCalledWith(expect.objectContaining({ organizationId: f.claim.organizationId,
      documentId: f.claim.documentId, versionId: f.claim.versionId,
      objectPath: `${f.claim.organizationId}/${f.claim.documentId}/${f.claim.versionId}`, state: "quarantined" }));
    expect(f.scanner.scan).toHaveBeenCalledWith({ versionId: f.claim.versionId, expectedSha256: f.claim.sha256, bytes: new Uint8Array(f.bytes) });
    expect(f.repository.finish).toHaveBeenCalledWith(f.claim, { state: "ready", failureCode: null, scanEvidence: f.clean });
  });

  test("does not access storage or scanner when another worker owns the job", async () => {
    const f = fixture(); f.repository.claim.mockResolvedValue(null);
    await expect(f.run()).resolves.toEqual({ outcome: "busy" });
    expect(f.store.readForScan).not.toHaveBeenCalled(); expect(f.scanner.scan).not.toHaveBeenCalled();
  });

  test.each(["scope", "expired", "excessive", "invalid", "unavailable"])("blocks invalid or expired claims before file access: %s", async (kind) => {
    const f = fixture();
    if (kind === "scope") f.repository.claim.mockResolvedValue({ ...f.claim, versionId: randomUUID() });
    if (kind === "expired") f.repository.claim.mockResolvedValue({ ...f.claim, leaseExpiresAt: new Date(Date.now() - 1000).toISOString() });
    if (kind === "excessive") f.repository.claim.mockResolvedValue({ ...f.claim, leaseExpiresAt: new Date(Date.now() + 600_000).toISOString() });
    if (kind === "invalid") f.repository.claim.mockResolvedValue({ ...f.claim, objectPath: "other/file" });
    if (kind === "unavailable") f.repository.claim.mockRejectedValue(new Error("private connection details"));
    const result = await f.run(); expect(result.outcome).not.toBe("recorded");
    expect(JSON.stringify(result)).not.toContain("private");
    expect(f.store.readForScan).not.toHaveBeenCalled(); expect(f.scanner.scan).not.toHaveBeenCalled();
    expect(f.repository.finish).not.toHaveBeenCalled();
  });

  test("rechecks the lease after the private read and before scanning", async () => {
    const f = fixture(); f.repository.leaseIsCurrent.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await expect(f.run()).resolves.toEqual({ outcome: "lease_lost" });
    expect(f.store.readForScan).toHaveBeenCalledOnce(); expect(f.scanner.scan).not.toHaveBeenCalled();
    expect(f.repository.finish).not.toHaveBeenCalled();
  });

  test("requires an explicit boolean lease response", async () => {
    const f = fixture(); f.repository.leaseIsCurrent.mockResolvedValue("true");
    await expect(f.run()).resolves.toEqual({ outcome: "failed", code: "lease_unavailable" });
    expect(f.store.readForScan).not.toHaveBeenCalled();
  });

  test.each(["changed_bytes", "unsupported", "typed_integrity"])("rejects unsafe stored input before scanning: %s", async (kind) => {
    const f = fixture();
    if (kind === "changed_bytes") f.store.readForScan.mockResolvedValue(Buffer.from("%PDF-1.7\nChanged original"));
    if (kind === "unsupported") f.store.readForScan.mockResolvedValue(Buffer.from("Executable input"));
    if (kind === "typed_integrity") f.store.readForScan.mockRejectedValue(new DocumentStoreError("INTEGRITY", "Safe error"));
    await expect(f.run()).resolves.toMatchObject({ outcome: "recorded", state: "rejected" });
    expect(f.scanner.scan).not.toHaveBeenCalled();
    expect(f.repository.finish.mock.calls[0]![1].scanEvidence).toBeNull();
  });

  test("records a storage failure without exposing provider errors or trusting bytes", async () => {
    const f = fixture(); f.store.readForScan.mockRejectedValue(new Error("private storage URL and token"));
    await expect(f.run()).resolves.toMatchObject({ outcome: "recorded", state: "failed" });
    expect(f.repository.finish.mock.calls[0]![1]).toEqual({ state: "failed", failureCode: "storage_unavailable", scanEvidence: null });
    expect(f.scanner.scan).not.toHaveBeenCalled();
  });

  test.each(["different_version", "different_hash", "no_version", "no_signatures", "stale", "future", "unbound_failure"])("never trusts invalid clean evidence: %s", async (kind) => {
    const f = fixture(); const receipt: Record<string, unknown> = { ...f.clean };
    if (kind === "different_version") receipt.versionId = randomUUID();
    if (kind === "different_hash") receipt.sha256 = "a".repeat(64);
    if (kind === "no_version") receipt.scannerVersion = null;
    if (kind === "no_signatures") receipt.signatureVersion = null;
    if (kind === "stale") receipt.signatureUpdatedAt = new Date(Date.now() - 25 * 3_600_000).toISOString();
    if (kind === "future") receipt.scannedAt = new Date(Date.now() + 60_000).toISOString();
    if (kind === "unbound_failure") receipt.failureCode = "scanner_timeout";
    f.scanner.scan.mockResolvedValue(receipt as typeof f.clean);
    await expect(f.run()).resolves.toMatchObject({ outcome: "recorded", state: "failed" });
    expect(f.repository.finish.mock.calls[0]![1]).toEqual({ state: "failed", failureCode: "scanner_invalid", scanEvidence: null });
  });

  test("records detection as rejected while retaining quarantine and safe evidence", async () => {
    const f = fixture(); f.scanner.scan.mockResolvedValue({ ...f.clean, state: "quarantined", failureCode: "unsafe_document" } as unknown as typeof f.clean);
    await expect(f.run()).resolves.toMatchObject({ outcome: "recorded", state: "rejected" });
    expect(f.repository.finish.mock.calls[0]![1].failureCode).toBe("unsafe_document");
  });

  test("records thrown scanner failures with a safe code", async () => {
    const f = fixture(); f.scanner.scan.mockRejectedValue(new Error("private scanner details"));
    await expect(f.run()).resolves.toMatchObject({ outcome: "recorded", state: "failed" });
    expect(f.repository.finish.mock.calls[0]![1]).toEqual({ state: "failed", failureCode: "scanner_unavailable", scanEvidence: null });
  });

  test("does not report success when another worker or an expired lease wins the finish race", async () => {
    const f = fixture(); f.repository.finish.mockResolvedValue(null);
    await expect(f.run()).resolves.toEqual({ outcome: "lease_lost" }); expect(f.scanner.scan).toHaveBeenCalledOnce();
  });

  test.each(["unavailable", "wrong_lease", "wrong_version", "wrong_state", "wrong_revision"])("reports an uncertain write without a second scan or duplicate completion: %s", async (kind) => {
    const f = fixture(); const receipt = { versionId: f.claim.versionId, leaseToken: f.claim.leaseToken,
      revision: 4, state: "ready", outcomeCode: "recorded" };
    if (kind === "unavailable") f.repository.finish.mockRejectedValue(new Error("private database details"));
    else {
      if (kind === "wrong_lease") receipt.leaseToken = randomUUID();
      if (kind === "wrong_version") receipt.versionId = randomUUID();
      if (kind === "wrong_state") receipt.state = "failed";
      if (kind === "wrong_revision") receipt.revision = 5;
      f.repository.finish.mockResolvedValue(receipt);
    }
    await expect(f.run()).resolves.toEqual({ outcome: "failed", code: "recording_unknown" });
    expect(f.repository.finish).toHaveBeenCalledOnce(); expect(f.scanner.scan).toHaveBeenCalledOnce();
  });
});
