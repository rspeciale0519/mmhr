import "server-only";

import { z } from "zod";

import { AuthorizationError, requirePermission, type AuthorizationOptions } from "@/server/auth/authorization";

const uuid = z.uuid().transform((value) => value.toLowerCase());
const states = ["proposed", "active", "paused", "eliminated", "selected", "archived"] as const;

export const candidateTransitionSchema = z.strictObject({
  candidateId: uuid,
  organizationId: uuid,
  fromState: z.enum(states),
  toState: z.enum(states),
  expectedRevision: z.number().int().positive(),
  actorIdentityId: uuid,
  approvalReference: z.string().trim().max(300).nullable(),
  correlationId: uuid,
  idempotencyKey: uuid,
});

const resultSchema = z.strictObject({
  candidateId: uuid,
  organizationId: uuid,
  state: z.enum(states),
  revision: z.number().int().positive(),
  outcomeCode: z.enum(["transitioned", "replayed"]),
  correlationId: uuid,
});

export type CandidateTransition = z.infer<typeof candidateTransitionSchema>;
export type CandidateTransitionResult = z.infer<typeof resultSchema>;

export async function transitionEvaluationCandidate(
  input: unknown,
  options: AuthorizationOptions = {},
): Promise<CandidateTransitionResult> {
  const parsed = candidateTransitionSchema.safeParse(input);
  if (!parsed.success) throw new Error("Invalid candidate transition");
  const command = parsed.data;
  let context;
  try {
    context = await requirePermission("workspace.access", { kind: "organization", organizationId: command.organizationId }, options);
    if (context.scope.kind !== "organization" || context.scope.organizationId !== command.organizationId
      || context.identityId !== command.actorIdentityId) throw new AuthorizationError();
    const response = await context.supabase.rpc("mmhr_transition_evaluation_candidate", {
      payload: command, correlation_id: command.correlationId, idempotency_key: command.idempotencyKey,
    });
    if (response.error) throw new Error("Candidate transition unavailable");
    const result = resultSchema.safeParse(response.data);
    if (!result.success || result.data.candidateId !== command.candidateId
      || result.data.organizationId !== command.organizationId
      || result.data.correlationId !== command.correlationId) throw new Error("Invalid candidate transition response");
    return result.data;
  } catch (error) {
    if (error instanceof AuthorizationError) throw error;
    if (error instanceof Error && (error.message === "Candidate transition unavailable" || error.message === "Invalid candidate transition response")) throw error;
    throw new Error("Candidate transition unavailable");
  }
}
