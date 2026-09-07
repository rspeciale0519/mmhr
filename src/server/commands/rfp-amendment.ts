import "server-only";
import { z } from "zod";
import { AuthorizationError, requirePermission, type AuthorizationOptions } from "@/server/auth/authorization";
import { rfpAmendmentCommandSchema, type RfpAmendmentItem } from "@/server/workflows/rfp-amendment-contract";

const uuid = z.uuid().transform((value) => value.toLowerCase());
const resultSchema = z.strictObject({ amendmentId: uuid, rfpId: uuid, organizationId: uuid, vendorProfileId: uuid, baseVersion: z.number().int().positive(), version: z.number().int().positive(), status: z.enum(["draft", "approved"]), title: z.string().min(1).max(200), items: z.array(z.unknown()), approvedByIdentityId: uuid.nullable(), approvedAt: z.iso.datetime({ offset: true }).nullable(), approvalReference: z.string().nullable(), outcomeCode: z.enum(["created", "approved", "replayed"]), correlationId: uuid });
export type RfpAmendmentResult = z.infer<typeof resultSchema> & { items: RfpAmendmentItem[] };

export async function recordRfpAmendment(input: unknown, options: AuthorizationOptions = {}): Promise<RfpAmendmentResult> {
  const parsed = rfpAmendmentCommandSchema.safeParse(input);
  if (!parsed.success) throw new Error("Invalid RFP amendment input");
  const command = parsed.data;
  try {
    const context = await requirePermission(command.action === "approve" ? "rfp.approve" : "workspace.access", { kind: "organization", organizationId: command.organizationId }, options);
    if (context.scope.kind !== "organization" || context.scope.organizationId !== command.organizationId || context.identityId !== command.actorIdentityId) throw new AuthorizationError();
    const response = await context.supabase.rpc("mmhr_record_rfp_amendment", { payload: command, correlation_id: command.correlationId, idempotency_key: command.idempotencyKey });
    if (response.error) throw new Error("RFP amendment unavailable");
    const result = resultSchema.safeParse(response.data);
    if (!result.success || result.data.amendmentId !== command.amendmentId || result.data.organizationId !== command.organizationId || result.data.rfpId !== command.rfpId || result.data.vendorProfileId !== command.vendorProfileId || result.data.baseVersion !== command.baseVersion || result.data.version !== command.version || result.data.correlationId !== command.correlationId) throw new Error("Invalid RFP amendment response");
    return result.data as RfpAmendmentResult;
  } catch (error) {
    if (error instanceof AuthorizationError) throw error;
    if (error instanceof Error && (error.message === "RFP amendment unavailable" || error.message === "Invalid RFP amendment response")) throw error;
    throw new Error("RFP amendment unavailable");
  }
}
