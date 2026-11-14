import { TRPCError } from "@trpc/server";
import { managedInvoiceCommandSchema, managedInvoiceDetailRequestSchema, managedInvoiceOwnerRequestSchema,
  managedInvoiceSourceRequestSchema } from "@/lib/managed-invoice";
import { AuthorizationError } from "@/server/auth/authorization";
import { readSelectedOrganizationId } from "@/server/auth/page-guards";
import { FinanceDocumentConflictError, FinanceDocumentInputError } from "@/server/commands/finance-document-errors";
import { executeManagedInvoiceCommand, getManagedInvoiceDetail, getManagedInvoiceOwners,
  getManagedInvoiceSource } from "@/server/commands/managed-invoice";
import { permissionProcedure, router } from "../trpc";

const resolveScope = (input: { organizationId: string }) => ({ kind: "organization" as const, organizationId: input.organizationId });
async function resolve<T>(organizationId: string, operation: () => Promise<T>) {
  try {
    if (await readSelectedOrganizationId() !== organizationId) throw new AuthorizationError();
    return await operation();
  } catch (error) {
    throw new TRPCError({ code: error instanceof AuthorizationError ? "NOT_FOUND"
      : error instanceof FinanceDocumentInputError ? "BAD_REQUEST"
      : error instanceof FinanceDocumentConflictError ? "CONFLICT" : "INTERNAL_SERVER_ERROR",
    message: "Managed invoice request failed" });
  }
}
export const managedInvoicesRouter = router({
  detail: permissionProcedure({ permission: "finance.manage", input: managedInvoiceDetailRequestSchema, resolveScope })
    .query(({ ctx, input }) => resolve(input.organizationId, () => getManagedInvoiceDetail(input, { supabase: ctx.supabase }))),
  owners: permissionProcedure({ permission: "finance.manage", input: managedInvoiceOwnerRequestSchema, resolveScope })
    .query(({ ctx, input }) => resolve(input.organizationId, () => getManagedInvoiceOwners(input, { supabase: ctx.supabase }))),
  source: permissionProcedure({ permission: "finance.manage", input: managedInvoiceSourceRequestSchema, resolveScope })
    .query(({ ctx, input }) => resolve(input.organizationId, () => getManagedInvoiceSource(input, { supabase: ctx.supabase }))),
  execute: permissionProcedure({ permission: "finance.manage", input: managedInvoiceCommandSchema, resolveScope })
    .mutation(({ ctx, input }) => resolve(input.organizationId, () => executeManagedInvoiceCommand(input, { supabase: ctx.supabase }))),
});
