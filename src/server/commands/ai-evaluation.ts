import "server-only";

import { z } from "zod";

import { AuthorizationError, requirePermission, type AuthorizationOptions } from "@/server/auth/authorization";
import { aiCapabilities, aiDataClasses } from "@/server/ai/ai-service";

const uuid = z.uuid().transform((value) => value.toLowerCase());
const identifier = z.string().trim().min(1).max(200).regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const timestamp = z.iso.datetime({ offset: true });
const base = { evaluationId: uuid, actorIdentityId: uuid, correlationId: uuid, idempotencyKey: uuid };

export const aiEvaluationCommandSchema = z.discriminatedUnion("action", [
  z.strictObject({
    ...base,
    action: z.literal("record"),
    capability: z.enum(aiCapabilities),
    dataClass: z.enum(aiDataClasses),
    adapterId: identifier,
    modelId: identifier,
    schemaVersion: identifier,
    fixtureSetVersion: identifier,
    fixtureCount: z.number().int().min(1).max(1_000),
    passed: z.boolean(),
    reportHash: hash,
    status: z.enum(["pending", "failed"]),
    evaluatedAt: timestamp,
  }),
  z.strictObject({
    ...base,
    action: z.literal("decide"),
    decision: z.enum(["approved", "rejected"]),
    approvalReference: identifier,
    reviewedAt: timestamp,
    reason: z.string().trim().max(2_000).nullable().optional(),
  }),
]);

const resultSchema = z.strictObject({
  evaluationId: uuid,
  status: z.enum(["pending", "approved", "rejected", "failed"]),
  revision: z.number().int().positive(),
  outcomeCode: z.enum(["recorded", "replayed"]),
  correlationId: uuid,
});

export type AiEvaluationCommandResult = z.infer<typeof resultSchema>;

export async function recordAiEvaluation(input: unknown, options: AuthorizationOptions = {}): Promise<AiEvaluationCommandResult> {
  const parsed = aiEvaluationCommandSchema.safeParse(input);
  if (!parsed.success) throw new Error("Invalid AI evaluation input");
  const command = parsed.data;
  try {
    const context = await requirePermission("admin.access", { kind: "platform" }, options);
    if (context.scope.kind !== "platform" || context.identityId !== command.actorIdentityId) throw new AuthorizationError();
    const response = await context.supabase.rpc("mmhr_record_ai_evaluation", {
      payload: command,
      correlation_id: command.correlationId,
      idempotency_key: command.idempotencyKey,
    });
    if (response.error) throw new Error("AI evaluation unavailable");
    const result = resultSchema.safeParse(response.data);
    if (!result.success || result.data.evaluationId !== command.evaluationId || result.data.correlationId !== command.correlationId) throw new Error("Invalid AI evaluation response");
    return result.data;
  } catch (error) {
    if (error instanceof AuthorizationError) throw error;
    if (error instanceof Error && (error.message === "AI evaluation unavailable" || error.message === "Invalid AI evaluation response")) throw error;
    throw new Error("AI evaluation unavailable");
  }
}
