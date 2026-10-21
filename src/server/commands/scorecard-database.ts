import "server-only";

import { z } from "zod";

import {
  AuthorizationError,
  requirePermission,
  type AuthorizationOptions,
} from "@/server/auth/authorization";

const uuid = z.uuid().transform((value) => value.toLowerCase());
const reference = z.string().trim().min(1).max(500).regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,499}$/);

export const scorecardEntryCommandSchema = z.strictObject({
  scorecardId: uuid,
  organizationId: uuid,
  expectedRevision: z.number().int().positive(),
  actorIdentityId: uuid,
  entry: z.strictObject({
    scoreId: uuid,
    criterionKey: z.string().trim().toLowerCase().regex(/^[a-z][a-z0-9_]{0,99}$/),
    scorerIdentityId: uuid,
    value: z.number().int().min(0).max(100),
    comment: z.string().trim().max(1_000).nullable(),
    evidenceReferences: z.array(reference).max(50),
    enteredAt: z.iso.datetime({ offset: true }).transform((value) => new Date(value).toISOString()),
  }),
  correlationId: uuid,
  idempotencyKey: uuid,
});

export type ScorecardEntryCommand = z.output<typeof scorecardEntryCommandSchema>;

const resultSchema = z.strictObject({
  scorecardId: uuid,
  organizationId: uuid,
  entryId: uuid,
  revision: z.number().int().positive(),
  outcomeCode: z.enum(["recorded", "replayed"]),
  correlationId: uuid,
});

export type ScorecardEntryCommandResult = z.infer<typeof resultSchema>;
export type ScorecardCommandOptions = AuthorizationOptions;

export class ScorecardCommandError extends Error {
  constructor(readonly code: "INVALID_INPUT" | "UNAVAILABLE" | "INVALID_RESPONSE") {
    super("Scorecard command could not be completed");
    this.name = "ScorecardCommandError";
  }
}

export async function recordScorecardEntry(
  input: unknown,
  options: ScorecardCommandOptions = {},
): Promise<ScorecardEntryCommandResult> {
  const parsed = scorecardEntryCommandSchema.safeParse(input);
  if (!parsed.success) throw new ScorecardCommandError("INVALID_INPUT");
  const command = parsed.data;
  if (command.entry.scorerIdentityId !== command.actorIdentityId) {
    throw new AuthorizationError();
  }
  let context;
  try {
    context = await requirePermission(
      "workspace.access",
      { kind: "organization", organizationId: command.organizationId },
      options,
    );
    if (context.scope.kind !== "organization" || context.scope.organizationId !== command.organizationId) {
      throw new AuthorizationError();
    }
    if (context.identityId !== command.actorIdentityId) throw new AuthorizationError();
    const response = await context.supabase.rpc("mmhr_record_scorecard_entry", {
      payload: command,
      correlation_id: command.correlationId,
      idempotency_key: command.idempotencyKey,
    });
    if (response.error) throw new ScorecardCommandError("UNAVAILABLE");
    const result = resultSchema.safeParse(response.data);
    if (!result.success || result.data.scorecardId !== command.scorecardId
      || result.data.organizationId !== command.organizationId
      || result.data.correlationId !== command.correlationId) {
      throw new ScorecardCommandError("INVALID_RESPONSE");
    }
    return result.data;
  } catch (error) {
    if (error instanceof AuthorizationError || error instanceof ScorecardCommandError) throw error;
    throw new ScorecardCommandError("UNAVAILABLE");
  }
}
