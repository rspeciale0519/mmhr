import "server-only";
import { z } from "zod";
import { AuthorizationError, requirePermission, type AuthorizationOptions } from "@/server/auth/authorization";

const uuid = z.uuid().transform((value) => value.toLowerCase());
const timestamp = z.iso.datetime({ offset: true });
const milestone = z.strictObject({ milestoneId: uuid, milestoneKey: z.string().trim().min(1).max(100), title: z.string().trim().min(1).max(300), ownerRole: z.enum(["operations", "support", "advisor", "sales", "finance"]), dueAt: timestamp, status: z.enum(["pending", "in_progress", "completed", "blocked", "skipped"]), completedAt: timestamp.nullable() });
const base = { organizationId: uuid, actorIdentityId: uuid, correlationId: uuid, idempotencyKey: uuid };
export const projectPlanCommandSchema = z.discriminatedUnion("action", [
  z.strictObject({ ...base, action: z.literal("create_template"), templateId: uuid, version: z.number().int().positive(), name: z.string().trim().min(1).max(200), milestones: z.array(z.unknown()).min(1).max(200) }),
  z.strictObject({ ...base, action: z.literal("approve_template"), templateId: uuid }),
  z.strictObject({ ...base, action: z.literal("generate"), planId: uuid, dealId: uuid, templateId: uuid, targetGoLiveAt: timestamp, milestones: z.array(milestone).min(1).max(200) }),
  z.strictObject({ ...base, action: z.literal("edit"), planId: uuid, milestoneId: uuid, expectedRevision: z.number().int().positive(), milestones: z.array(milestone).min(1).max(200) }),
]);
const resultSchema = z.strictObject({ entityId: uuid, organizationId: uuid, status: z.string().optional(), outcomeCode: z.enum(["recorded", "replayed"]), correlationId: uuid });
export async function recordProjectPlan(input: unknown, options: AuthorizationOptions = {}) {
  const command = projectPlanCommandSchema.safeParse(input); if (!command.success) throw new Error("Invalid project-plan input");
  try { const context = await requirePermission("workspace.access", { kind: "organization", organizationId: command.data.organizationId }, options); if (context.scope.kind !== "organization" || context.scope.organizationId !== command.data.organizationId || context.identityId !== command.data.actorIdentityId) throw new AuthorizationError(); const response = await context.supabase.rpc("mmhr_record_project_plan", { payload: command.data, correlation_id: command.data.correlationId, idempotency_key: command.data.idempotencyKey }); if (response.error) throw new Error("Project plan unavailable"); const result = resultSchema.safeParse(response.data); if (!result.success || result.data.organizationId !== command.data.organizationId || result.data.correlationId !== command.data.correlationId) throw new Error("Invalid project-plan result"); return result.data; } catch (error) { if (error instanceof AuthorizationError) throw error; if (error instanceof Error && (error.message === "Project plan unavailable" || error.message === "Invalid project-plan result")) throw error; throw new Error("Project plan unavailable"); }
}
