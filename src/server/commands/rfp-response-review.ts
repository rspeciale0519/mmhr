import "server-only";
import { z } from "zod";
import { AuthorizationError, requirePermission, type AuthorizationOptions } from "@/server/auth/authorization";

const uuid = z.uuid().transform((value) => value.toLowerCase());
export const rfpResponseReviewSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("review"), normalizationId: uuid, organizationId: uuid, rfpId: uuid, version: z.number().int().min(1).max(10_000), actorIdentityId: uuid, correlationId: uuid, idempotencyKey: uuid }),
  z.strictObject({ action: z.literal("approve"), normalizationId: uuid, organizationId: uuid, rfpId: uuid, version: z.number().int().min(1).max(10_000), actorIdentityId: uuid, approvalReference: z.string().trim().regex(/^approval:[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/), correlationId: uuid, idempotencyKey: uuid }),
  z.strictObject({ action: z.literal("reject"), normalizationId: uuid, organizationId: uuid, rfpId: uuid, version: z.number().int().min(1).max(10_000), actorIdentityId: uuid, correlationId: uuid, idempotencyKey: uuid }),
]);
const resultSchema = z.strictObject({ normalizationId: uuid, organizationId: uuid, rfpId: uuid, version: z.number().int().positive(), state: z.enum(["pending", "reviewed", "approved", "rejected"]), reviewedByIdentityId: uuid.nullable(), approvedByIdentityId: uuid.nullable(), approvalReference: z.string().regex(/^approval:/).nullable(), outcomeCode: z.enum(["recorded", "replayed"]), correlationId: uuid });
export type RfpResponseReviewResult = z.infer<typeof resultSchema>;

export async function reviewRfpResponseNormalization(input: unknown, options: AuthorizationOptions = {}): Promise<RfpResponseReviewResult> {
  const parsed = rfpResponseReviewSchema.safeParse(input);
  if (!parsed.success) throw new Error("Invalid RFP response review input");
  const command = parsed.data;
  try {
    const context = await requirePermission("rfp.approve", { kind: "organization", organizationId: command.organizationId }, { ...options, correlationId: command.correlationId });
    if (context.scope.kind !== "organization" || context.scope.organizationId !== command.organizationId || context.identityId !== command.actorIdentityId) throw new AuthorizationError();
    const response = await context.supabase.rpc("mmhr_review_rfp_response_normalization", { payload: command, correlation_id: command.correlationId, idempotency_key: command.idempotencyKey });
    if (response.error) throw new Error("RFP response review unavailable");
    const result = resultSchema.safeParse(response.data);
    if (!result.success || result.data.normalizationId !== command.normalizationId || result.data.organizationId !== command.organizationId || result.data.rfpId !== command.rfpId || result.data.version !== command.version || result.data.correlationId !== command.correlationId) throw new Error("Invalid RFP response review result");
    return result.data;
  } catch (error) {
    if (error instanceof AuthorizationError) throw error;
    if (error instanceof Error && (error.message === "RFP response review unavailable" || error.message === "Invalid RFP response review result")) throw error;
    throw new Error("RFP response review unavailable");
  }
}
