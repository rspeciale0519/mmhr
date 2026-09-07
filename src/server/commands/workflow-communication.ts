import "server-only";
import { z } from "zod";
import { AuthorizationError, requirePermission, type AuthorizationOptions } from "@/server/auth/authorization";

const uuid = z.uuid().transform((value) => value.toLowerCase());
const refs = z.array(z.unknown()).max(50);
export const workflowCommunicationSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("queue"), communicationId: uuid, organizationId: uuid, actorIdentityId: uuid, direction: z.enum(["outbound", "inbound"]), templateKey: z.string().trim().min(1).max(128).nullable().optional(), recipientReferences: refs, associationReferences: refs, consent: z.string().trim().min(1).max(64).nullable().optional(), correlationId: uuid, idempotencyKey: uuid }),
  z.strictObject({ action: z.literal("update_delivery"), communicationId: uuid, organizationId: uuid, actorIdentityId: uuid, deliveryState: z.enum(["sent", "delivered", "failed", "bounced", "complained", "opted_out"]), providerMessageId: z.string().trim().min(1).max(200).nullable().optional(), correlationId: uuid, idempotencyKey: uuid }),
]);
const resultSchema = z.strictObject({ communicationId: uuid, organizationId: uuid, deliveryState: z.enum(["queued", "sent", "delivered", "failed", "bounced", "complained", "opted_out"]), providerMessageId: z.string().min(1).max(200).nullable(), outcomeCode: z.enum(["recorded", "replayed"]), correlationId: uuid });
export type WorkflowCommunicationResult = z.infer<typeof resultSchema>;
export async function recordWorkflowCommunication(input: unknown, options: AuthorizationOptions = {}): Promise<WorkflowCommunicationResult> {
  const parsed = workflowCommunicationSchema.safeParse(input); if (!parsed.success) throw new Error("Invalid communication input"); const command = parsed.data;
  try { const context = await requirePermission("workspace.access", { kind: "organization", organizationId: command.organizationId }, options); if (context.scope.kind !== "organization" || context.scope.organizationId !== command.organizationId || context.identityId !== command.actorIdentityId) throw new AuthorizationError(); const response = await context.supabase.rpc("mmhr_record_workflow_communication", { payload: command, correlation_id: command.correlationId, idempotency_key: command.idempotencyKey }); if (response.error) throw new Error("Communication unavailable"); const result = resultSchema.safeParse(response.data); if (!result.success || result.data.communicationId !== command.communicationId || result.data.organizationId !== command.organizationId || result.data.correlationId !== command.correlationId) throw new Error("Invalid communication result"); return result.data; } catch (error) { if (error instanceof AuthorizationError) throw error; if (error instanceof Error && (error.message === "Communication unavailable" || error.message === "Invalid communication result")) throw error; throw new Error("Communication unavailable"); }
}
