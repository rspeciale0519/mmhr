import "server-only";

import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import type { AuthorizationOptions, RequestSupabaseClient } from "@/server/auth/authorization";
import { securityTimestampSchema, securityUuidSchema } from "@/server/audit/security-values";

const invitationReadRowSchema = z.strictObject({
  invitation_id: securityUuidSchema,
  organization_id: securityUuidSchema,
  organization_name: z.string().trim().min(1).max(200),
  role_key: z.enum(["organization_admin", "contributor", "viewer"]),
  expires_at: securityTimestampSchema,
});

export type InvitationReadRow = z.output<typeof invitationReadRowSchema>;

export class InvitationReadError extends Error {
  constructor(readonly code: "UNAVAILABLE" | "REJECTED" | "INVALID_RESPONSE") {
    super("Invitations could not be loaded");
    this.name = "InvitationReadError";
  }
}

export type InvitationReadOptions = AuthorizationOptions;

/** Reads only the current verified caller's pending invitations through a fixed RPC. */
export async function getMyInvitations(
  options: InvitationReadOptions = {},
): Promise<readonly InvitationReadRow[]> {
  let supabase: RequestSupabaseClient;
  try {
    supabase = options.supabase ?? await createClient();
  } catch {
    throw new InvitationReadError("UNAVAILABLE");
  }

  let response;
  try {
    response = await supabase.rpc("mmhr_get_my_invitations");
  } catch {
    throw new InvitationReadError("UNAVAILABLE");
  }
  if (!response || response.error) throw new InvitationReadError("REJECTED");

  const parsed = z.array(invitationReadRowSchema).max(100).safeParse(response.data);
  if (!parsed.success) throw new InvitationReadError("INVALID_RESPONSE");
  return parsed.data;
}
