import "server-only";
import { z } from "zod";
import { DOCUMENT_PROCESSING_PROFILE, processingContentTypeSchema, type DocumentProcessingCompletion } from "./document-parser-wire-contract";
export * from "./document-parser-wire-contract";

const uuid = z.uuid().transform(value => value.toLowerCase());
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const positiveRevision = z.number().int().min(1).max(2_147_483_646);

export const documentProcessingClaimSchema = z.strictObject({
  organizationId: uuid, documentId: uuid, versionId: uuid,
  runId: uuid, jobId: uuid, attemptId: uuid, leaseToken: uuid,
  revision: positiveRevision, leaseExpiresAt: z.iso.datetime({ offset: true }),
  correlationId: uuid, fileName: z.string().min(1).max(255),
  contentType: processingContentTypeSchema,
  byteSize: z.number().int().min(1).max(DOCUMENT_PROCESSING_PROFILE.maxInputBytes), sha256,
  scanJobId: uuid, scanEventId: uuid, scanEvidenceSha256: sha256,
  profileId: z.literal(DOCUMENT_PROCESSING_PROFILE.id),
});
export type DocumentProcessingClaim = Readonly<z.output<typeof documentProcessingClaimSchema>>;

export interface DocumentProcessingRepository {
  // The dedicated processor login and current clean immutable scan event are
  // checked in PostgreSQL. Claims never come from a browser or queue payload.
  claim(versionId: string): Promise<unknown>;
  leaseIsCurrent(claim: DocumentProcessingClaim): Promise<unknown>;
  // SQL recomputes the canonical result digest and rechecks every binding.
  // Success creates private review content, never approved search content.
  finish(claim: DocumentProcessingClaim, result: DocumentProcessingCompletion): Promise<unknown>;
}

export interface DocumentProcessingStore {
  // Operation-specific Storage authority must bind this exact processing
  // lease and machine session, independently of the scanner's read policy.
  readForProcessing(claim: DocumentProcessingClaim): Promise<Uint8Array>;
}
