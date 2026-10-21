import { TRPCError } from "@trpc/server";
import {
  managedFinanceCommandSchema,
  managedFinanceDetailSchema,
  managedFinanceReadSchema,
} from "@/lib/managed-finance-workflow";
import { managedFinanceOriginalChoicesSchema } from "@/lib/managed-finance-originals";
import { AuthorizationError } from "@/server/auth/authorization";
import { readSelectedOrganizationId } from "@/server/auth/page-guards";
import {
  executeManagedFinanceCommand,
  getManagedFinanceDetail,
  getManagedFinanceOriginals,
  getManagedFinancePage,
} from "@/server/commands/managed-finance";
import { FinanceDocumentConflictError, FinanceDocumentInputError } from "@/server/commands/finance-document-errors";
import { permissionProcedure, router } from "../trpc";

const resolveScope = (input: { organizationId: string }) => ({ kind: "organization" as const,
  organizationId: input.organizationId });

async function resolve<T>(organizationId: string, operation: () => Promise<T>) {
  try {
    if (await readSelectedOrganizationId() !== organizationId) throw new AuthorizationError();
    return await operation();
  } catch (error) {
    throw new TRPCError({ code: error instanceof AuthorizationError ? "NOT_FOUND"
      : error instanceof FinanceDocumentInputError ? "BAD_REQUEST"
      : error instanceof FinanceDocumentConflictError ? "CONFLICT" : "INTERNAL_SERVER_ERROR",
    message: "Managed finance request failed" });
  }
}

export const managedFinanceRouter = router({
  list: permissionProcedure({ permission: "finance.manage", input: managedFinanceReadSchema, resolveScope })
    .query(({ ctx, input }) => resolve(input.organizationId, () => getManagedFinancePage(input, { supabase: ctx.supabase }))),
  detail: permissionProcedure({ permission: "finance.manage", input: managedFinanceDetailSchema, resolveScope })
    .query(({ ctx, input }) => resolve(input.organizationId, () => getManagedFinanceDetail(input, { supabase: ctx.supabase }))),
  originals: permissionProcedure({ permission: "finance.manage", input: managedFinanceOriginalChoicesSchema, resolveScope })
    .query(({ ctx, input }) => resolve(input.organizationId, () => getManagedFinanceOriginals(input, { supabase: ctx.supabase }))),
  execute: permissionProcedure({ permission: "finance.manage", input: managedFinanceCommandSchema, resolveScope })
    .mutation(({ ctx, input }) => resolve(input.organizationId, () => executeManagedFinanceCommand(input, { supabase: ctx.supabase }))),
});
