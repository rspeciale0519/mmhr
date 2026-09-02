import "server-only";

import { z } from "zod";

import { AuthorizationError, requirePermission, type AuthorizationOptions } from "@/server/auth/authorization";

const uuid = z.uuid().transform((value) => value.toLowerCase());

export const deterministicMatchingSchema = z.strictObject({
  organizationId: uuid,
  intakeId: uuid,
  ruleVersion: z.number().int().positive(),
  actorIdentityId: uuid,
  correlationId: uuid,
  idempotencyKey: uuid,
});

const resultSchema = z.strictObject({
  matchingRunId: uuid,
  organizationId: uuid,
  intakeId: uuid,
  ruleVersion: z.number().int().positive(),
  candidateCount: z.number().int().min(0).max(100),
  outcomeCode: z.enum(["computed", "replayed"]),
  correlationId: uuid,
});

export type DeterministicMatchingCommand = z.infer<typeof deterministicMatchingSchema>;
export type DeterministicMatchingResult = z.infer<typeof resultSchema>;

export async function runDeterministicMatching(
  input: unknown,
  options: AuthorizationOptions = {},
): Promise<DeterministicMatchingResult> {
  const parsed = deterministicMatchingSchema.safeParse(input);
  if (!parsed.success) throw new Error("Invalid matching input");
  const command = parsed.data;
  try {
    const context = await requirePermission("workspace.access", { kind: "organization", organizationId: command.organizationId }, options);
    if (context.scope.kind !== "organization" || context.scope.organizationId !== command.organizationId || context.identityId !== command.actorIdentityId) throw new AuthorizationError();
    const response = await context.supabase.rpc("mmhr_run_deterministic_matching", {
      payload: command,
      correlation_id: command.correlationId,
      idempotency_key: command.idempotencyKey,
    });
    if (response.error) throw new Error("Matching unavailable");
    const result = resultSchema.safeParse(response.data);
    if (!result.success || result.data.organizationId !== command.organizationId || result.data.intakeId !== command.intakeId || result.data.ruleVersion !== command.ruleVersion || result.data.correlationId !== command.correlationId) throw new Error("Invalid matching response");
    return result.data;
  } catch (error) {
    if (error instanceof AuthorizationError) throw error;
    if (error instanceof Error && (error.message === "Matching unavailable" || error.message === "Invalid matching response")) throw error;
    throw new Error("Matching unavailable");
  }
}
