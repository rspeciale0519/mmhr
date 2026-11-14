import "server-only";
import { z } from "zod";
import { AuthorizationError, requirePermission, type AuthorizationOptions } from "@/server/auth/authorization";

const uuid = z.uuid().transform(value => value.toLowerCase());
const timestamp = z.iso.datetime({ offset: true });
const money = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const base = { organizationId: uuid, actorIdentityId: uuid, correlationId: uuid, idempotencyKey: uuid };
const structureSchema = z.strictObject({
  action: z.literal("create_structure"), ...base, structureId: uuid, vendorOrganizationId: uuid,
  effectiveFrom: timestamp, effectiveTo: timestamp.nullable(), calculationType: z.enum(["contract_value_rate", "flat_amount"]),
  rateBasisPoints: z.number().int().min(0).max(10000).nullable(), flatAmountMinorUnits: money.nullable(),
  currency: z.string().regex(/^[A-Z]{3}$/), sourceAgreementId: uuid, revision: z.number().int().positive(),
}).superRefine((value, context) => {
  if (value.effectiveTo !== null && Date.parse(value.effectiveTo) < Date.parse(value.effectiveFrom)) {
    context.addIssue({ code: "custom", path: ["effectiveTo"], message: "Effective end cannot precede effective start" });
  }
  if (value.organizationId === value.vendorOrganizationId) {
    context.addIssue({ code: "custom", path: ["vendorOrganizationId"], message: "Vendor must have a separate organization" });
  }
  if (value.calculationType === "contract_value_rate" && (value.rateBasisPoints === null || value.flatAmountMinorUnits !== null)) {
    context.addIssue({ code: "custom", path: ["rateBasisPoints"], message: "Rate structures require only rateBasisPoints" });
  }
  if (value.calculationType === "flat_amount" && (value.rateBasisPoints !== null || value.flatAmountMinorUnits === null)) {
    context.addIssue({ code: "custom", path: ["flatAmountMinorUnits"], message: "Flat structures require only flatAmountMinorUnits" });
  }
});
export const commissionSchema = z.discriminatedUnion("action", [structureSchema, z.strictObject({
  action: z.literal("create_event"), ...base, eventId: uuid, contractId: uuid, dealId: uuid, vendorOrganizationId: uuid,
  structureId: uuid, eventIdempotencyKey: uuid, signedAt: timestamp, currency: z.string().regex(/^[A-Z]{3}$/),
  contractValueMinorUnits: money, commissionAmountMinorUnits: money, calculationRevision: z.number().int().positive(),
})]);
const resultSchema = z.strictObject({ entityId: uuid, organizationId: uuid, status: z.enum(["active", "pending_review"]),
  outcomeCode: z.enum(["recorded", "replayed"]), correlationId: uuid });

export async function recordCommission(input: unknown, options: AuthorizationOptions = {}) {
  const command = commissionSchema.safeParse(input);
  if (!command.success) throw new Error("Invalid commission input");
  try {
    const context = await requirePermission("finance.manage", { kind: "organization", organizationId: command.data.organizationId },
      { ...options, correlationId: command.data.correlationId });
    if (context.scope.kind !== "organization" || context.scope.organizationId !== command.data.organizationId
      || context.identityId !== command.data.actorIdentityId || context.correlationId !== command.data.correlationId) {
      throw new AuthorizationError();
    }
    const response = await context.supabase.rpc("mmhr_record_commission", { payload: command.data,
      correlation_id: command.data.correlationId, idempotency_key: command.data.idempotencyKey });
    if (response.error) throw new Error("Commission unavailable");
    const result = resultSchema.safeParse(response.data);
    const entityId = command.data.action === "create_structure" ? command.data.structureId : command.data.eventId;
    const status = command.data.action === "create_structure" ? "active" : "pending_review";
    // A creation retry must identify this original result, even after later financial actions.
    if (!result.success || result.data.organizationId !== command.data.organizationId
      || result.data.correlationId !== command.data.correlationId || result.data.entityId !== entityId || result.data.status !== status) {
      throw new Error("Invalid commission result");
    }
    return result.data;
  } catch (error) {
    if (error instanceof AuthorizationError) throw error;
    if (error instanceof Error && (error.message === "Commission unavailable" || error.message === "Invalid commission result")) throw error;
    throw new Error("Commission unavailable");
  }
}
