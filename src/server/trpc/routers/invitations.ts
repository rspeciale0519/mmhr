import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { AuthorizationError } from "@/server/auth/authorization";
import {
  createInvitationInputSchema, resendInvitationInputSchema, revokeInvitationInputSchema,
} from "@/server/commands/invitation-administration";
import {
  createInvitation, resendInvitation, revokeInvitation, InvitationDatabaseCommandError,
} from "@/server/commands/invitation-database";
import { getMyInvitations, InvitationReadError } from "@/server/commands/invitation-read";
import { identityProcedure, permissionProcedure, router } from "../trpc";

function organizationScope(input: { organizationId: string }) {
  return { kind: "organization" as const, organizationId: input.organizationId };
}

async function invitationResult<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof AuthorizationError
      || (error instanceof InvitationDatabaseCommandError && error.code === "REJECTED")) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Invitation unavailable" });
    }
    if (error instanceof InvitationDatabaseCommandError || error instanceof InvitationReadError) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Invitation request failed" });
    }
    throw error;
  }
}

export const invitationsRouter = router({
  mine: identityProcedure.input(z.void()).query(({ ctx }) => invitationResult(
    () => getMyInvitations({ supabase: ctx.supabase }),
  )),
  create: permissionProcedure({
    permission: "org.members.invite",
    input: createInvitationInputSchema.omit({ actorIdentityId: true }),
    resolveScope: organizationScope,
  }).mutation(({ ctx, input }) => invitationResult(() => createInvitation(
    { ...input, actorIdentityId: ctx.authorization.identityId }, { supabase: ctx.supabase },
  ))),
  resend: permissionProcedure({
    permission: "org.members.invite",
    input: resendInvitationInputSchema.omit({ actorIdentityId: true }),
    resolveScope: organizationScope,
  }).mutation(({ ctx, input }) => invitationResult(() => resendInvitation(
    { ...input, actorIdentityId: ctx.authorization.identityId }, { supabase: ctx.supabase },
  ))),
  revoke: permissionProcedure({
    permission: "org.members.revoke",
    input: revokeInvitationInputSchema.omit({ actorIdentityId: true }),
    resolveScope: organizationScope,
  }).mutation(({ ctx, input }) => invitationResult(() => revokeInvitation(
    { ...input, actorIdentityId: ctx.authorization.identityId }, { supabase: ctx.supabase },
  ))),
});
