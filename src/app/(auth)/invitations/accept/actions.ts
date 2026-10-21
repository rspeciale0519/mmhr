"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import type { RequestSupabaseClient } from "@/server/auth/authorization";
import { requireTrustedServerActionOrigin } from "@/server/auth/server-action-request";
import { requirePageIdentity } from "@/server/auth/page-guards";
import { acceptCallerInvitation, InvitationDatabaseCommandError } from "@/server/commands/invitation-database";
import { securityUuidSchema } from "@/server/audit/security-values";

export type InvitationAcceptState =
  | { error: string; success?: never }
  | { error?: never; success: string }
  | null;

const providerUserSchema = z.object({
  id: securityUuidSchema,
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  email_confirmed_at: z.iso.datetime({ offset: true }),
  is_anonymous: z.literal(false),
});

function safeFailure(): InvitationAcceptState {
  return { error: "We could not accept that invitation. Refresh the page and try again." };
}

/** Accepts one invitation through the caller-bound, audited database command. */
export async function acceptInvitationAction(
  _previous: InvitationAcceptState,
  formData: FormData,
): Promise<InvitationAcceptState> {
  const requestHeaders = await headers();
  requireTrustedServerActionOrigin(requestHeaders.get("origin"));
  const verifiedSubject = await requirePageIdentity();

  if (formData.getAll("invitationId").length !== 1) return safeFailure();
  const invitationId = securityUuidSchema.safeParse(formData.get("invitationId"));
  if (!invitationId.success) return safeFailure();

  let supabase: RequestSupabaseClient;
  let providerResponse: { data: { user: unknown }; error: unknown };
  try {
    supabase = await createClient();
    providerResponse = await supabase.auth.getUser();
  } catch {
    return safeFailure();
  }
  const parsedUser = providerUserSchema.safeParse(providerResponse.error ? null : providerResponse.data.user);
  if (!parsedUser.success || parsedUser.data.id !== verifiedSubject.id.toLowerCase()) return safeFailure();

  try {
    const result = await acceptCallerInvitation({
      invitationId: invitationId.data,
      verifiedEmail: parsedUser.data.email,
      // An invitation has one acceptance. Receipts also bind the caller and
      // command, so the immutable invitation ID survives reloads and retries.
      idempotencyKey: invitationId.data,
      correlationId: randomUUID(),
    }, { supabase });
    if (!["accepted", "replayed"].includes(result.outcome)) return safeFailure();
    revalidatePath("/home");
    revalidatePath("/invitations/accept");
    return { success: "Invitation accepted. You can now open your workspace." };
  } catch (error) {
    if (error instanceof InvitationDatabaseCommandError) return safeFailure();
    return safeFailure();
  }
}
