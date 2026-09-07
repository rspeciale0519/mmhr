import "server-only";

import { z } from "zod";

import { AuthorizationError, requirePermission, type AuthorizationOptions } from "@/server/auth/authorization";
import {
  aiArtifactSchema,
  type AiRunRecord,
  aiRunIdentifierSchema,
  aiRunUsageSchema,
} from "@/server/ai/ai-run-record";
import { aiCapabilities, aiDataClasses, aiRunStatuses } from "@/server/ai/ai-service";

const uuid = z.uuid().transform((value) => value.toLowerCase());
const timestamp = z.iso.datetime({ offset: true });
const base = {
  organizationId: uuid,
  actorIdentityId: uuid,
  correlationId: uuid,
  idempotencyKey: uuid,
  runId: aiRunIdentifierSchema,
};

const createSchema = z.strictObject({
  ...base,
  action: z.literal("create"),
  capability: z.enum(aiCapabilities),
  dataClass: z.enum(aiDataClasses),
  adapterId: aiRunIdentifierSchema,
  modelId: aiRunIdentifierSchema,
  templateVersion: aiRunIdentifierSchema,
  schemaVersion: aiRunIdentifierSchema,
  inputArtifacts: z.array(aiArtifactSchema).max(100),
  outputArtifact: aiArtifactSchema.nullable(),
  outputHash: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  sourceReferences: z.array(aiRunIdentifierSchema).max(100),
  usage: aiRunUsageSchema,
  status: z.enum(aiRunStatuses),
  failure: z.strictObject({
    code: z.enum(["provider_timeout", "provider_error", "validation_failed", "policy_denied"]),
    retryable: z.boolean(),
  }).nullable(),
  createdAt: timestamp,
  completedAt: timestamp.nullable(),
});

const decideSchema = z.strictObject({
  ...base,
  action: z.literal("decide"),
  decision: z.enum(["approved", "rejected"]),
  approvalReference: aiRunIdentifierSchema,
  decidedAt: timestamp,
  reason: z.string().trim().max(2_000).nullable().optional(),
});

export const aiRunCommandSchema = z.discriminatedUnion("action", [createSchema, decideSchema]);

const resultSchema = z.strictObject({
  runId: aiRunIdentifierSchema,
  organizationId: uuid,
  status: z.enum(aiRunStatuses),
  revision: z.number().int().positive(),
  outcomeCode: z.enum(["recorded", "replayed"]),
  correlationId: uuid,
});

export type AiRunCommandResult = z.infer<typeof resultSchema>;

/** Persists a validated provider-neutral run without sending raw input or output. */
export async function recordAiRunRecord(
  record: AiRunRecord,
  identity: Readonly<{ organizationId: string; actorIdentityId: string; correlationId: string; idempotencyKey: string }>,
  options: AuthorizationOptions = {},
): Promise<AiRunCommandResult> {
  return recordAiRun({
    ...identity,
    action: "create",
    runId: record.runId,
    capability: record.capability,
    dataClass: record.dataClass,
    adapterId: record.adapterId,
    modelId: record.modelId,
    templateVersion: record.templateVersion,
    schemaVersion: record.schemaVersion,
    inputArtifacts: record.inputArtifacts,
    outputArtifact: record.outputArtifact,
    outputHash: record.outputHash,
    sourceReferences: record.sourceReferences,
    usage: record.usage,
    status: record.status,
    failure: record.failure,
    createdAt: record.createdAt,
    completedAt: record.completedAt,
  }, options);
}

export async function recordAiRun(
  input: unknown,
  options: AuthorizationOptions = {},
): Promise<AiRunCommandResult> {
  const parsed = aiRunCommandSchema.safeParse(input);
  if (!parsed.success) throw new Error("Invalid AI run input");
  const command = parsed.data;
  try {
    const context = await requirePermission(
      "workspace.access",
      { kind: "organization", organizationId: command.organizationId },
      options,
    );
    if (
      context.scope.kind !== "organization"
      || context.scope.organizationId !== command.organizationId
      || context.identityId !== command.actorIdentityId
    ) throw new AuthorizationError();
    const response = await context.supabase.rpc("mmhr_record_ai_run", {
      payload: command,
      correlation_id: command.correlationId,
      idempotency_key: command.idempotencyKey,
    });
    if (response.error) throw new Error("AI run unavailable");
    const result = resultSchema.safeParse(response.data);
    if (
      !result.success
      || result.data.runId !== command.runId
      || result.data.organizationId !== command.organizationId
      || result.data.correlationId !== command.correlationId
    ) throw new Error("Invalid AI run response");
    return result.data;
  } catch (error) {
    if (error instanceof AuthorizationError) throw error;
    if (error instanceof Error && (error.message === "AI run unavailable" || error.message === "Invalid AI run response")) throw error;
    throw new Error("AI run unavailable");
  }
}
