import "server-only";
import { z } from "zod";
import { AuthorizationError, requirePermission, type AuthorizationOptions } from "@/server/auth/authorization";

const uuid = z.uuid().transform((value) => value.toLowerCase());
export const rfpResponseClarificationSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("ask"), clarificationId: uuid, normalizationId: uuid, organizationId: uuid, rfpId: uuid, version: z.number().int().min(1).max(10_000), actorIdentityId: uuid, question: z.string().trim().min(1).max(5_000), deadlineAt: z.iso.datetime({ offset: true }).nullable().optional(), correlationId: uuid, idempotencyKey: uuid }),
  z.strictObject({ action: z.literal("respond"), clarificationId: uuid, normalizationId: uuid, organizationId: uuid, rfpId: uuid, version: z.number().int().min(1).max(10_000), actorIdentityId: uuid, answer: z.string().trim().min(1).max(5_000), changeSummary: z.string().trim().min(1).max(5_000).nullable().optional(), decision: z.enum(["accepted", "rejected", "deferred"]), responseReference: z.string().trim().min(1).max(500).nullable().optional(), correlationId: uuid, idempotencyKey: uuid }),
]);
const resultSchema = z.strictObject({ clarificationId: uuid, organizationId: uuid, rfpId: uuid, version: z.number().int().positive(), normalizationId: uuid, status: z.enum(["pending", "answered"]), decision: z.enum(["pending", "accepted", "rejected", "deferred"]), deadlineAt: z.iso.datetime({ offset: true }).nullable(), responseReference: z.string().min(1).max(500).nullable(), outcomeCode: z.enum(["recorded", "replayed"]), correlationId: uuid });
export type RfpResponseClarificationResult = z.infer<typeof resultSchema>;

export async function recordRfpResponseClarification(input: unknown, options: AuthorizationOptions = {}): Promise<RfpResponseClarificationResult> {
  const parsed = rfpResponseClarificationSchema.safeParse(input);
  if (!parsed.success) throw new Error("Invalid RFP response clarification input");
  const command = parsed.data;
  try {
    const context = await requirePermission("workspace.access", { kind: "organization", organizationId: command.organizationId }, options);
    if (context.scope.kind !== "organization" || context.scope.organizationId !== command.organizationId || context.identityId !== command.actorIdentityId) throw new AuthorizationError();
    const response = await context.supabase.rpc("mmhr_record_rfp_response_clarification", { payload: command, correlation_id: command.correlationId, idempotency_key: command.idempotencyKey });
    if (response.error) throw new Error("RFP response clarification unavailable");
    const result = resultSchema.safeParse(response.data);
    if (!result.success || result.data.clarificationId !== command.clarificationId || result.data.organizationId !== command.organizationId || result.data.rfpId !== command.rfpId || result.data.version !== command.version || result.data.normalizationId !== command.normalizationId || result.data.correlationId !== command.correlationId) throw new Error("Invalid RFP response clarification result");
    return result.data;
  } catch (error) {
    if (error instanceof AuthorizationError) throw error;
    if (error instanceof Error && (error.message === "RFP response clarification unavailable" || error.message === "Invalid RFP response clarification result")) throw error;
    throw new Error("RFP response clarification unavailable");
  }
}
