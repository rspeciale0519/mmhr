import "server-only";
import { z } from "zod";
import { AuthorizationError, requirePermission, type AuthorizationOptions } from "@/server/auth/authorization";
const uuid = z.uuid().transform((value) => value.toLowerCase());
const timestamp = z.iso.datetime({ offset: true });
const reference = z.string().trim().min(1).max(500).regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,499}$/);
const base = { demoId: uuid, organizationId: uuid, actorIdentityId: uuid, correlationId: uuid, idempotencyKey: uuid };
export const demoRoundSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("create"), ...base, dealId: uuid, customerOrganizationId: uuid, vendorOrganizationId: uuid, requestedByIdentityId: uuid, requestedAt: timestamp, status: z.literal("requested"), scheduledStartAt: z.null(), scheduledEndAt: z.null(), meetingReference: z.null() }),
  z.strictObject({ action: z.literal("transition"), ...base, fromStatus: z.enum(["requested","scheduled","completed","cancelled","no_show"]), toStatus: z.enum(["scheduled","completed","cancelled","no_show"]), expectedRevision: z.number().int().min(1), occurredAt: timestamp, reason: z.string().trim().min(1).max(1000), scheduledStartAt: timestamp.nullable(), scheduledEndAt: timestamp.nullable(), meetingReference: reference.nullable() }),
  z.strictObject({ action: z.literal("feedback"), ...base, feedbackId: uuid, score: z.number().int().min(1).max(5), feedback: z.string().trim().min(1).max(5000), evidenceReferences: z.array(z.unknown()).max(50) }),
]);
const resultSchema = z.strictObject({ demoId: uuid, organizationId: uuid, status: z.enum(["requested","scheduled","completed","cancelled","no_show"]), revision: z.number().int().positive(), outcomeCode: z.enum(["recorded","replayed"]), correlationId: uuid });
export async function recordDemoRound(input: unknown, options: AuthorizationOptions = {}) {
  const command = demoRoundSchema.safeParse(input); if (!command.success) throw new Error("Invalid demo input");
  try { const context = await requirePermission("workspace.access", { kind: "organization", organizationId: command.data.organizationId }, options); if (context.scope.kind !== "organization" || context.scope.organizationId !== command.data.organizationId || context.identityId !== command.data.actorIdentityId) throw new AuthorizationError(); const response = await context.supabase.rpc("mmhr_record_demo_round", { payload: command.data, correlation_id: command.data.correlationId, idempotency_key: command.data.idempotencyKey }); if (response.error) throw new Error("Demo unavailable"); const result = resultSchema.safeParse(response.data); if (!result.success || result.data.demoId !== command.data.demoId || result.data.organizationId !== command.data.organizationId || result.data.correlationId !== command.data.correlationId) throw new Error("Invalid demo result"); return result.data; } catch (error) { if (error instanceof AuthorizationError) throw error; if (error instanceof Error && (error.message === "Demo unavailable" || error.message === "Invalid demo result")) throw error; throw new Error("Demo unavailable"); }
}
