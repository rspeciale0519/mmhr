import "server-only";
import { z } from "zod";
import { AuthorizationError, requirePermission, type AuthorizationOptions } from "@/server/auth/authorization";

const uuid = z.uuid().transform((value) => value.toLowerCase());
export const rfpClarificationCommandSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("ask"), clarificationId: uuid, rfpId: uuid, organizationId: uuid, actorIdentityId: uuid, version: z.number().int().min(1).max(10_000), question: z.string().trim().min(1).max(5_000), correlationId: uuid, idempotencyKey: uuid }),
  z.strictObject({ action: z.literal("answer"), clarificationId: uuid, rfpId: uuid, organizationId: uuid, actorIdentityId: uuid, version: z.number().int().min(1).max(10_000), answer: z.string().trim().min(1).max(5_000), changeSummary: z.string().trim().min(1).max(5_000).nullable().optional(), decision: z.enum(["accepted", "rejected", "deferred"]), correlationId: uuid, idempotencyKey: uuid }),
  z.strictObject({ action: z.literal("approve"), clarificationId: uuid, rfpId: uuid, organizationId: uuid, actorIdentityId: uuid, version: z.number().int().min(1).max(10_000), approvalReference: z.string().trim().regex(/^approval:[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/), correlationId: uuid, idempotencyKey: uuid }),
]);
const resultSchema = z.strictObject({ clarificationId: uuid, rfpId: uuid, organizationId: uuid, version: z.number().int().positive(), question: z.string().min(1).max(5_000), answer: z.string().min(1).max(5_000).nullable(), changeSummary: z.string().min(1).max(5_000).nullable(), decision: z.enum(["pending", "accepted", "rejected", "deferred"]), status: z.enum(["pending", "answered", "approved", "rejected"]), askedByIdentityId: uuid, answeredByIdentityId: uuid.nullable(), approvedByIdentityId: uuid.nullable(), approvedAt: z.iso.datetime({ offset: true }).nullable(), approvalReference: z.string().regex(/^approval:/).nullable(), outcomeCode: z.enum(["recorded", "replayed"]), correlationId: uuid });
export type RfpClarificationResult = z.infer<typeof resultSchema>;

export async function recordRfpClarification(input: unknown, options: AuthorizationOptions = {}): Promise<RfpClarificationResult> {
  const parsed = rfpClarificationCommandSchema.safeParse(input);
  if (!parsed.success) throw new Error("Invalid RFP clarification input");
  const command = parsed.data;
  try {
    const context = await requirePermission("workspace.access", { kind: "organization", organizationId: command.organizationId }, options);
    if (context.scope.kind !== "organization" || context.scope.organizationId !== command.organizationId || context.identityId !== command.actorIdentityId) throw new AuthorizationError();
    const response = await context.supabase.rpc("mmhr_record_rfp_clarification", { payload: command, correlation_id: command.correlationId, idempotency_key: command.idempotencyKey });
    if (response.error) throw new Error("RFP clarification unavailable");
    const result = resultSchema.safeParse(response.data);
    if (!result.success || result.data.clarificationId !== command.clarificationId || result.data.rfpId !== command.rfpId || result.data.organizationId !== command.organizationId || result.data.version !== command.version || result.data.correlationId !== command.correlationId) throw new Error("Invalid RFP clarification response");
    return result.data;
  } catch (error) {
    if (error instanceof AuthorizationError) throw error;
    if (error instanceof Error && (error.message === "RFP clarification unavailable" || error.message === "Invalid RFP clarification response")) throw error;
    throw new Error("RFP clarification unavailable");
  }
}
