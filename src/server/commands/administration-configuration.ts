import "server-only";
import { z } from "zod";
import { AuthorizationError, requirePermission, type AuthorizationOptions } from "@/server/auth/authorization";

const uuid = z.uuid().transform((value) => value.toLowerCase());
const timestamp = z.iso.datetime({ offset: true });
const categories = ["stage","questionnaire","scorecard","template","reminder","commission","ai_review","document_category","system"] as const;
const base = { organizationId: uuid, actorIdentityId: uuid, configurationId: uuid, correlationId: uuid, idempotencyKey: uuid };
export const administrationConfigurationCommandSchema = z.discriminatedUnion("action", [
  z.strictObject({ ...base, action: z.literal("create"), category: z.enum(categories), version: z.number().int().positive(), entries: z.array(z.strictObject({ key: z.string().trim().min(1).max(100), value: z.union([z.string().max(500), z.number().finite(), z.boolean()]) })).min(1).max(200) }),
  z.strictObject({ ...base, action: z.literal("approve"), expectedRevision: z.number().int().positive(), approvedAt: timestamp, approvalReference: z.string().trim().min(1).max(200) }),
  z.strictObject({ ...base, action: z.literal("retire"), expectedRevision: z.number().int().positive() }),
]);
const resultSchema = z.strictObject({ configurationId: uuid, organizationId: uuid, status: z.string().optional(), revision: z.number().int().positive().optional(), outcomeCode: z.enum(["recorded","replayed"]), correlationId: uuid });
export async function recordAdministrationConfiguration(input: unknown, options: AuthorizationOptions = {}) {
  const command = administrationConfigurationCommandSchema.safeParse(input); if (!command.success) throw new Error("Invalid administration configuration input");
  try { const context = await requirePermission("workspace.access", { kind: "organization", organizationId: command.data.organizationId }, options); if (context.scope.kind !== "organization" || context.scope.organizationId !== command.data.organizationId || context.identityId !== command.data.actorIdentityId) throw new AuthorizationError(); const response = await context.supabase.rpc("mmhr_record_administration_configuration", { payload: command.data, correlation_id: command.data.correlationId, idempotency_key: command.data.idempotencyKey }); if (response.error) throw new Error("Administration configuration unavailable"); const result = resultSchema.safeParse(response.data); if (!result.success || result.data.organizationId !== command.data.organizationId || result.data.correlationId !== command.data.correlationId) throw new Error("Invalid administration configuration result"); return result.data; } catch (error) { if (error instanceof AuthorizationError) throw error; if (error instanceof Error && (error.message === "Administration configuration unavailable" || error.message === "Invalid administration configuration result")) throw error; throw new Error("Administration configuration unavailable"); }
}
