import "server-only";
import { z } from "zod";
import { AuthorizationError, requirePermission, type AuthorizationOptions } from "@/server/auth/authorization";

const uuid = z.uuid().transform((value) => value.toLowerCase());
const timestamp = z.iso.datetime({ offset: true });
const statuses = ["upcoming", "in_review", "at_risk", "renewed", "replaced", "expanded", "cancelled"] as const;
const base = { organizationId: uuid, actorIdentityId: uuid, correlationId: uuid, idempotencyKey: uuid, renewalId: uuid };

export const renewalCommandSchema = z.discriminatedUnion("action", [
  z.strictObject({ ...base, action: z.literal("create"), contractId: uuid, sourceDealId: uuid, ownerIdentityId: uuid, contractStartAt: timestamp, contractEndAt: timestamp, renewalWindowStartAt: timestamp, renewalWindowEndAt: timestamp, linkedFollowOnDealId: uuid.optional(), nextActionAt: timestamp.optional() }),
  z.strictObject({ ...base, action: z.literal("transition"), fromStatus: z.enum(statuses), toStatus: z.enum(statuses), expectedRevision: z.number().int().positive(), occurredAt: timestamp, reason: z.string().trim().min(1).max(2_000), approvalReference: uuid.nullable(), linkedFollowOnDealId: uuid.optional() }),
]);

const resultSchema = z.strictObject({ renewalId: uuid, organizationId: uuid, status: z.string().optional(), revision: z.number().int().positive().optional(), outcomeCode: z.enum(["recorded", "replayed"]), correlationId: uuid });

export async function recordRenewal(input: unknown, options: AuthorizationOptions = {}) {
  const command = renewalCommandSchema.safeParse(input);
  if (!command.success) throw new Error("Invalid renewal input");
  try {
    const context = await requirePermission("workspace.access", { kind: "organization", organizationId: command.data.organizationId }, options);
    if (context.scope.kind !== "organization" || context.scope.organizationId !== command.data.organizationId || context.identityId !== command.data.actorIdentityId) throw new AuthorizationError();
    const response = await context.supabase.rpc("mmhr_record_renewal", { payload: command.data, correlation_id: command.data.correlationId, idempotency_key: command.data.idempotencyKey });
    if (response.error) throw new Error("Renewal unavailable");
    const result = resultSchema.safeParse(response.data);
    if (!result.success || result.data.organizationId !== command.data.organizationId || result.data.correlationId !== command.data.correlationId) throw new Error("Invalid renewal result");
    return result.data;
  } catch (error) {
    if (error instanceof AuthorizationError) throw error;
    if (error instanceof Error && (error.message === "Renewal unavailable" || error.message === "Invalid renewal result")) throw error;
    throw new Error("Renewal unavailable");
  }
}
