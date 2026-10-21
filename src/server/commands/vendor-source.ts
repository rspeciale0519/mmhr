import "server-only";

import { z } from "zod";
import { AuthorizationError, requirePermission, type AuthorizationOptions } from "@/server/auth/authorization";

const uuid = z.uuid().transform((value) => value.toLowerCase());
const timestamp = z.iso.datetime({ offset: true });
const base = { organizationId: uuid, actorIdentityId: uuid, sourceId: uuid, correlationId: uuid, idempotencyKey: uuid };

export const vendorSourceCommandSchema = z.discriminatedUnion("action", [
  z.strictObject({ ...base, action: z.literal("create"), vendorProfileId: uuid, ownerIdentityId: uuid, uri: z.url().refine((value) => value.startsWith("https://"), "Vendor source must use HTTPS"), sourceType: z.enum(["vendor_owned", "licensed", "manual"]), captureMethod: z.enum(["api", "web", "document", "email", "manual", "other"]), cadenceDays: z.number().int().min(1).max(3650), licenseNote: z.string().trim().max(500).nullable(), reviewRequired: z.boolean(), capturedAt: timestamp }),
  z.strictObject({ ...base, action: z.literal("retire"), expectedRevision: z.number().int().positive(), reason: z.string().trim().min(1).max(500) }),
]);
const resultSchema = z.strictObject({ sourceId: uuid, organizationId: uuid, active: z.boolean().optional(), revision: z.number().int().positive().optional(), outcomeCode: z.enum(["recorded", "replayed"]), correlationId: uuid });

export async function recordVendorSource(input: unknown, options: AuthorizationOptions = {}) {
  const parsed = vendorSourceCommandSchema.safeParse(input);
  if (!parsed.success) throw new Error("Invalid vendor source input");
  try {
    const context = await requirePermission("workspace.access", { kind: "organization", organizationId: parsed.data.organizationId }, options);
    if (context.scope.kind !== "organization" || context.scope.organizationId !== parsed.data.organizationId || context.identityId !== parsed.data.actorIdentityId) throw new AuthorizationError();
    const response = await context.supabase.rpc("mmhr_record_vendor_source", { payload: parsed.data, correlation_id: parsed.data.correlationId, idempotency_key: parsed.data.idempotencyKey });
    if (response.error) throw new Error("Vendor source unavailable");
    const result = resultSchema.safeParse(response.data);
    if (!result.success || result.data.organizationId !== parsed.data.organizationId || result.data.sourceId !== parsed.data.sourceId || result.data.correlationId !== parsed.data.correlationId) throw new Error("Invalid vendor source result");
    return result.data;
  } catch (error) {
    if (error instanceof AuthorizationError) throw error;
    if (error instanceof Error && (error.message === "Vendor source unavailable" || error.message === "Invalid vendor source result")) throw error;
    throw new Error("Vendor source unavailable");
  }
}
