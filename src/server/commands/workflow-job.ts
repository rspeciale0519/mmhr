import "server-only";
import { z } from "zod";
import { AuthorizationError, requirePermission, type AuthorizationOptions } from "@/server/auth/authorization";
const uuid = z.uuid().transform((value) => value.toLowerCase());
const base = { jobId: uuid, organizationId: uuid, actorIdentityId: uuid, correlationId: uuid, idempotencyKey: uuid };
const jobType = z.enum(["rfp_distribution","inbound_email","document_scan","content_acquisition","communication_delivery"]);
export const workflowJobSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("enqueue"), ...base, jobType, payloadReferences: z.array(z.unknown()).max(50), maximumAttempts: z.number().int().min(1).max(10).default(3) }),
  z.strictObject({ action: z.literal("claim"), ...base }),
  z.strictObject({ action: z.literal("complete"), ...base }),
  z.strictObject({ action: z.literal("fail"), ...base, failure: z.strictObject({ code: z.string().trim().min(1).max(64) }) }),
  z.strictObject({ action: z.literal("rerun"), ...base }),
]);
const resultSchema = z.strictObject({ jobId: uuid, organizationId: uuid, state: z.enum(["queued","scheduled","running","retry_pending","needs_attention","succeeded","failed","cancelled"]), attemptsInCycle: z.number().int().nonnegative(), rerunCount: z.number().int().nonnegative(), outcomeCode: z.enum(["recorded","replayed"]), correlationId: uuid });
export async function recordWorkflowJob(input: unknown, options: AuthorizationOptions = {}) {
  const command = workflowJobSchema.safeParse(input); if (!command.success) throw new Error("Invalid job input");
  try { const context = await requirePermission("workspace.access", { kind: "organization", organizationId: command.data.organizationId }, options); if (context.scope.kind !== "organization" || context.scope.organizationId !== command.data.organizationId || context.identityId !== command.data.actorIdentityId) throw new AuthorizationError(); const response = await context.supabase.rpc("mmhr_record_workflow_job", { payload: command.data, correlation_id: command.data.correlationId, idempotency_key: command.data.idempotencyKey }); if (response.error) throw new Error("Job unavailable"); const result = resultSchema.safeParse(response.data); if (!result.success || result.data.jobId !== command.data.jobId || result.data.organizationId !== command.data.organizationId || result.data.correlationId !== command.data.correlationId) throw new Error("Invalid job result"); return result.data; } catch (error) { if (error instanceof AuthorizationError) throw error; if (error instanceof Error && (error.message === "Job unavailable" || error.message === "Invalid job result")) throw error; throw new Error("Job unavailable"); }
}
