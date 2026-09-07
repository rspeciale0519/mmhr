import "server-only";
import { z } from "zod";
import { requirePermission, type AuthorizationOptions } from "@/server/auth/authorization";
import { securityTimestampSchema, securityUuidSchema } from "@/server/audit/security-values";
import { InvitationReadError } from "./invitation-read";

export const organizationInvitationPageSchema = z.strictObject({
  organizationId: securityUuidSchema,
  afterId: securityUuidSchema.optional(),
  pageSize: z.number().int().min(1).max(100).default(50),
});
export type OrganizationInvitationPageInput = z.input<typeof organizationInvitationPageSchema>;

const rowSchema = z.strictObject({
  invitation_id: securityUuidSchema,
  organization_id: securityUuidSchema,
  invited_email: z.email().max(254),
  role_key: z.enum(["organization_admin", "contributor", "viewer"]).nullable(),
  status: z.enum(["pending", "accepted", "expired", "revoked"]),
  created_at: securityTimestampSchema,
  expires_at: securityTimestampSchema,
});
export type OrganizationInvitationRow = z.output<typeof rowSchema>;

/** Fixed, bounded read; the opaque cursor identifies a record, never an actor. */
export async function getOrganizationInvitations(
  input: OrganizationInvitationPageInput,
  options: AuthorizationOptions = {},
): Promise<{ invitations: OrganizationInvitationRow[]; nextCursor: string | null }> {
  const parsedInput = organizationInvitationPageSchema.safeParse(input);
  if (!parsedInput.success) throw new InvitationReadError("REJECTED");
  const value = parsedInput.data;
  const context = await requirePermission("org.members.view", {
    kind: "organization", organizationId: value.organizationId,
  }, options);
  let response;
  try {
    response = await context.supabase.rpc("mmhr_get_organization_invitations", {
      requested_organization_id: value.organizationId, after_id: value.afterId ?? null, page_size: value.pageSize,
    });
  } catch { throw new InvitationReadError("UNAVAILABLE"); }
  if (!response || response.error) throw new InvitationReadError("REJECTED");
  const rows = z.array(rowSchema).max(value.pageSize + 1).safeParse(response.data);
  if (!rows.success) throw new InvitationReadError("INVALID_RESPONSE");
  let previous = value.afterId;
  for (const row of rows.data) {
    if (row.organization_id !== value.organizationId || (previous !== undefined && row.invitation_id <= previous)) {
      throw new InvitationReadError("INVALID_RESPONSE");
    }
    previous = row.invitation_id;
  }
  const invitations = rows.data.slice(0, value.pageSize);
  return { invitations, nextCursor: rows.data.length > value.pageSize
    ? invitations[invitations.length - 1]!.invitation_id : null };
}
