import "server-only";
import { z } from "zod";
import { AuthorizationError, requirePermission, type AuthorizationOptions } from "@/server/auth/authorization";

const uuid = z.uuid().transform((value) => value.toLowerCase());
const recipient = z.strictObject({ recipientId: uuid, vendorProfileId: uuid, deadlineAt: z.iso.datetime({ offset: true }), reminderAt: z.iso.datetime({ offset: true }).nullable().optional(), deliveryReference: z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/) });
export const rfpDistributionCommandSchema = z.strictObject({ rfpId: uuid, organizationId: uuid, actorIdentityId: uuid, version: z.number().int().min(1).max(10_000), recipients: z.array(recipient).min(1).max(100), correlationId: uuid, idempotencyKey: uuid }).superRefine((value, context) => { const recipientIds = value.recipients.map((item) => item.recipientId); const vendorIds = value.recipients.map((item) => item.vendorProfileId); if (new Set(recipientIds).size !== recipientIds.length || new Set(vendorIds).size !== vendorIds.length) context.addIssue({ code: "custom", path: ["recipients"], message: "RFP recipients must be unique" }); for (const item of value.recipients) if (item.reminderAt && new Date(item.reminderAt) > new Date(item.deadlineAt)) context.addIssue({ code: "custom", path: ["recipients"], message: "Reminder must not follow deadline" }); });
const resultSchema = z.strictObject({ rfpId: uuid, organizationId: uuid, version: z.number().int().positive(), status: z.literal("distributed"), recipients: z.array(z.strictObject({ recipientId: uuid, vendorProfileId: uuid, state: z.literal("distributed"), sentAt: z.iso.datetime({ offset: true }), deadlineAt: z.iso.datetime({ offset: true }), reminderAt: z.iso.datetime({ offset: true }).nullable(), acknowledgedAt: z.iso.datetime({ offset: true }).nullable(), deliveryReference: z.string().min(1).max(256) })), outcomeCode: z.enum(["distributed", "replayed"]), correlationId: uuid });
export type RfpDistributionResult = z.infer<typeof resultSchema>;

export async function distributeRfpVersion(input: unknown, options: AuthorizationOptions = {}): Promise<RfpDistributionResult> {
  const parsed = rfpDistributionCommandSchema.safeParse(input);
  if (!parsed.success) throw new Error("Invalid RFP distribution input");
  const command = parsed.data;
  try {
    const context = await requirePermission("rfp.distribute", { kind: "organization", organizationId: command.organizationId }, options);
    if (context.scope.kind !== "organization" || context.scope.organizationId !== command.organizationId || context.identityId !== command.actorIdentityId) throw new AuthorizationError();
    const response = await context.supabase.rpc("mmhr_distribute_rfp_version", { payload: command, correlation_id: command.correlationId, idempotency_key: command.idempotencyKey });
    if (response.error) throw new Error("RFP distribution unavailable");
    const result = resultSchema.safeParse(response.data);
    if (!result.success || result.data.rfpId !== command.rfpId || result.data.organizationId !== command.organizationId || result.data.version !== command.version || result.data.correlationId !== command.correlationId) throw new Error("Invalid RFP distribution response");
    return result.data;
  } catch (error) {
    if (error instanceof AuthorizationError) throw error;
    if (error instanceof Error && (error.message === "RFP distribution unavailable" || error.message === "Invalid RFP distribution response")) throw error;
    throw new Error("RFP distribution unavailable");
  }
}
