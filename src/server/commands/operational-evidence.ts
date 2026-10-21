import "server-only";

import { z } from "zod";

import { AuthorizationError, requirePermission, type AuthorizationOptions } from "@/server/auth/authorization";

const uuid = z.uuid().transform((value) => value.toLowerCase());
const timestamp = z.iso.datetime({ offset: true });
const serviceId = z.string().trim().min(1).max(120).regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,119}$/);
const route = z.string().regex(/^\/(?:[a-z0-9][a-z0-9/_-]*)?$/);
const base = { organizationId: uuid, actorIdentityId: uuid, correlationId: uuid, idempotencyKey: uuid };

export const operationalEvidenceSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    ...base,
    kind: z.literal("availability"),
    observationId: uuid,
    serviceId,
    observedAt: timestamp,
    durationSeconds: z.number().int().positive().max(86_400),
    outcome: z.enum(["available", "unavailable"]),
    maintenance: z.boolean(),
    source: z.enum(["synthetic", "user"]),
  }),
  z.strictObject({
    ...base,
    kind: z.literal("performance"),
    measurementId: uuid,
    route,
    measuredAt: timestamp,
    sampleCount: z.number().int().positive().max(100_000),
    lcpP75Ms: z.number().int().nonnegative().max(60_000),
    inpP75Ms: z.number().int().nonnegative().max(60_000),
  }),
]);

const resultSchema = z.strictObject({
  evidenceId: uuid,
  organizationId: uuid,
  kind: z.enum(["availability", "performance"]),
  outcomeCode: z.enum(["recorded", "replayed"]),
  correlationId: uuid,
});

export type OperationalEvidenceResult = z.infer<typeof resultSchema>;

/** Records redacted operational evidence through fixed, audited SQL functions. */
export async function recordOperationalEvidence(
  input: unknown,
  options: AuthorizationOptions = {},
): Promise<OperationalEvidenceResult> {
  const parsed = operationalEvidenceSchema.safeParse(input);
  if (!parsed.success) throw new Error("Invalid operational evidence input");
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

    const response = await context.supabase.rpc("mmhr_record_operational_evidence", {
      payload: command,
      correlation_id: command.correlationId,
      idempotency_key: command.idempotencyKey,
    });
    if (response.error) throw new Error("Operational evidence unavailable");
    const result = resultSchema.safeParse(response.data);
    const expectedId = command.kind === "availability" ? command.observationId : command.measurementId;
    if (
      !result.success
      || result.data.evidenceId !== expectedId
      || result.data.organizationId !== command.organizationId
      || result.data.kind !== command.kind
      || result.data.correlationId !== command.correlationId
    ) throw new Error("Invalid operational evidence response");
    return result.data;
  } catch (error) {
    if (error instanceof AuthorizationError) throw error;
    if (error instanceof Error && (error.message === "Operational evidence unavailable" || error.message === "Invalid operational evidence response")) throw error;
    throw new Error("Operational evidence unavailable");
  }
}
