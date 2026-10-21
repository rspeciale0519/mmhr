import "server-only";
import { z } from "zod";
import { AuthorizationError, requirePermission, type AuthorizationOptions } from "@/server/auth/authorization";
import { vendorCatalogReadSchema, vendorCatalogApprovalSchema, vendorCatalogProfileSchema } from "@/server/crm/vendor-catalog-contract";
import { VendorEvidenceCommandError } from "./vendor-evidence-database";

async function access(organizationId: string, write: boolean, options: AuthorizationOptions) {
  const context = await requirePermission(write ? "audit.export" : "workspace.access", { kind: "organization", organizationId }, options);
  if (context.scope.kind !== "organization" || context.scope.organizationId !== organizationId) throw new AuthorizationError();
  const staff = await requirePermission("admin.access", { kind: "platform" }, { supabase: context.supabase });
  if (staff.identityId !== context.identityId || staff.scope.kind !== "platform") throw new AuthorizationError();
  return context;
}

export async function getVendorCatalogProfile(input: unknown, options: AuthorizationOptions = {}) {
  const parsed = vendorCatalogReadSchema.safeParse(input);
  if (!parsed.success) throw new VendorEvidenceCommandError("INVALID_INPUT");
  const context = await access(parsed.data.organizationId, false, options);
  const response = await context.supabase.rpc("mmhr_get_vendor_catalog_profile", { payload: parsed.data });
  if (response.error) throw new VendorEvidenceCommandError("UNAVAILABLE");
  const result = vendorCatalogProfileSchema.safeParse(response.data);
  if (!result.success || result.data.organizationId !== parsed.data.organizationId || result.data.profileId !== parsed.data.profileId)
    throw new VendorEvidenceCommandError("INVALID_RESPONSE");
  return result.data;
}

const approvalResult = vendorCatalogProfileSchema.extend({ outcomeCode: z.enum(["approved", "replayed"]), correlationId: z.uuid() });
export async function approveVendorCatalogProfile(input: unknown, options: AuthorizationOptions = {}) {
  const parsed = vendorCatalogApprovalSchema.safeParse(input);
  if (!parsed.success) throw new VendorEvidenceCommandError("INVALID_INPUT");
  const context = await access(parsed.data.organizationId, true, options);
  const { idempotencyKey, ...payload } = parsed.data;
  const response = await context.supabase.rpc("mmhr_approve_vendor_catalog_profile", {
    payload, correlation_id: idempotencyKey, idempotency_key: idempotencyKey,
  });
  if (response.error) throw new VendorEvidenceCommandError("UNAVAILABLE");
  const result = approvalResult.safeParse(response.data);
  if (!result.success || result.data.organizationId !== payload.organizationId || result.data.profileId !== payload.profileId
    || result.data.correlationId !== idempotencyKey || result.data.approvedAt === null)
    throw new VendorEvidenceCommandError("INVALID_RESPONSE");
  return result.data;
}
