import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { AuthorizationError } from "@/server/auth/authorization";
import { changeMembershipRoleSchema, changeMembershipStatusSchema } from "@/server/commands/security-inputs";
import { changeMembershipRole, changeMembershipStatus, SecurityCommandError } from "@/server/commands/security";
import { permissionProcedure, router } from "../trpc";

const resolveScope = (input: { organizationId: string }) => ({
  kind: "organization" as const, organizationId: input.organizationId,
});

async function membershipResult<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation(); } catch (error) {
    if (error instanceof AuthorizationError || (error instanceof SecurityCommandError && error.code === "REJECTED")) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Membership unavailable" });
    }
    if (error instanceof SecurityCommandError) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Membership request failed" });
    }
    throw error;
  }
}

export const membershipsRouter = router({
  changeRole: permissionProcedure({
    permission: "org.members.change_role", input: changeMembershipRoleSchema, resolveScope,
  }).mutation(({ ctx, input }) => membershipResult(() => changeMembershipRole(input, { supabase: ctx.supabase }))),
  changeStatus: permissionProcedure({
    permission: "org.members.status.change",
    input: changeMembershipStatusSchema.extend({ status: z.enum(["active", "suspended"]) }), resolveScope,
  }).mutation(({ ctx, input }) => membershipResult(() => changeMembershipStatus(input, { supabase: ctx.supabase }))),
  // Revocation cannot use the lower status-change permission or a caller-selected status.
  revoke: permissionProcedure({
    permission: "org.members.revoke", input: changeMembershipStatusSchema.omit({ status: true }), resolveScope,
  }).mutation(({ ctx, input }) => membershipResult(() => changeMembershipStatus(
    { ...input, status: "revoked" }, { supabase: ctx.supabase },
  ))),
});
