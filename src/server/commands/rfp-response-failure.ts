import "server-only";
import { z } from "zod";
import { AuthorizationError, requirePermission, type AuthorizationOptions } from "@/server/auth/authorization";

const uuid = z.uuid().transform((value) => value.toLowerCase());
export const rfpResponseFailureSchema = z.strictObject({ failureId: uuid, organizationId: uuid, eventId: uuid.nullable().optional(), normalizationId: uuid.nullable().optional(), failureCode: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/), failureDetail: z.string().trim().min(1).max(1000), retryAt: z.iso.datetime({ offset: true }).nullable().optional(), actorIdentityId: uuid, correlationId: uuid, idempotencyKey: uuid });
const resultSchema = z.strictObject({ failureId: uuid, organizationId: uuid, eventId: uuid.nullable(), normalizationId: uuid.nullable(), failureCode: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/), state: z.literal("failed"), retryAt: z.iso.datetime({ offset: true }).nullable(), outcomeCode: z.enum(["recorded", "replayed"]), correlationId: uuid });
export type RfpResponseFailureResult = z.infer<typeof resultSchema>;

export async function recordRfpResponseFailure(input: unknown, options: AuthorizationOptions = {}): Promise<RfpResponseFailureResult> {
  const parsed = rfpResponseFailureSchema.safeParse(input);
  if (!parsed.success) throw new Error("Invalid RFP response failure input");
  const command = parsed.data;
  try {
    const context = await requirePermission("workspace.access", { kind: "organization", organizationId: command.organizationId }, options);
    if (context.scope.kind !== "organization" || context.scope.organizationId !== command.organizationId || context.identityId !== command.actorIdentityId) throw new AuthorizationError();
    const response = await context.supabase.rpc("mmhr_record_rfp_response_failure", { payload: command, correlation_id: command.correlationId, idempotency_key: command.idempotencyKey });
    if (response.error) throw new Error("RFP response failure unavailable");
    const result = resultSchema.safeParse(response.data);
    if (!result.success || result.data.failureId !== command.failureId || result.data.organizationId !== command.organizationId || result.data.correlationId !== command.correlationId) throw new Error("Invalid RFP response failure result");
    return result.data;
  } catch (error) {
    if (error instanceof AuthorizationError) throw error;
    if (error instanceof Error && (error.message === "RFP response failure unavailable" || error.message === "Invalid RFP response failure result")) throw error;
    throw new Error("RFP response failure unavailable");
  }
}
