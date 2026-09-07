import "server-only";
import { z } from "zod";
import { AuthorizationError, requirePermission, type AuthorizationOptions } from "@/server/auth/authorization";

const uuid = z.uuid().transform((value) => value.toLowerCase());
const timestamp = z.iso.datetime({ offset: true });
const stages = ["lead", "discovery", "evaluation", "proposal", "selection", "contracting", "won", "lost", "archived"] as const;
const statuses = ["open", "won", "lost", "archived"] as const;
const base = { organizationId: uuid, actorIdentityId: uuid, dealId: uuid, correlationId: uuid, idempotencyKey: uuid };
export const dealCommandSchema = z.discriminatedUnion("action", [
  z.strictObject({ ...base, action: z.literal("create"), vendorOrganizationId: uuid.nullable(), productId: uuid.nullable(), ownerIdentityId: uuid, stage: z.literal("lead"), status: z.literal("open"), expectedCloseAt: timestamp.nullable() }),
  z.strictObject({ ...base, action: z.literal("transition"), fromStage: z.enum(stages), toStage: z.enum(stages), fromStatus: z.enum(statuses), toStatus: z.enum(statuses), expectedRevision: z.number().int().positive(), occurredAt: timestamp, reason: z.string().trim().min(1).max(2_000) }),
]);
const resultSchema = z.strictObject({ dealId: uuid, organizationId: uuid, stage: z.string().optional(), status: z.string().optional(), revision: z.number().int().positive().optional(), outcomeCode: z.enum(["recorded", "replayed"]), correlationId: uuid });
export async function recordDeal(input: unknown, options: AuthorizationOptions = {}) {
  const command = dealCommandSchema.safeParse(input); if (!command.success) throw new Error("Invalid deal input");
  try { const context = await requirePermission("workspace.access", { kind: "organization", organizationId: command.data.organizationId }, options); if (context.scope.kind !== "organization" || context.scope.organizationId !== command.data.organizationId || context.identityId !== command.data.actorIdentityId) throw new AuthorizationError(); const response = await context.supabase.rpc("mmhr_record_deal", { payload: command.data, correlation_id: command.data.correlationId, idempotency_key: command.data.idempotencyKey }); if (response.error) throw new Error("Deal unavailable"); const result = resultSchema.safeParse(response.data); if (!result.success || result.data.organizationId !== command.data.organizationId || result.data.dealId !== command.data.dealId || result.data.correlationId !== command.data.correlationId) throw new Error("Invalid deal result"); return result.data; } catch (error) { if (error instanceof AuthorizationError) throw error; if (error instanceof Error && (error.message === "Deal unavailable" || error.message === "Invalid deal result")) throw error; throw new Error("Deal unavailable"); }
}
