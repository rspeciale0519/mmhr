import "server-only";
import { z } from "zod";
import { AuthorizationError, requirePermission, type AuthorizationOptions } from "@/server/auth/authorization";

const uuid = z.uuid().transform((value) => value.toLowerCase());
export const rfpApprovalCommandSchema = z.strictObject({ rfpId: uuid, organizationId: uuid, actorIdentityId: uuid, version: z.number().int().min(1).max(10_000), approvalReference: z.string().trim().max(263).regex(/^approval:[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/), correlationId: uuid, idempotencyKey: uuid });
const resultSchema = z.strictObject({ rfpId: uuid, organizationId: uuid, sourceIntakeId: uuid, version: z.number().int().positive(), status: z.literal("approved"), approvedByIdentityId: uuid, approvedAt: z.iso.datetime({ offset: true }), approvalReference: z.string().regex(/^approval:/), outcomeCode: z.enum(["approved", "replayed"]), correlationId: uuid });
export type RfpApprovalResult = z.infer<typeof resultSchema>;

export async function approveRfpVersion(input: unknown, options: AuthorizationOptions = {}): Promise<RfpApprovalResult> {
  const parsed = rfpApprovalCommandSchema.safeParse(input);
  if (!parsed.success) throw new Error("Invalid RFP approval input");
  const command = parsed.data;
  try {
    const context = await requirePermission("rfp.approve", { kind: "organization", organizationId: command.organizationId }, options);
    if (context.scope.kind !== "organization" || context.scope.organizationId !== command.organizationId || context.identityId !== command.actorIdentityId) throw new AuthorizationError();
    const response = await context.supabase.rpc("mmhr_approve_rfp_version", { payload: command, correlation_id: command.correlationId, idempotency_key: command.idempotencyKey });
    if (response.error) throw new Error("RFP approval unavailable");
    const result = resultSchema.safeParse(response.data);
    if (!result.success || result.data.rfpId !== command.rfpId || result.data.organizationId !== command.organizationId || result.data.version !== command.version || result.data.correlationId !== command.correlationId) throw new Error("Invalid RFP approval response");
    return result.data;
  } catch (error) {
    if (error instanceof AuthorizationError) throw error;
    if (error instanceof Error && (error.message === "RFP approval unavailable" || error.message === "Invalid RFP approval response")) throw error;
    throw new Error("RFP approval unavailable");
  }
}
