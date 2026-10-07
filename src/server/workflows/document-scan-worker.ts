import "server-only";

import { z } from "zod";

import { inspectDocumentBytes } from "./document-bytes";
import { MAX_DOCUMENT_SIZE_BYTES } from "./document-safety";
import type { DocumentScanner, DocumentScanResult } from "./document-scanner";
import { DocumentStoreError, type DocumentStore, type QuarantineObject } from "./document-store";

const uuid = z.uuid().transform((value) => value.toLowerCase());
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const mime = z.enum(["application/pdf", "image/png", "image/jpeg", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]);
const instant = z.iso.datetime({ offset: true });
const claimSchema = z.strictObject({
  organizationId: uuid, documentId: uuid, versionId: uuid, jobId: uuid, leaseToken: uuid,
  revision: z.number().int().positive(), correlationId: uuid, leaseExpiresAt: instant,
  fileName: z.string().min(1).max(255), contentType: mime,
  byteSize: z.number().int().min(1).max(MAX_DOCUMENT_SIZE_BYTES), sha256: hash,
});
export type DocumentScanClaim = Readonly<z.output<typeof claimSchema>>;
export type DocumentScanFailureCode = "storage_unavailable" | "document_integrity" | "invalid_document"
  | "scanner_invalid" | "scanner_unavailable" | NonNullable<DocumentScanResult["failureCode"]>;
export type DocumentScanCompletion = Readonly<{
  state: "ready" | "rejected" | "failed";
  failureCode: DocumentScanFailureCode | null;
  scanEvidence: DocumentScanResult | null;
}>;
export interface DocumentScanRepository {
  /** The repository verifies the restricted worker login and atomically claims a scoped job. */
  claim(versionId: string): Promise<unknown>;
  leaseIsCurrent(claim: DocumentScanClaim): Promise<unknown>;
  /** Atomically rechecks the lease, hash, revision, and job before recording evidence and history. */
  finish(claim: DocumentScanClaim, completion: DocumentScanCompletion): Promise<unknown>;
}
const scanSchema = z.strictObject({
  versionId: uuid, sha256: hash, state: z.enum(["clean", "quarantined", "failed"]), scanner: z.literal("clamav"),
  scannerVersion: z.string().regex(/^\d+\.\d+\.\d+$/).nullable(), signatureVersion: z.number().int().positive().nullable(),
  signatureUpdatedAt: instant.nullable(), scannedAt: instant,
  failureCode: z.enum(["hash_mismatch", "scanner_unavailable", "scanner_timeout", "scanner_protocol", "scanner_version",
    "signatures_stale", "scan_context_changed", "unsafe_document"]).nullable(),
});
const receiptSchema = z.strictObject({
  versionId: uuid, leaseToken: uuid, revision: z.number().int().positive(),
  state: z.enum(["ready", "rejected", "failed"]), outcomeCode: z.enum(["recorded", "replayed"]),
});
export type DocumentScanWorkerResult =
  | Readonly<{ outcome: "busy" | "lease_lost" }>
  | Readonly<{ outcome: "recorded"; state: DocumentScanCompletion["state"]; versionId: string }>
  | Readonly<{ outcome: "failed"; code: "claim_unavailable" | "invalid_claim" | "lease_unavailable" | "recording_unknown" }>;

export async function runDocumentScan(versionId: string, dependencies: {
  repository: DocumentScanRepository; store: Pick<DocumentStore, "readForScan">; scanner: DocumentScanner;
}): Promise<DocumentScanWorkerResult> {
  const requestedId = uuid.safeParse(versionId);
  if (!requestedId.success) return { outcome: "failed", code: "invalid_claim" };
  const { repository, store, scanner } = dependencies;
  let rawClaim: unknown;
  try { rawClaim = await repository.claim(requestedId.data); }
  catch { return { outcome: "failed", code: "claim_unavailable" }; }
  if (rawClaim === null) return { outcome: "busy" };
  const parsed = claimSchema.safeParse(rawClaim);
  if (!parsed.success || parsed.data.versionId !== requestedId.data
    || Date.parse(parsed.data.leaseExpiresAt) > Date.now() + 5 * 60_000) return { outcome: "failed", code: "invalid_claim" };
  const claim = Object.freeze(parsed.data);
  async function current(): Promise<boolean> {
    if (Date.parse(claim.leaseExpiresAt) <= Date.now()) return false;
    const checked = await repository.leaseIsCurrent(claim);
    if (typeof checked !== "boolean") throw new Error("Invalid document lease response");
    return checked && Date.parse(claim.leaseExpiresAt) > Date.now();
  }
  async function finish(completion: DocumentScanCompletion): Promise<DocumentScanWorkerResult> {
    // A null receipt means another worker, revocation, or expiry won. Do not
    // turn it into a successful scan or repeat a potentially committed write.
    try {
      const raw = await repository.finish(claim, Object.freeze(completion));
      if (raw === null) return { outcome: "lease_lost" };
      const receipt = receiptSchema.safeParse(raw);
      if (!receipt.success || receipt.data.versionId !== claim.versionId || receipt.data.leaseToken !== claim.leaseToken
        || receipt.data.revision !== claim.revision + 1 || receipt.data.state !== completion.state) {
        return { outcome: "failed", code: "recording_unknown" };
      }
      return { outcome: "recorded", state: completion.state, versionId: claim.versionId };
    } catch { return { outcome: "failed", code: "recording_unknown" }; }
  }
  try { if (!await current()) return { outcome: "lease_lost" }; }
  catch { return { outcome: "failed", code: "lease_unavailable" }; }
  const objectPath = `${claim.organizationId}/${claim.documentId}/${claim.versionId}`;
  const object: QuarantineObject = Object.freeze({ organizationId: claim.organizationId, documentId: claim.documentId,
    versionId: claim.versionId, objectPath, storageReference: `quarantine://${objectPath}`, fileName: claim.fileName,
    contentType: claim.contentType, byteSize: claim.byteSize, sha256: claim.sha256, state: "quarantined" });
  let bytes: Uint8Array;
  try { bytes = await store.readForScan(object); }
  catch (error) {
    return finish(error instanceof DocumentStoreError && error.code === "INTEGRITY"
      ? { state: "rejected", failureCode: "document_integrity", scanEvidence: null }
      : { state: "failed", failureCode: "storage_unavailable", scanEvidence: null });
  }
  const inspected = inspectDocumentBytes({ fileName: claim.fileName, declaredMimeType: claim.contentType }, bytes);
  if (!inspected.ok) return finish({ state: "rejected", failureCode: "invalid_document", scanEvidence: null });
  if (inspected.document.sha256 !== claim.sha256 || inspected.document.byteSize !== claim.byteSize) {
    return finish({ state: "rejected", failureCode: "document_integrity", scanEvidence: null });
  }
  try { if (!await current()) return { outcome: "lease_lost" }; }
  catch { return { outcome: "failed", code: "lease_unavailable" }; }
  let rawScan: unknown;
  try { rawScan = await scanner.scan({ versionId: claim.versionId, expectedSha256: claim.sha256, bytes: inspected.document.copyBytes() }); }
  catch { return finish({ state: "failed", failureCode: "scanner_unavailable", scanEvidence: null }); }
  const scan = scanSchema.safeParse(rawScan);
  const now = Date.now();
  if (!scan.success || scan.data.versionId !== claim.versionId || scan.data.sha256 !== claim.sha256
    || Date.parse(scan.data.scannedAt) > now + 5_000 || Date.parse(scan.data.scannedAt) < now - 5 * 60_000
    || (scan.data.state === "clean" && (scan.data.failureCode !== null || scan.data.scannerVersion === null
      || scan.data.signatureVersion === null || scan.data.signatureUpdatedAt === null
      || Date.parse(scan.data.signatureUpdatedAt) > now + 5 * 60_000 || Date.parse(scan.data.signatureUpdatedAt) < now - 24 * 3_600_000))
    || (scan.data.state === "quarantined" && scan.data.failureCode !== "unsafe_document")
    || (scan.data.state === "failed" && (scan.data.failureCode === null || scan.data.failureCode === "unsafe_document"))) {
    return finish({ state: "failed", failureCode: "scanner_invalid", scanEvidence: null });
  }
  return finish({ state: scan.data.state === "clean" ? "ready" : scan.data.state === "quarantined" ? "rejected" : "failed",
    failureCode: scan.data.failureCode, scanEvidence: Object.freeze(scan.data) });
}
