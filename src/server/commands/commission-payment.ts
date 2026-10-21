import "server-only";
import { z } from "zod";
import { AuthorizationError, requirePermission, type AuthorizationOptions } from "@/server/auth/authorization";

const uuid = z.uuid().transform(value => value.toLowerCase());
export const commissionPaymentSchema = z.strictObject({
  paymentId: uuid, commissionEventId: uuid, organizationId: uuid, actorIdentityId: uuid,
  amountMinorUnits: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  receivedAt: z.iso.datetime({ offset: true }), state: z.enum(["received", "reversed"]),
  correlationId: uuid, idempotencyKey: uuid,
});
const resultSchema = z.strictObject({
  paymentId: uuid, commissionEventId: uuid, organizationId: uuid,
  eventState: z.enum(["pending_review", "approved", "invoiced", "partially_paid", "paid", "disputed", "adjusted"]),
  outcomeCode: z.enum(["recorded", "replayed"]), correlationId: uuid,
});

export async function recordCommissionPayment(input: unknown, options: AuthorizationOptions = {}) {
  const command = commissionPaymentSchema.safeParse(input);
  if (!command.success) throw new Error("Invalid payment input");
  try {
    const context = await requirePermission("finance.manage", { kind: "organization", organizationId: command.data.organizationId },
      { ...options, correlationId: command.data.correlationId });
    if (context.scope.kind !== "organization" || context.scope.organizationId !== command.data.organizationId
      || context.identityId !== command.data.actorIdentityId || context.correlationId !== command.data.correlationId) {
      throw new AuthorizationError();
    }
    const response = await context.supabase.rpc("mmhr_record_commission_payment", { payload: command.data,
      correlation_id: command.data.correlationId, idempotency_key: command.data.idempotencyKey });
    if (response.error) throw new Error("Payment unavailable");
    const result = resultSchema.safeParse(response.data);
    if (!result.success || result.data.organizationId !== command.data.organizationId
      || result.data.correlationId !== command.data.correlationId || result.data.paymentId !== command.data.paymentId
      || result.data.commissionEventId !== command.data.commissionEventId
      || (command.data.state === "received" && !["partially_paid", "paid"].includes(result.data.eventState))) {
      throw new Error("Invalid payment result");
    }
    return result.data;
  } catch (error) {
    if (error instanceof AuthorizationError) throw error;
    if (error instanceof Error && (error.message === "Payment unavailable" || error.message === "Invalid payment result")) throw error;
    throw new Error("Payment unavailable");
  }
}
