import { z } from "zod";
import { workspaceDocumentFileManifestSchema, workspaceDocumentUploadCompletionSchema } from "./workspace-document-upload";
const uuid = z.uuid().transform(value => value.toLowerCase());
export const financeDocumentSourceSchema = z.discriminatedUnion("sourceClass", [
  z.strictObject({ sourceClass: z.literal("agreement"), vendorOrganizationId: uuid }),
  z.strictObject({ sourceClass: z.literal("signed_contract"), vendorOrganizationId: uuid,
    contractId: uuid, handoffId: uuid, dealId: uuid }),
]);
export const financeDocumentUploadPreparationSchema = workspaceDocumentFileManifestSchema.safeExtend({
  organizationId: uuid, documentId: uuid, versionId: uuid, expectedVersion: z.number().int().min(0).max(99_999),
  source: financeDocumentSourceSchema, correlationId: uuid, idempotencyKey: uuid,
});
export const financeDocumentUploadCompletionSchema = workspaceDocumentUploadCompletionSchema;
export const financeDocumentReservationResultSchema = z.strictObject({ organizationId: uuid, documentId: uuid, versionId: uuid,
  version: z.number().int().min(1).max(100_000), state: z.literal("received"), revision: z.literal(1),
  correlationId: uuid, outcomeCode: z.enum(["recorded", "replayed"]) });
export const financeDocumentCompletionResultSchema = z.strictObject({ organizationId: uuid, documentId: uuid, versionId: uuid,
  state: z.literal("quarantined"), revision: z.literal(2), correlationId: uuid, outcomeCode: z.enum(["recorded", "replayed"]) });
export type FinanceDocumentSource = z.output<typeof financeDocumentSourceSchema>;
