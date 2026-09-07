import "server-only";
import { z } from "zod";
import { AuthorizationError, requirePermission, type AuthorizationOptions } from "@/server/auth/authorization";

const uuid = z.uuid().transform((value) => value.toLowerCase());
const timestamp = z.iso.datetime({ offset: true });
export const vendorFactOverrideCommandSchema = z.strictObject({
  action: z.literal("create"), overrideId: uuid, organizationId: uuid, factId: uuid, sourceId: uuid,
  value: z.string().trim().min(1).max(2_000), approvedByIdentityId: uuid, approvedAt: timestamp,
  expiresAt: timestamp, reason: z.string().trim().min(1).max(500), correlationId: uuid, idempotencyKey: uuid,
}).superRefine((value, context) => { if (Date.parse(value.expiresAt) < Date.parse(value.approvedAt)) context.addIssue({ code: "custom", path: ["expiresAt"], message: "Override expiry must not precede approval" }); });
const resultSchema = z.strictObject({ overrideId: uuid, organizationId: uuid, factId: uuid.optional(), sourceId: uuid.optional(), expiresAt: z.string().optional(), outcomeCode: z.enum(["recorded", "replayed"]), correlationId: uuid });
export async function recordVendorFactOverride(input: unknown, options: AuthorizationOptions = {}) {
  const command = vendorFactOverrideCommandSchema.safeParse(input); if (!command.success) throw new Error("Invalid vendor fact override input");
  try { const context = await requirePermission("audit.export", { kind: "organization", organizationId: command.data.organizationId }, options); if (context.scope.kind !== "organization" || context.scope.organizationId !== command.data.organizationId || context.identityId !== command.data.approvedByIdentityId) throw new AuthorizationError(); const response = await context.supabase.rpc("mmhr_record_vendor_fact_override", { payload: command.data, correlation_id: command.data.correlationId, idempotency_key: command.data.idempotencyKey }); if (response.error) throw new Error("Vendor fact override unavailable"); const result = resultSchema.safeParse(response.data); if (!result.success || result.data.organizationId !== command.data.organizationId || result.data.overrideId !== command.data.overrideId || result.data.correlationId !== command.data.correlationId) throw new Error("Invalid vendor fact override result"); return result.data; } catch (error) { if (error instanceof AuthorizationError) throw error; if (error instanceof Error && (error.message === "Vendor fact override unavailable" || error.message === "Invalid vendor fact override result")) throw error; throw new Error("Vendor fact override unavailable"); }
}
