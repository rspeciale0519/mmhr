import "server-only";
import { z } from "zod";
import { AuthorizationError, requirePermission, type AuthorizationOptions } from "@/server/auth/authorization";

const uuid = z.uuid().transform((value) => value.toLowerCase());
const timestamp = z.iso.datetime({ offset: true });
const base = { organizationId: uuid, actorIdentityId: uuid, scheduleId: uuid, correlationId: uuid, idempotencyKey: uuid };
export const followUpScheduleCommandSchema = z.discriminatedUnion("action", [
  z.strictObject({ ...base, action: z.literal("create"), subjectType: z.enum(["vendor", "customer", "product", "risk"]), subjectId: uuid, intervalDays: z.number().int().min(1).max(3650), firstCheckInAt: timestamp, nextCheckInAt: timestamp }).superRefine((value, context) => { if (Date.parse(value.nextCheckInAt) < Date.parse(value.firstCheckInAt)) context.addIssue({ code: "custom", path: ["nextCheckInAt"], message: "nextCheckInAt cannot precede firstCheckInAt" }); }),
  z.strictObject({ ...base, action: z.literal("approve"), expectedRevision: z.number().int().positive(), approvedAt: timestamp, approvalReference: z.string().trim().min(1).max(200) }),
  z.strictObject({ ...base, action: z.literal("pause"), expectedRevision: z.number().int().positive() }),
  z.strictObject({ ...base, action: z.literal("retire"), expectedRevision: z.number().int().positive() }),
]);
const resultSchema = z.strictObject({ scheduleId: uuid, organizationId: uuid, subjectType: z.string().optional(), status: z.string().optional(), revision: z.number().int().positive().optional(), nextCheckInAt: z.string().optional(), outcomeCode: z.enum(["recorded", "replayed"]), correlationId: uuid });
export async function recordFollowUpSchedule(input: unknown, options: AuthorizationOptions = {}) {
  const command = followUpScheduleCommandSchema.safeParse(input); if (!command.success) throw new Error("Invalid follow-up schedule input");
  try { const context = await requirePermission("workspace.access", { kind: "organization", organizationId: command.data.organizationId }, options); if (context.scope.kind !== "organization" || context.scope.organizationId !== command.data.organizationId || context.identityId !== command.data.actorIdentityId) throw new AuthorizationError(); const response = await context.supabase.rpc("mmhr_record_follow_up_schedule", { payload: command.data, correlation_id: command.data.correlationId, idempotency_key: command.data.idempotencyKey }); if (response.error) throw new Error("Follow-up schedule unavailable"); const result = resultSchema.safeParse(response.data); if (!result.success || result.data.organizationId !== command.data.organizationId || result.data.correlationId !== command.data.correlationId) throw new Error("Invalid follow-up schedule result"); return result.data; } catch (error) { if (error instanceof AuthorizationError) throw error; if (error instanceof Error && (error.message === "Follow-up schedule unavailable" || error.message === "Invalid follow-up schedule result")) throw error; throw new Error("Follow-up schedule unavailable"); }
}
