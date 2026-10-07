import { TRPCError } from "@trpc/server";
import { staffAuditSearchSchema } from "@/lib/staff-audit";
import { AuthorizationError } from "@/server/auth/authorization";
import { searchStaffAudit, StaffAuditInputError } from "@/server/audit/staff-audit-read";
import { permissionProcedure, router } from "../trpc";

export const auditRouter = router({
  // A POST-only transport read keeps caller-supplied actor references out of URLs.
  // No business state or audit record is written by this procedure.
  search: permissionProcedure({ permission: "audit.view", input: staffAuditSearchSchema,
    resolveScope: input => input.organizationId === null ? { kind: "platform" }
      : { kind: "organization", organizationId: input.organizationId } })
    .mutation(async ({ ctx, input }) => {
      try { return await searchStaffAudit(input, { supabase: ctx.supabase }); }
      catch (error) {
        throw new TRPCError({ code: error instanceof AuthorizationError ? "FORBIDDEN"
          : error instanceof StaffAuditInputError ? "BAD_REQUEST" : "INTERNAL_SERVER_ERROR",
          message: error instanceof StaffAuditInputError ? "Audit search fields are invalid" : "Audit search is unavailable" });
      }
    }),
});
