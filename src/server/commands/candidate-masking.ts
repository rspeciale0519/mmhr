import "server-only";
import { z } from "zod";
import { AuthorizationError, requirePermission, type AuthorizationOptions } from "@/server/auth/authorization";

const uuid = z.uuid().transform((value) => value.toLowerCase());
const base = { candidateId: uuid, organizationId: uuid, actorIdentityId: uuid, correlationId: uuid, idempotencyKey: uuid };
export const candidateMaskSchema = z.strictObject(base);
export const candidateUnmaskSchema = z.strictObject({ ...base, reason: z.string().trim().min(1).max(500), approvalReference: z.string().trim().min(1).max(300) });
const resultSchema = z.strictObject({ candidateId: uuid, organizationId: uuid, maskedLabel: z.string().regex(/^Candidate-[A-Fa-f0-9]{8}$/), state: z.enum(["masked", "unmasked"]), outcomeCode: z.enum(["masked", "unmasked", "replayed"]), correlationId: uuid });
export type CandidateMaskResult = z.infer<typeof resultSchema>;
async function run(schema: typeof candidateMaskSchema | typeof candidateUnmaskSchema, rpcName: string, input: unknown, options: AuthorizationOptions) {
  const parsed = schema.safeParse(input); if (!parsed.success) throw new Error("Invalid candidate masking input"); const command = parsed.data;
  try { const context = await requirePermission("workspace.access", { kind: "organization", organizationId: command.organizationId }, options); if (context.scope.kind !== "organization" || context.scope.organizationId !== command.organizationId || context.identityId !== command.actorIdentityId) throw new AuthorizationError(); const response = await context.supabase.rpc(rpcName, { payload: command, correlation_id: command.correlationId, idempotency_key: command.idempotencyKey }); if (response.error) throw new Error("Candidate masking unavailable"); const result = resultSchema.safeParse(response.data); if (!result.success || result.data.candidateId !== command.candidateId || result.data.organizationId !== command.organizationId || result.data.correlationId !== command.correlationId) throw new Error("Invalid candidate masking response"); return result.data;
  } catch (error) { if (error instanceof AuthorizationError) throw error; if (error instanceof Error && (error.message === "Candidate masking unavailable" || error.message === "Invalid candidate masking response")) throw error; throw new Error("Candidate masking unavailable"); }
}
export const maskEvaluationCandidate = (input: unknown, options: AuthorizationOptions = {}) => run(candidateMaskSchema, "mmhr_mask_evaluation_candidate", input, options);
export const unmaskEvaluationCandidate = (input: unknown, options: AuthorizationOptions = {}) => run(candidateUnmaskSchema, "mmhr_unmask_evaluation_candidate", input, options);
