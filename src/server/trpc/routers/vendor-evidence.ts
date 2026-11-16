import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { AuthorizationError, requirePermission, type AuthorizationContext } from "@/server/auth/authorization";
import { vendorEvidenceApprovalSchema, vendorEvidenceRecordSchema, vendorEvidenceReadInputSchema } from "@/server/crm/vendor-evidence-contract";
import { approveVendorEvidence, recordVendorEvidence, getVendorEvidence, VendorEvidenceCommandError } from "@/server/commands/vendor-evidence-database";
import { permissionProcedure, router } from "../trpc";
import {
  createProduct, createProductInputSchema, CrmDatabaseCommandError, updateProduct, updateProductInputSchema,
} from "@/server/commands/crm-database";
import { approveVendorCatalogProfile } from "@/server/commands/vendor-catalog";
import { vendorCatalogApprovalSchema } from "@/server/crm/vendor-catalog-contract";

async function staffResult<T>(authorization: AuthorizationContext, operation: () => Promise<T>) {
  try {
    const staff = await requirePermission("admin.access", { kind: "platform" }, { supabase: authorization.supabase });
    if (staff.identityId !== authorization.identityId || staff.scope.kind !== "platform") throw new AuthorizationError();
    return await operation();
  } catch (error) {
    throw new TRPCError({
      code: error instanceof AuthorizationError ? "NOT_FOUND"
        : (error instanceof VendorEvidenceCommandError || error instanceof CrmDatabaseCommandError)
          && error.code === "INVALID_INPUT" ? "BAD_REQUEST"
        // The fixed CRM RPC refused the command, for example a duplicate product key or a stale revision.
        : error instanceof CrmDatabaseCommandError && error.code === "REJECTED" ? "CONFLICT" : "INTERNAL_SERVER_ERROR",
      message: "Vendor evidence request failed",
    });
  }
}

export const vendorEvidenceRouter = router({
  approveProfile: permissionProcedure({
    permission: "audit.export", input: vendorCatalogApprovalSchema,
    resolveScope: input => ({ kind: "organization", organizationId: input.organizationId }),
  }).mutation(({ ctx, input }) => staffResult(ctx.authorization,
    () => approveVendorCatalogProfile(input, { supabase: ctx.supabase }))),
  // Staff add a draft product to the selected vendor workspace. Activation stays a separate review step.
  createProduct: permissionProcedure({
    permission: "workspace.access", input: createProductInputSchema.omit({ status: true }),
    resolveScope: (input) => ({ kind: "organization", organizationId: input.organizationId }),
  }).mutation(({ ctx, input }) => staffResult(ctx.authorization,
    () => createProduct({ ...input, status: "draft" }, { supabase: ctx.supabase }))),
  activateProduct: permissionProcedure({
    permission: "workspace.access", input: z.strictObject({
      organizationId: updateProductInputSchema.shape.organizationId,
      productId: updateProductInputSchema.shape.productId,
      expectedRevision: updateProductInputSchema.shape.expectedRevision,
      idempotencyKey: updateProductInputSchema.shape.idempotencyKey,
    }),
    resolveScope: (input) => ({ kind: "organization", organizationId: input.organizationId }),
  }).mutation(({ ctx, input }) => staffResult(ctx.authorization,
    () => updateProduct({ ...input, status: "active" }, { supabase: ctx.supabase }))),
  list: permissionProcedure({
    permission: "workspace.access", input: vendorEvidenceReadInputSchema,
    resolveScope: (input) => ({ kind: "organization", organizationId: input.organizationId }),
  }).query(({ ctx, input }) => staffResult(ctx.authorization,
    () => getVendorEvidence(input, { supabase: ctx.supabase }))),
  record: permissionProcedure({
    permission: "workspace.access", input: vendorEvidenceRecordSchema,
    resolveScope: (input) => ({ kind: "organization", organizationId: input.source.organizationId }),
  }).mutation(({ ctx, input }) => staffResult(ctx.authorization,
    () => recordVendorEvidence(input, { supabase: ctx.supabase }))),
  decide: permissionProcedure({
    permission: "audit.export", input: vendorEvidenceApprovalSchema.omit({ reviewerIdentityId: true }),
    resolveScope: (input) => ({ kind: "organization", organizationId: input.organizationId }),
  }).mutation(({ ctx, input }) => staffResult(ctx.authorization,
    () => approveVendorEvidence({ ...input, reviewerIdentityId: ctx.authorization.identityId }, { supabase: ctx.supabase }))),
});
