import "server-only";
import { rfpReceiptCommandSchema, rfpReceiptReadSchema, rfpReceiptResultSchema, rfpReceiptPageSchema,
  type RfpReceiptRead } from "@/lib/rfp-receipt";
import { AuthorizationError, requirePermission, type AuthorizationOptions } from "@/server/auth/authorization";

export class RfpReceiptInputError extends Error { constructor() { super("Invalid RFP receipt request"); } }
export class RfpReceiptConflictError extends Error { constructor() { super("RFP receipt status changed"); } }
async function context(input: { organizationId: string; correlationId: string }, view: RfpReceiptRead["view"], options: AuthorizationOptions) {
  const permission = view === "vendor" ? "portal.vendor.access" : view === "staff" ? "rfp.distribute" : "portal.customer.access";
  const ctx = await requirePermission(permission, { kind: "organization", organizationId: input.organizationId }, { ...options, correlationId: input.correlationId });
  if (ctx.scope.kind !== "organization" || ctx.scope.organizationId !== input.organizationId || ctx.correlationId !== input.correlationId) throw new AuthorizationError();
  if (view === "staff") {
    const staff = await requirePermission("admin.access", { kind: "platform" }, { supabase: ctx.supabase, correlationId: input.correlationId });
    if (staff.identityId !== ctx.identityId || staff.scope.kind !== "platform" || staff.assurance !== "aal2"
      || ctx.assurance !== "aal2" || staff.correlationId !== input.correlationId) throw new AuthorizationError();
  }
  return ctx;
}
function databaseError(code: string): never {
  if (code === "42501") throw new AuthorizationError();
  if (code === "22023") throw new RfpReceiptInputError();
  if (code === "40001" || code === "23505") throw new RfpReceiptConflictError();
  throw new Error("RFP receipt request unavailable");
}
export async function confirmRfpReceipt(value: unknown, options: AuthorizationOptions = {}) {
  const parsed = rfpReceiptCommandSchema.safeParse(value);
  if (!parsed.success) throw new RfpReceiptInputError();
  const input = parsed.data, ctx = await context(input, "vendor", options);
  const response = await ctx.supabase.rpc("mmhr_confirm_rfp_receipt", { payload: input,
    correlation_id: input.correlationId, idempotency_key: input.idempotencyKey });
  if (response.error) databaseError(response.error.code);
  const output = rfpReceiptResultSchema.safeParse(response.data);
  if (!output.success || output.data.organizationId !== input.organizationId || output.data.correlationId !== input.correlationId
    || output.data.confirmationId !== input.confirmationId || output.data.recipientId !== input.recipientId
    || output.data.rfpVersionId !== input.rfpVersionId) throw new Error("Invalid RFP receipt result");
  return output.data;
}
export async function getRfpReceiptStatus(value: unknown, options: AuthorizationOptions = {}) {
  const parsed = rfpReceiptReadSchema.safeParse(value);
  if (!parsed.success) throw new RfpReceiptInputError();
  const input = parsed.data, ctx = await context(input, input.view, options);
  const { correlationId, ...payload } = input;
  const response = await ctx.supabase.rpc("mmhr_get_rfp_receipt_status", { payload, correlation_id: correlationId });
  if (response.error) databaseError(response.error.code);
  const output = rfpReceiptPageSchema.safeParse(response.data);
  if (!output.success || output.data.organizationId !== input.organizationId || output.data.correlationId !== correlationId
    || output.data.view !== input.view || output.data.intakeId !== (input.view === "vendor" ? null : input.intakeId)) throw new Error("Invalid RFP receipt page");
  let previous = input.afterId;
  for (const row of output.data.items) {
    if (previous && row.recipientId <= previous || input.view !== "vendor" && row.canConfirm) throw new Error("Invalid RFP receipt page");
    previous = row.recipientId;
  }
  if (output.data.nextCursor && (output.data.items.length !== 25 || output.data.nextCursor !== previous)) throw new Error("Invalid RFP receipt cursor");
  return output.data;
}
