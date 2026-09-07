import "server-only";

import { z } from "zod";
import { AuthorizationError, requirePermission, type AuthorizationOptions } from "@/server/auth/authorization";

const uuid = z.uuid().transform((value) => value.toLowerCase());
const base = { organizationId: uuid, actorIdentityId: uuid, runId: uuid, sourceId: uuid, correlationId: uuid, idempotencyKey: uuid };
const artifacts = z.array(z.string().trim().min(1).max(500)).max(50);
export const vendorAcquisitionCommandSchema = z.discriminatedUnion("action", [
  z.strictObject({ ...base, action: z.literal("create"), mode: z.enum(["manual", "automated"]), adapterId: z.string().trim().regex(/^[a-z][a-z0-9._-]{0,127}$/).nullable() }).superRefine((value, context) => { if (value.mode === "manual" && value.adapterId !== null) context.addIssue({ code: "custom", path: ["adapterId"], message: "Manual acquisition cannot select an adapter" }); if (value.mode === "automated" && value.adapterId === null) context.addIssue({ code: "custom", path: ["adapterId"], message: "Automated acquisition requires an adapter" }); }),
  z.strictObject({ ...base, action: z.literal("start"), expectedRevision: z.number().int().positive() }),
  z.strictObject({ ...base, action: z.literal("complete"), expectedRevision: z.number().int().positive(), artifactReferences: artifacts }),
  z.strictObject({ ...base, action: z.literal("fail"), expectedRevision: z.number().int().positive(), failureCode: z.enum(["provider_unavailable", "invalid_response", "manual_required"]) }),
]);
const resultSchema = z.strictObject({ runId: uuid, sourceId: uuid, organizationId: uuid, mode: z.enum(["manual", "automated"]), adapterId: z.string().nullable(), status: z.enum(["queued", "running", "succeeded", "failed", "needs_review"]), revision: z.number().int().positive(), outcomeCode: z.enum(["recorded", "replayed"]), correlationId: uuid });

export async function recordVendorAcquisition(input: unknown, options: AuthorizationOptions = {}) {
  const parsed = vendorAcquisitionCommandSchema.safeParse(input); if (!parsed.success) throw new Error("Invalid vendor acquisition input");
  try {
    const context = await requirePermission("workspace.access", { kind: "organization", organizationId: parsed.data.organizationId }, options);
    if (context.scope.kind !== "organization" || context.scope.organizationId !== parsed.data.organizationId || context.identityId !== parsed.data.actorIdentityId) throw new AuthorizationError();
    const response = await context.supabase.rpc("mmhr_record_vendor_acquisition", { payload: parsed.data, correlation_id: parsed.data.correlationId, idempotency_key: parsed.data.idempotencyKey });
    if (response.error) throw new Error("Vendor acquisition unavailable"); const result = resultSchema.safeParse(response.data);
    if (!result.success || result.data.organizationId !== parsed.data.organizationId || result.data.runId !== parsed.data.runId || result.data.sourceId !== parsed.data.sourceId || result.data.correlationId !== parsed.data.correlationId) throw new Error("Invalid vendor acquisition result"); return result.data;
  } catch (error) { if (error instanceof AuthorizationError) throw error; if (error instanceof Error && (error.message === "Vendor acquisition unavailable" || error.message === "Invalid vendor acquisition result")) throw error; throw new Error("Vendor acquisition unavailable"); }
}
