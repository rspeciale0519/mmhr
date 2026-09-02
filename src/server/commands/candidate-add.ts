import "server-only";

import { z } from "zod";
import { AuthorizationError, requirePermission, type AuthorizationOptions } from "@/server/auth/authorization";

const uuid = z.uuid().transform((value) => value.toLowerCase());
export const candidateAddSchema = z.strictObject({
  organizationId: uuid, intakeId: uuid, productId: uuid,
  source: z.enum(["initial", "review_addition"]), actorIdentityId: uuid,
  correlationId: uuid, idempotencyKey: uuid,
});
const resultSchema = z.strictObject({
  candidateId: uuid, organizationId: uuid, intakeId: uuid, productId: uuid,
  source: z.enum(["initial", "review_addition"]), state: z.enum(["proposed", "active", "paused", "eliminated", "selected", "archived"]),
  revision: z.number().int().positive(), outcomeCode: z.enum(["created", "replayed"]), correlationId: uuid,
});
export type CandidateAdd = z.infer<typeof candidateAddSchema>;
export type CandidateAddResult = z.infer<typeof resultSchema>;

export async function addEvaluationCandidate(input: unknown, options: AuthorizationOptions = {}): Promise<CandidateAddResult> {
  const parsed = candidateAddSchema.safeParse(input);
  if (!parsed.success) throw new Error("Invalid candidate add");
  const command = parsed.data;
  try {
    const context = await requirePermission("workspace.access", { kind: "organization", organizationId: command.organizationId }, options);
    if (context.scope.kind !== "organization" || context.scope.organizationId !== command.organizationId || context.identityId !== command.actorIdentityId) throw new AuthorizationError();
    const response = await context.supabase.rpc("mmhr_add_evaluation_candidate", { payload: command, correlation_id: command.correlationId, idempotency_key: command.idempotencyKey });
    if (response.error) throw new Error("Candidate add unavailable");
    const result = resultSchema.safeParse(response.data);
    if (!result.success || result.data.organizationId !== command.organizationId || result.data.intakeId !== command.intakeId || result.data.productId !== command.productId || result.data.correlationId !== command.correlationId) throw new Error("Invalid candidate add response");
    return result.data;
  } catch (error) {
    if (error instanceof AuthorizationError) throw error;
    if (error instanceof Error && (error.message === "Candidate add unavailable" || error.message === "Invalid candidate add response")) throw error;
    throw new Error("Candidate add unavailable");
  }
}
