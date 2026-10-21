import { z } from "zod";
import { financeDocumentSourceSchema } from "@/lib/finance-document-upload";
import { workspaceDocumentRowSchema } from "@/lib/workspace-documents";
import { financeSourceReferenceSchema } from "./managed-finance-workflow";

const uuid = z.uuid().transform(value => value.toLowerCase());
const label = z.string().trim().min(1).max(500).refine(value => !/[\x00-\x1f\x7f-\x9f]/.test(value));
export const managedFinanceOriginalChoicesSchema = z.strictObject({ organizationId: uuid, correlationId: uuid,
  source: financeDocumentSourceSchema, afterVersionId: uuid.optional() });
export const managedFinanceOriginalChoicesPageSchema = z.strictObject({ organizationId: uuid, correlationId: uuid,
  source: financeDocumentSourceSchema, items: z.array(z.strictObject({ original: financeSourceReferenceSchema,
    document: workspaceDocumentRowSchema.safeExtend({ isCurrent: z.literal(true), state: z.literal("approved"), failureCode: z.null() }),
    vendorLabel: label, dealLabel: label.nullable() })).max(25), nextCursor: uuid.nullable() });

export function verifyManagedFinanceOriginalChoices(value: unknown, request: unknown) {
  const input = managedFinanceOriginalChoicesSchema.parse(request), output = managedFinanceOriginalChoicesPageSchema.parse(value);
  if (output.organizationId !== input.organizationId || output.correlationId !== input.correlationId
    || JSON.stringify(output.source) !== JSON.stringify(input.source)) throw new Error("Invalid finance original choices");
  let previous = input.afterVersionId;
  for (const item of output.items) {
    if (item.original.organizationId !== input.organizationId || item.original.documentId !== item.document.documentId
      || item.original.versionId !== item.document.versionId || previous && item.original.versionId <= previous
      || (input.source.sourceClass === "agreement") !== (item.dealLabel === null)) {
      throw new Error("Invalid finance original binding");
    }
    previous = item.original.versionId;
  }
  if (output.nextCursor !== null && (output.items.length !== 25 || output.nextCursor !== previous)) {
    throw new Error("Invalid finance original cursor");
  }
  return output;
}
