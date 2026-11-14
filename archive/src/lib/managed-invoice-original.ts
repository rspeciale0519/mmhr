import { z } from "zod";
import { financeSourceReferenceSchema } from "@/lib/managed-finance-workflow";

const uuid = z.uuid().transform(value => value.toLowerCase());
export const managedInvoiceOriginalRequestSchema = z.strictObject({ organizationId: uuid,
  commissionEventId: uuid, invoiceId: uuid, preparationId: uuid, source: financeSourceReferenceSchema,
  expectedRevision: z.number().int().min(1).max(2_147_483_646), correlationId: uuid, idempotencyKey: uuid });
export type ManagedInvoiceOriginalRequest = z.output<typeof managedInvoiceOriginalRequestSchema>;
