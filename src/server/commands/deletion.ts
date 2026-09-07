import "server-only";

import { z } from "zod";

import { AuthorizationError, requirePermission, type AuthorizationOptions } from "@/server/auth/authorization";
import { deletionRequestSchema, deletionDecisionSchema } from "@/server/privacy/retention-contract";

const uuid = z.uuid().transform((value) => value.toLowerCase());
const base = { organizationId: uuid, actorIdentityId: uuid, requestId: uuid, correlationId: uuid, idempotencyKey: uuid };

const createSchema = z.strictObject({
  ...base,
  action: z.literal("create"),
  subjectId: uuid,
  requestedAt: z.iso.datetime({ offset: true }),
  dueAt: z.iso.datetime({ offset: true }),
  legalHold: z.boolean(),
  retentionUntil: z.iso.datetime({ offset: true }).nullable(),
});

const decideSchema = z.strictObject({
  ...base,
  action: z.literal("decide"),
  decidedAt: z.iso.datetime({ offset: true }),
  decision: z.enum(["approved", "held", "rejected"]),
  auditReference: z.string().trim().min(1).max(160).regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/),
});

export const deletionCommandSchema = z.discriminatedUnion("action", [createSchema, decideSchema]);

const resultSchema = z.strictObject({
  requestId: uuid,
  organizationId: uuid,
  status: z.enum(["requested", "approved", "held", "rejected", "completed"]),
  outcomeCode: z.enum(["recorded", "replayed"]),
  correlationId: uuid,
});

export type DeletionCommandResult = z.infer<typeof resultSchema>;

export async function recordDeletionCommand(input: unknown, options: AuthorizationOptions = {}): Promise<DeletionCommandResult> {
  const parsed = deletionCommandSchema.safeParse(input);
  if (!parsed.success) throw new Error("Invalid deletion input");
  const command = parsed.data;
  try {
    const context = await requirePermission("workspace.access", { kind: "organization", organizationId: command.organizationId }, options);
    if (context.scope.kind !== "organization" || context.scope.organizationId !== command.organizationId || context.identityId !== command.actorIdentityId) throw new AuthorizationError();
    if (command.action === "create") {
      const request = deletionRequestSchema.safeParse({ requestId: command.requestId, subjectId: command.subjectId, requestedAt: command.requestedAt, dueAt: command.dueAt, legalHold: command.legalHold, retentionUntil: command.retentionUntil });
      if (!request.success) throw new Error("Invalid deletion input");
    } else {
      const decision = deletionDecisionSchema.safeParse({ requestId: command.requestId, decidedAt: command.decidedAt, decision: command.decision, auditReference: command.auditReference });
      if (!decision.success) throw new Error("Invalid deletion input");
    }
    const response = await context.supabase.rpc("mmhr_record_deletion", { payload: command, correlation_id: command.correlationId, idempotency_key: command.idempotencyKey });
    if (response.error) throw new Error("Deletion unavailable");
    const result = resultSchema.safeParse(response.data);
    if (!result.success || result.data.requestId !== command.requestId || result.data.organizationId !== command.organizationId || result.data.correlationId !== command.correlationId) throw new Error("Invalid deletion response");
    return result.data;
  } catch (error) {
    if (error instanceof AuthorizationError) throw error;
    if (error instanceof Error && (error.message === "Deletion unavailable" || error.message === "Invalid deletion response" || error.message === "Invalid deletion input")) throw error;
    throw new Error("Deletion unavailable");
  }
}
