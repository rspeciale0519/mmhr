import { z } from "zod";
import { workspaceDocumentRowSchema } from "./workspace-documents";
import { securityReasonSchema } from "./security-reason";
const uuid=z.uuid().transform(value=>value.toLowerCase());
const scope={organizationId:uuid,documentId:uuid,versionId:uuid,correlationId:uuid};
export const financeDocumentRecoveryReadSchema=z.strictObject(scope);
export const financeDocumentRecoveryPageSchema=z.strictObject({organizationId:uuid,correlationId:uuid,
  document:workspaceDocumentRowSchema.safeExtend({isCurrent:z.literal(true),state:z.literal("received"),revision:z.literal(1),failureCode:z.null()}),
  reservationCorrelationId:uuid,sha256:z.string().regex(/^[0-9a-f]{64}$/),reservationExpiresAt:z.iso.datetime({offset:true}),
  canResume:z.boolean(),canAbandon:z.boolean()}).refine(page=>Date.parse(page.reservationExpiresAt)-Date.parse(page.document.createdAt)===600_000
    &&(!page.canResume||page.canAbandon),"Invalid finance upload recovery");
export const financeDocumentAbandonSchema=z.strictObject({...scope,expectedRevision:z.literal(1),idempotencyKey:uuid,reason:securityReasonSchema});
export const financeDocumentAbandonResultSchema=z.strictObject({...scope,action:z.literal("abandon_upload"),state:z.literal("rejected"),
  revision:z.literal(2),outcomeCode:z.enum(["recorded","replayed"])});
export type FinanceDocumentRecoveryPage=z.output<typeof financeDocumentRecoveryPageSchema>;
export type FinanceDocumentAbandon=z.output<typeof financeDocumentAbandonSchema>;
