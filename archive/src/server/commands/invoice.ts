import "server-only";
import { z } from "zod";
import { AuthorizationError, requirePermission, type AuthorizationOptions } from "@/server/auth/authorization";
const uuid = z.uuid().transform((v) => v.toLowerCase()); const timestamp = z.iso.datetime({ offset: true }); const base = { organizationId: uuid, actorIdentityId: uuid, correlationId: uuid, idempotencyKey: uuid, invoiceId: uuid }; const identifier = z.string().trim().min(1).max(500).regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,499}$/);
const issueSchema = z.strictObject({ action: z.literal("issue"), ...base, invoiceNumber: identifier, issueDate: timestamp, dueDate: timestamp }).refine((v) => Date.parse(v.dueDate) >= Date.parse(v.issueDate), { path: ["dueDate"], message: "Due date cannot precede issue date" });
export const invoiceCommandSchema = z.discriminatedUnion("action", [z.strictObject({ action: z.literal("create"), ...base, commissionEventId: uuid, vendorOrganizationId: uuid, currency: z.string().regex(/^[A-Z]{3}$/), amountMinorUnits: z.number().int().nonnegative().max(9007199254740991), supportingDocumentReferences: z.array(identifier).max(50), createdByIdentityId: uuid }), issueSchema, z.strictObject({ action: z.literal("void"), ...base })]);
const resultSchema = z.strictObject({ invoiceId: uuid, organizationId: uuid,
  status: z.enum(["draft", "issued", "voided"]), outcomeCode: z.enum(["recorded", "replayed"]), correlationId: uuid });

export async function recordInvoice(input: unknown, options: AuthorizationOptions = {}) {
  const command = invoiceCommandSchema.safeParse(input);
  if (!command.success) throw new Error("Invalid invoice input");
  try {
    const context = await requirePermission("finance.manage", { kind: "organization", organizationId: command.data.organizationId },
      { ...options, correlationId: command.data.correlationId });
    if (context.scope.kind !== "organization" || context.scope.organizationId !== command.data.organizationId
      || context.identityId !== command.data.actorIdentityId || context.correlationId !== command.data.correlationId
      || (command.data.action === "create" && command.data.createdByIdentityId !== context.identityId)) {
      throw new AuthorizationError();
    }
    const response = await context.supabase.rpc("mmhr_record_invoice", { payload: command.data,
      correlation_id: command.data.correlationId, idempotency_key: command.data.idempotencyKey });
    if (response.error) throw new Error("Invoice unavailable");
    const result = resultSchema.safeParse(response.data);
    const status = command.data.action === "create" ? "draft" : command.data.action === "issue" ? "issued" : "voided";
    // The result must describe this action's receipt, rather than another invoice or later state.
    if (!result.success || result.data.organizationId !== command.data.organizationId
      || result.data.correlationId !== command.data.correlationId || result.data.invoiceId !== command.data.invoiceId
      || result.data.status !== status) throw new Error("Invalid invoice result");
    return result.data;
  } catch (error) {
    if (error instanceof AuthorizationError) throw error;
    if (error instanceof Error && (error.message === "Invoice unavailable" || error.message === "Invalid invoice result")) throw error;
    throw new Error("Invoice unavailable");
  }
}
