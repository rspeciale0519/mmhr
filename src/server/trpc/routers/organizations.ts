import { TRPCError } from "@trpc/server";
import { AuthorizationError } from "@/server/auth/authorization";
import { changeOrganizationStatusSchema, changeOrganizationTypeSchema } from "@/server/commands/security-inputs";
import { changeOrganizationStatus, changeOrganizationType, SecurityCommandError } from "@/server/commands/security";
import { permissionProcedure, router } from "../trpc";

// Organization lifecycle administration requires platform authority, not membership.
const resolveScope = () => ({ kind: "platform" as const });

async function organizationResult<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation(); } catch (error) {
    if (error instanceof AuthorizationError || (error instanceof SecurityCommandError && error.code === "REJECTED")) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Organization request denied" });
    }
    if (error instanceof SecurityCommandError) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Organization request failed" });
    }
    throw error;
  }
}

export const organizationsRouter = router({
  changeStatus: permissionProcedure({
    permission: "org.status.change", input: changeOrganizationStatusSchema, resolveScope,
  }).mutation(({ ctx, input }) => organizationResult(() => changeOrganizationStatus(input, { supabase: ctx.supabase }))),
  changeType: permissionProcedure({
    permission: "org.type.change", input: changeOrganizationTypeSchema, resolveScope,
  }).mutation(({ ctx, input }) => organizationResult(() => changeOrganizationType(input, { supabase: ctx.supabase }))),
});
