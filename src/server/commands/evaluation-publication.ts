import "server-only";

import { z } from "zod";
import { AuthorizationError, requirePermission, type AuthorizationOptions } from "@/server/auth/authorization";
import { publicationConfigSchema, publicationReadSchema, type PublicationRead } from "@/server/matching/option-publication-contract";

const uuid = z.uuid().transform((value) => value.toLowerCase());
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const commandFields = { organizationId: uuid, correlationId: uuid, idempotencyKey: uuid };
const reason = z.string().trim().min(1).max(2_000);

export const prepareEvaluationPublicationSchema = z.strictObject({
  ...commandFields, intakeId: uuid, expectedRevision: z.number().int().min(1).max(2_147_483_647),
  configuration: publicationConfigSchema,
});
export const publishEvaluationPublicationSchema = z.strictObject({
  ...commandFields, publicationId: uuid, expectedDigest: digest,
  approvalReference: z.string().trim().min(1).max(500), reason,
});
export const revokeEvaluationPublicationSchema = z.strictObject({ ...commandFields, publicationId: uuid, reason });
export const readEvaluationPublicationSchema = z.strictObject({
  organizationId: uuid, intakeId: uuid, publicationId: uuid, correlationId: uuid,
  afterOrdinal: z.number().int().min(0).max(2_147_483_647).default(0),
  limit: z.number().int().min(1).max(50).default(25),
});
const publicationResultSchema = z.strictObject({
  publicationId: uuid, organizationId: uuid, intakeId: uuid,
  sequence: z.number().int().positive(), configurationVersion: z.number().int().positive(),
  state: z.enum(["prepared", "published", "revoked"]), inputDigest: digest,
  optionCount: z.number().int().nonnegative(), correlationId: uuid,
  outcomeCode: z.enum(["prepared", "published", "revoked", "replayed"]),
}).refine((value) => value.sequence === value.configurationVersion);
export type EvaluationPublicationResult = z.output<typeof publicationResultSchema>;

export class EvaluationPublicationError extends Error {
  constructor(readonly code: "INVALID_INPUT" | "REJECTED" | "UNAVAILABLE" | "INVALID_RESPONSE") {
    super("Evaluation publication request failed");
    this.name = "EvaluationPublicationError";
  }
}

async function authorizedContext(
  organizationId: string, correlationId: string, internal: boolean, options: AuthorizationOptions,
) {
  const context = await requirePermission(internal ? "evaluation.publish" : "portal.customer.access",
    { kind: "organization", organizationId }, { ...options, correlationId });
  if (context.scope.kind !== "organization" || context.scope.organizationId !== organizationId ||
    context.correlationId !== correlationId) throw new AuthorizationError();
  if (internal) {
    const admin = await requirePermission("admin.access", { kind: "platform" }, {
      supabase: context.supabase, correlationId,
    });
    if (admin.scope.kind !== "platform" || admin.identityId !== context.identityId ||
      admin.correlationId !== correlationId) throw new AuthorizationError();
  }
  return context;
}

function rejectUnexpected(error: unknown): never {
  if (error instanceof AuthorizationError || error instanceof EvaluationPublicationError) throw error;
  throw new EvaluationPublicationError("UNAVAILABLE");
}

type PrepareInput = z.output<typeof prepareEvaluationPublicationSchema>;
type PublishInput = z.output<typeof publishEvaluationPublicationSchema>;
type RevokeInput = z.output<typeof revokeEvaluationPublicationSchema>;
type Operation = "prepare" | "publish" | "revoke";
const commandNames = {
  prepare: "mmhr_prepare_evaluation_publication",
  publish: "mmhr_publish_evaluation_publication",
  revoke: "mmhr_revoke_evaluation_publication",
} as const;
const outcomes = { prepare: "prepared", publish: "published", revoke: "revoked" } as const;

async function executePublicationCommand(
  operation: Operation, input: PrepareInput | PublishInput | RevokeInput, options: AuthorizationOptions,
): Promise<EvaluationPublicationResult> {
  const { correlationId, idempotencyKey, ...payload } = input;
  try {
    const context = await authorizedContext(payload.organizationId, correlationId, true, options);
    const response = await context.supabase.rpc(commandNames[operation], {
      payload, correlation_id: correlationId, idempotency_key: idempotencyKey,
    });
    if (!response || response.error !== null) {
      throw new EvaluationPublicationError(response?.error?.code === "42501" ? "REJECTED" : "UNAVAILABLE");
    }
    const parsed = publicationResultSchema.safeParse(response.data);
    if (!parsed.success) throw new EvaluationPublicationError("INVALID_RESPONSE");
    const result = parsed.data;
    if (result.organizationId !== payload.organizationId || result.correlationId !== correlationId ||
      ("intakeId" in payload && result.intakeId !== payload.intakeId) ||
      ("publicationId" in payload && result.publicationId !== payload.publicationId) ||
      ("expectedDigest" in payload && result.inputDigest !== payload.expectedDigest) ||
      (result.outcomeCode !== "replayed" &&
        (result.outcomeCode !== outcomes[operation] || result.state !== outcomes[operation]))) {
      throw new EvaluationPublicationError("INVALID_RESPONSE");
    }
    return result;
  } catch (error) { rejectUnexpected(error); }
}

export async function prepareEvaluationPublication(input: unknown, options: AuthorizationOptions = {}) {
  const parsed = prepareEvaluationPublicationSchema.safeParse(input);
  if (!parsed.success) throw new EvaluationPublicationError("INVALID_INPUT");
  return executePublicationCommand("prepare", parsed.data, options);
}
export async function publishEvaluationPublication(input: unknown, options: AuthorizationOptions = {}) {
  const parsed = publishEvaluationPublicationSchema.safeParse(input);
  if (!parsed.success) throw new EvaluationPublicationError("INVALID_INPUT");
  return executePublicationCommand("publish", parsed.data, options);
}
export async function revokeEvaluationPublication(input: unknown, options: AuthorizationOptions = {}) {
  const parsed = revokeEvaluationPublicationSchema.safeParse(input);
  if (!parsed.success) throw new EvaluationPublicationError("INVALID_INPUT");
  return executePublicationCommand("revoke", parsed.data, options);
}

async function readPublication(input: unknown, internal: boolean, options: AuthorizationOptions): Promise<PublicationRead> {
  const parsed = readEvaluationPublicationSchema.safeParse(input);
  if (!parsed.success) throw new EvaluationPublicationError("INVALID_INPUT");
  const { correlationId, ...payload } = parsed.data;
  try {
    const context = await authorizedContext(payload.organizationId, correlationId, internal, options);
    const response = await context.supabase.rpc(internal ? "mmhr_review_evaluation_publication" : "mmhr_get_evaluation_publication", {
      payload, correlation_id: correlationId,
    });
    if (!response || response.error !== null) {
      throw new EvaluationPublicationError(response?.error?.code === "42501" ? "REJECTED" : "UNAVAILABLE");
    }
    const result = publicationReadSchema.safeParse(response.data);
    if (!result.success || result.data.organizationId !== payload.organizationId ||
      result.data.intakeId !== payload.intakeId || result.data.publicationId !== payload.publicationId ||
      result.data.correlationId !== correlationId || (!internal && result.data.state !== "published")) {
      throw new EvaluationPublicationError("INVALID_RESPONSE");
    }
    const publication = result.data;
    // Reject incomplete, repeated or displaced pages instead of silently hiding options.
    const expectedLength = Math.min(payload.limit, Math.max(0, publication.optionCount - payload.afterOrdinal));
    if (publication.options.length !== expectedLength ||
      publication.options.some((option, index) => option.ordinal !== payload.afterOrdinal + index + 1) ||
      publication.nextOrdinal !== (payload.afterOrdinal + expectedLength < publication.optionCount
        ? payload.afterOrdinal + expectedLength : null)) {
      throw new EvaluationPublicationError("INVALID_RESPONSE");
    }
    return publication;
  } catch (error) { rejectUnexpected(error); }
}

export async function reviewEvaluationPublication(input: unknown, options: AuthorizationOptions = {}) {
  return readPublication(input, true, options);
}
export async function getEvaluationPublication(input: unknown, options: AuthorizationOptions = {}) {
  return readPublication(input, false, options);
}
