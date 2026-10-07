import "server-only";

import { z } from "zod";

import { inspectDocumentBytes } from "@/server/workflows/document-bytes";
import { MAX_DOCUMENT_SIZE_BYTES } from "@/server/workflows/document-safety";
import type { OriginalVerificationExecutionContext } from "./original-verification-execution";

const uuid = z.uuid().transform((value) => value.toLowerCase());
const instant = z.iso.datetime({ offset: true });
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const mime = z.enum(["application/pdf", "image/png", "image/jpeg",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]);
const claimSchema = z.strictObject({
  jobId: uuid, accessId: uuid, organizationId: uuid, documentId: uuid, versionId: uuid,
  uploadRevision: z.number().int().min(1).max(2147483646),
  purpose: z.enum(["finance_review", "finance_original"]), leaseToken: uuid, revision: z.literal(2),
  claimedAt: instant, leaseExpiresAt: instant,
  fileName: z.string().min(1).max(255).refine((value) => Buffer.byteLength(value, "utf8") <= 255),
  contentType: mime, byteSize: z.number().int().min(1).max(MAX_DOCUMENT_SIZE_BYTES), sha256: hash,
});
export type OriginalVerificationClaim = Readonly<z.output<typeof claimSchema>>;
export const originalCompletionSchema = z.discriminatedUnion("state", [
  z.strictObject({ state: z.literal("verified"), sha256: hash, byteSize: z.number().int().min(1).max(MAX_DOCUMENT_SIZE_BYTES),
    contentType: mime, readStartedAt: instant, bytesVerifiedAt: instant }),
  z.strictObject({ state: z.literal("failed"), failureCode: z.enum(["storage_unavailable", "document_integrity", "invalid_document"]) }),
]);
export type OriginalVerificationCompletion = Readonly<z.output<typeof originalCompletionSchema>>;
export interface OriginalVerificationRepository {
  claim(jobId: string, context?: OriginalVerificationExecutionContext): Promise<unknown>;
  leaseIsCurrent(claim: OriginalVerificationClaim, context?: OriginalVerificationExecutionContext): Promise<unknown>;
  finish(claim: OriginalVerificationClaim, completion: OriginalVerificationCompletion, context?: OriginalVerificationExecutionContext): Promise<unknown>;
}
export interface OriginalVerificationStore {
  readOriginal(claim: OriginalVerificationClaim, signal: AbortSignal): Promise<Uint8Array>;
}
export class OriginalVerificationReadError extends Error {
  constructor(readonly code: "UNAVAILABLE" | "INTEGRITY") {
    super("Original verification read failed"); this.name = "OriginalVerificationReadError";
  }
}
const receiptSchema = z.strictObject({ jobId: uuid, accessId: uuid, state: z.enum(["verified", "failed"]),
  revision: z.literal(3), outcomeCode: z.enum(["recorded", "replayed"]) });
export type OriginalVerificationResult =
  | Readonly<{ outcome: "busy" | "lease_lost" }>
  | Readonly<{ outcome: "recorded"; jobId: string; state: "verified" | "failed" }>
  | Readonly<{ outcome: "failed"; code: "invalid_claim" | "claim_unavailable" | "lease_unavailable" | "recording_unknown" }>;

/** SQL owns authority. This worker records actual byte checks, never delivery or human reading. */
export async function runOriginalVerification(jobId: string, dependencies: {
  repository: OriginalVerificationRepository; store: OriginalVerificationStore; signal?: AbortSignal;
}): Promise<OriginalVerificationResult> {
  const requested = uuid.safeParse(jobId);
  if (!requested.success) return { outcome: "failed", code: "invalid_claim" };
  const { repository, store } = dependencies;
  let raw: unknown;
  try { raw = await repository.claim(requested.data, { signal: dependencies.signal }); }
  catch { return { outcome: "failed", code: "claim_unavailable" }; }
  if (raw === null) return { outcome: "busy" };
  const parsed = claimSchema.safeParse(raw);
  const now = Date.now();
  if (!parsed.success || parsed.data.jobId !== requested.data
    || Date.parse(parsed.data.claimedAt) > now
    || Date.parse(parsed.data.leaseExpiresAt) > Date.parse(parsed.data.claimedAt) + 60_000) {
    return { outcome: "failed", code: "invalid_claim" };
  }
  const claim = Object.freeze(parsed.data);
  const deadline = Date.parse(claim.leaseExpiresAt);
  if (deadline <= now || deadline <= Date.parse(claim.claimedAt)) return { outcome: "lease_lost" };
  const controller = new AbortController();
  const signal = dependencies.signal ? AbortSignal.any([controller.signal, dependencies.signal]) : controller.signal;
  const timer = setTimeout(() => controller.abort(), deadline - now);
  async function current(): Promise<boolean> {
    if (signal.aborted || Date.now() >= deadline) return false;
    const value = await repository.leaseIsCurrent(claim, { signal, deadlineAt: deadline });
    if (typeof value !== "boolean") throw new Error("Invalid original verification lease response");
    return value && !signal.aborted && Date.now() < deadline;
  }
  async function finish(completion: OriginalVerificationCompletion): Promise<OriginalVerificationResult> {
    if (signal.aborted || Date.now() >= deadline) return { outcome: "lease_lost" };
    try {
      const result = await repository.finish(claim, Object.freeze(completion), { signal, deadlineAt: deadline });
      if (result === null) return { outcome: "lease_lost" };
      const receipt = receiptSchema.safeParse(result);
      if (!receipt.success || receipt.data.jobId !== claim.jobId || receipt.data.accessId !== claim.accessId
        || receipt.data.state !== completion.state) return { outcome: "failed", code: "recording_unknown" };
      return { outcome: "recorded", jobId: claim.jobId, state: receipt.data.state };
    } catch { return { outcome: "failed", code: "recording_unknown" }; }
  }
  try {
    try { if (!await current()) return { outcome: "lease_lost" }; }
    catch { return { outcome: "failed", code: "lease_unavailable" }; }
    const readStartedAt = new Date().toISOString();
    let bytes: Uint8Array;
    try { bytes = await store.readOriginal(claim, signal); }
    catch (error) {
      if (signal.aborted || Date.now() >= deadline) return { outcome: "lease_lost" };
      return await finish({ state: "failed", failureCode: error instanceof OriginalVerificationReadError && error.code === "INTEGRITY"
        ? "document_integrity" : "storage_unavailable" });
    }
    if (signal.aborted || Date.now() >= deadline) return { outcome: "lease_lost" };
    const inspected = inspectDocumentBytes({ fileName: claim.fileName, declaredMimeType: claim.contentType }, bytes);
    if (!inspected.ok) return await finish({ state: "failed", failureCode: "invalid_document" });
    if (inspected.document.sha256 !== claim.sha256 || inspected.document.byteSize !== claim.byteSize
      || inspected.document.contentType !== claim.contentType) return await finish({ state: "failed", failureCode: "document_integrity" });
    const bytesVerifiedAt = new Date().toISOString();
    if (Date.parse(readStartedAt) < Date.parse(claim.claimedAt) || Date.parse(bytesVerifiedAt) < Date.parse(readStartedAt)) {
      return { outcome: "lease_lost" };
    }
    try { if (!await current()) return { outcome: "lease_lost" }; }
    catch { return { outcome: "failed", code: "lease_unavailable" }; }
    return await finish({ state: "verified", sha256: inspected.document.sha256, byteSize: inspected.document.byteSize,
      contentType: claim.contentType, readStartedAt, bytesVerifiedAt });
  } finally { clearTimeout(timer); controller.abort(); }
}
