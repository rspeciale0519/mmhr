import { z } from "zod";
import { workspaceDocumentRowSchema as financeDocumentRowSchema } from "./workspace-documents";
import { securityReasonSchema } from "./security-reason";

const uuid = z.uuid().transform((value) => value.toLowerCase());
const revision = z.number().int().min(1).max(2_147_483_646);
const instant = z.iso.datetime({ offset: true });
const scope = { organizationId: uuid, documentId: uuid, versionId: uuid, correlationId: uuid };
const request = { ...scope, expectedRevision: revision, idempotencyKey: uuid };
const review = { ...request, reason: securityReasonSchema,
reviewReference: z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,499}$/) };

export const financeDocumentReviewReadSchema = z.strictObject(scope);
export const financeDocumentReviewSchema = z.discriminatedUnion("action", [
  z.strictObject({ ...review, action: z.literal("begin_review") }),
  z.strictObject({ ...review, action: z.literal("approve"), reviewedAccessId: uuid, contentsReviewed: z.literal(true) }),
  z.strictObject({ ...review, action: z.literal("reject"), reviewedAccessId: uuid, contentsReviewed: z.literal(true) }),
]);
export const financeDocumentReviewPageSchema = z.strictObject({ organizationId: uuid, correlationId: uuid,
  document: financeDocumentRowSchema, canReview: z.boolean() });
export const financeDocumentReviewResultSchema = z.strictObject({ ...scope, action: z.enum(["begin_review", "approve", "reject"]),
  state: z.enum(["needs_review", "approved", "rejected"]), revision: z.number().int().min(1).max(2_147_483_647), outcomeCode: z.enum(["recorded", "replayed"]) });
export const financeDocumentAccessSchema = z.strictObject({ ...request, purpose: z.enum(["finance_review", "finance_original"]) });
export const financeDocumentAccessResultSchema = z.strictObject({ ...scope, purpose: z.enum(["finance_review", "finance_original"]),
  revision, accessId: uuid, accessToken: z.string().regex(/^[0-9a-f]{64}$/), issuedAt: instant, expiresAt: instant,
  outcomeCode: z.enum(["recorded", "replayed"]) }).refine((value) => Date.parse(value.expiresAt)-Date.parse(value.issuedAt) === 60_000);
export const financeDocumentAccessResolveSchema = z.strictObject({ organizationId: uuid, accessId: uuid,
  accessToken: z.string().regex(/^[0-9a-f]{64}$/), correlationId: uuid });
export const financeDocumentAccessManifestSchema = z.strictObject({ ...scope, accessId: uuid, revision,
  purpose: z.enum(["finance_review", "finance_original"]), expiresAt: instant, fileName: z.string().min(1).max(255)
    .refine((value) => !/[\x00-\x1f\x7f/\\]/.test(value)),
  contentType: z.enum(["application/pdf", "image/png", "image/jpeg", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]),
  byteSize: z.number().int().min(1).max(25_000_000), sha256: z.string().regex(/^[0-9a-f]{64}$/) });
export type FinanceDocumentReviewPage = z.output<typeof financeDocumentReviewPageSchema>;
export type FinanceDocumentAccessResult = z.output<typeof financeDocumentAccessResultSchema>;
export type FinanceDocumentAccessManifest = z.output<typeof financeDocumentAccessManifestSchema>;
