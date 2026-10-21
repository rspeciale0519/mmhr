import "server-only";
import { z } from "zod";
import { AuthorizationError, requirePermission, type AuthorizationOptions } from "@/server/auth/authorization";

const uuid = z.uuid().transform((value) => value.toLowerCase());
export const rfpResponseIngestionSchema = z.strictObject({ eventId: uuid, providerEventId: z.string().trim().min(1).max(200), organizationId: uuid, rfpId: uuid, version: z.number().int().min(1).max(10_000), vendorProfileId: uuid, actorIdentityId: uuid, conversationToken: z.string().trim().min(1).max(300), senderAddress: z.string().trim().min(1).max(320), recipientAddresses: z.array(z.string().trim().min(1).max(320)).min(1).max(50), subject: z.string().trim().max(500).nullable().optional(), bodyReference: z.string().trim().min(1).max(500), attachmentReferences: z.array(z.string().trim().min(1).max(500)).max(50), rawBodyHash: z.string().regex(/^[0-9a-f]{64}$/i), signedAt: z.iso.datetime({ offset: true }), receivedAt: z.iso.datetime({ offset: true }), signature: z.string().trim().min(1).max(500), correlationId: uuid, idempotencyKey: uuid });
const resultSchema = z.strictObject({ eventId: uuid, providerEventId: z.string().min(1).max(200), organizationId: uuid, rfpId: uuid, version: z.number().int().positive(), vendorProfileId: uuid, associationState: z.enum(["associated", "needs_attention", "failed"]), receivedAt: z.iso.datetime({ offset: true }), attachmentCount: z.number().int().min(0).max(50), outcomeCode: z.enum(["ingested", "replayed"]), correlationId: uuid });
export type RfpResponseIngestionResult = z.infer<typeof resultSchema>;

export async function ingestRfpResponse(input: unknown, options: AuthorizationOptions = {}): Promise<RfpResponseIngestionResult> {
  const parsed = rfpResponseIngestionSchema.safeParse(input);
  if (!parsed.success) throw new Error("Invalid RFP response input");
  const command = parsed.data;
  try {
    const context = await requirePermission("workspace.access", { kind: "organization", organizationId: command.organizationId }, options);
    if (context.scope.kind !== "organization" || context.scope.organizationId !== command.organizationId || context.identityId !== command.actorIdentityId) throw new AuthorizationError();
    const response = await context.supabase.rpc("mmhr_ingest_rfp_response", { payload: command, correlation_id: command.correlationId, idempotency_key: command.idempotencyKey });
    if (response.error) throw new Error("RFP response unavailable");
    const result = resultSchema.safeParse(response.data);
    if (!result.success || result.data.eventId !== command.eventId || result.data.organizationId !== command.organizationId || result.data.rfpId !== command.rfpId || result.data.version !== command.version || result.data.vendorProfileId !== command.vendorProfileId || result.data.correlationId !== command.correlationId) throw new Error("Invalid RFP response result");
    return result.data;
  } catch (error) {
    if (error instanceof AuthorizationError) throw error;
    if (error instanceof Error && (error.message === "RFP response unavailable" || error.message === "Invalid RFP response result")) throw error;
    throw new Error("RFP response unavailable");
  }
}
