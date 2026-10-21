import "server-only";
import { z } from "zod";
import { AuthorizationError, requirePermission, type AuthorizationOptions } from "@/server/auth/authorization";

const uuid = z.uuid().transform((value) => value.toLowerCase());
const items = z.array(z.unknown()).max(100);
export const rfpResponseNormalizationSchema = z.strictObject({
  normalizationId: uuid,
  eventId: uuid,
  organizationId: uuid,
  rfpId: uuid,
  version: z.number().int().min(1).max(10_000),
  vendorProfileId: uuid,
  actorIdentityId: uuid,
  supportedRequirements: items,
  unsupportedRequirements: items,
  caveats: items,
  dependencies: items,
  commitments: items,
  implementationDetails: items,
  missingAnswers: items,
  proposedFollowUps: items,
  correlationId: uuid,
  idempotencyKey: uuid,
});

const resultSchema = z.strictObject({
  normalizationId: uuid,
  eventId: uuid,
  organizationId: uuid,
  rfpId: uuid,
  version: z.number().int().positive(),
  vendorProfileId: uuid,
  state: z.enum(["pending", "reviewed", "approved", "rejected"]),
  outcomeCode: z.enum(["recorded", "replayed"]),
  correlationId: uuid,
});
export type RfpResponseNormalizationResult = z.infer<typeof resultSchema>;

export async function recordRfpResponseNormalization(input: unknown, options: AuthorizationOptions = {}): Promise<RfpResponseNormalizationResult> {
  const parsed = rfpResponseNormalizationSchema.safeParse(input);
  if (!parsed.success) throw new Error("Invalid RFP response normalization input");
  const command = parsed.data;
  try {
    const context = await requirePermission("workspace.access", { kind: "organization", organizationId: command.organizationId }, options);
    if (context.scope.kind !== "organization" || context.scope.organizationId !== command.organizationId || context.identityId !== command.actorIdentityId) throw new AuthorizationError();
    const response = await context.supabase.rpc("mmhr_record_rfp_response_normalization", { payload: command, correlation_id: command.correlationId, idempotency_key: command.idempotencyKey });
    if (response.error) throw new Error("RFP response normalization unavailable");
    const result = resultSchema.safeParse(response.data);
    if (!result.success || result.data.normalizationId !== command.normalizationId || result.data.eventId !== command.eventId || result.data.organizationId !== command.organizationId || result.data.rfpId !== command.rfpId || result.data.version !== command.version || result.data.vendorProfileId !== command.vendorProfileId || result.data.correlationId !== command.correlationId) throw new Error("Invalid RFP response normalization result");
    return result.data;
  } catch (error) {
    if (error instanceof AuthorizationError) throw error;
    if (error instanceof Error && (error.message === "RFP response normalization unavailable" || error.message === "Invalid RFP response normalization result")) throw error;
    throw new Error("RFP response normalization unavailable");
  }
}
