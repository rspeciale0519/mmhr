import "server-only";
import { z } from "zod";
import { requirePermission, type AuthorizationOptions } from "@/server/auth/authorization";
import { securityUuidSchema } from "@/server/audit/security-values";

export class MemberReadError extends Error {
  constructor(readonly code: "REJECTED" | "UNAVAILABLE" | "INVALID_RESPONSE") {
    super("Members could not be loaded");
    this.name = "MemberReadError";
  }
}
const inputSchema = z.strictObject({
  organizationId: securityUuidSchema, afterId: securityUuidSchema.optional(),
  pageSize: z.number().int().min(1).max(100).default(50),
});
const rowSchema = z.strictObject({
  membership_id: securityUuidSchema, organization_id: securityUuidSchema, identity_id: securityUuidSchema,
  role_key: z.enum(["organization_admin", "contributor", "viewer"]).nullable(), status: z.enum(["active", "suspended"]),
});
export type OrganizationMemberRow = z.output<typeof rowSchema>;

export async function getOrganizationMembers(input: z.input<typeof inputSchema>, options: AuthorizationOptions = {}):
Promise<{ members: OrganizationMemberRow[]; nextCursor: string | null }> {
  const parsedInput = inputSchema.safeParse(input);
  if (!parsedInput.success) throw new MemberReadError("REJECTED");
  const value = parsedInput.data;
  const context = await requirePermission("org.members.view", { kind: "organization", organizationId: value.organizationId }, options);
  let response;
  try {
    response = await context.supabase.rpc("mmhr_get_organization_members_page", {
      requested_organization_id: value.organizationId, after_id: value.afterId ?? null, page_size: value.pageSize,
    });
  } catch { throw new MemberReadError("UNAVAILABLE"); }
  if (!response || response.error) throw new MemberReadError("REJECTED");
  const rows = z.array(rowSchema).max(value.pageSize + 1).safeParse(response.data);
  if (!rows.success) throw new MemberReadError("INVALID_RESPONSE");
  let previous = value.afterId;
  for (const row of rows.data) {
    if (row.organization_id !== value.organizationId || (previous !== undefined && row.membership_id <= previous)) {
      throw new MemberReadError("INVALID_RESPONSE");
    }
    previous = row.membership_id;
  }
  const members = rows.data.slice(0, value.pageSize);
  return { members, nextCursor: rows.data.length > value.pageSize ? members[members.length - 1]!.membership_id : null };
}
