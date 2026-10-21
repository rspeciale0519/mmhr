import { redirect } from "next/navigation";
import { forbidden } from "next/navigation";
import { cookies } from "next/headers";

import {
  getVerifiedIdentity,
  type VerifiedIdentity,
} from "@/server/auth/verified-identity";
import {
  authorizePermission,
  type AuthorizationContext,
} from "@/server/auth/authorization";
import type { PermissionKey, PermissionScope } from "@/server/auth/permission-registry";
import { securityUuidSchema } from "@/server/audit/security-values";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

export const organizationContextCookie = "mmhr-organization-id";

export type PageAuthorization = {
  identity: VerifiedIdentity;
  authorization: AuthorizationContext;
};

/**
 * Requires a verified identity before a Server Component can return content.
 * Permission and organization checks must run after this identity boundary.
 */
export async function requirePageIdentity(): Promise<VerifiedIdentity> {
  const identity = await getVerifiedIdentity();

  if (!identity) redirect("/sign-in");

  return identity;
}

const mfaIdentityRowsSchema = z.array(z.object({
  id: securityUuidSchema,
  status: z.enum(["pending", "active"]),
  email_verified_at: z.string().nullable(),
})).max(1);

/**
 * Allows only pending setup or an active verified identity to use MFA setup.
 * Recovery-pending, suspended, and archived identities stay on fixed flows.
 */
export async function requireMfaPageIdentity(): Promise<VerifiedIdentity> {
  const identity = await requirePageIdentity();
  const supabase = await createClient();
  const response = await supabase.rpc("mmhr_get_my_account_setup");
  const result = mfaIdentityRowsSchema.safeParse(response.error ? null : response.data);
  const row = result.success && result.data.length === 1 ? result.data[0] : null;
  // The caller-bound RPC returns an application ID, not the Auth JWT subject.
  if (!row || row.status === "active" && row.email_verified_at === null) {
    forbidden();
  }
  return identity;
}

/**
 * Requires a verified identity and one current permission decision.
 * Permission failures use the generic forbidden boundary and reveal no data.
 */
export async function requirePagePermission(
  permission: PermissionKey,
  scope: PermissionScope,
): Promise<PageAuthorization> {
  const identity = await requirePageIdentity();
  const authorization = await authorizePermission(permission, scope);
  return requireAuthorizedPage(identity, authorization);
}

function requireAuthorizedPage(
  identity: VerifiedIdentity,
  authorization: AuthorizationContext | null,
): PageAuthorization {
  // authorizePermission verifies this request's JWT and SQL binds auth.uid()
  // to the application identity. These two identifiers need not be equal.
  if (!authorization) forbidden();
  return { identity, authorization };
}

function isNilUuid(value: string): boolean {
  return value === "00000000-0000-0000-0000-000000000000";
}

/** Reads the user-selected organization from a hardened, server-only boundary. */
export async function readSelectedOrganizationId(): Promise<string | null> {
  const value = (await cookies()).get(organizationContextCookie)?.value;
  const parsed = securityUuidSchema.safeParse(value);
  if (!parsed.success || isNilUuid(parsed.data)) return null;
  return parsed.data;
}

/**
 * Validates the selected organization through the database permission function.
 * A cookie alone never grants organization access.
 */
export async function requireSelectedOrganizationPermission(
  permission: PermissionKey,
): Promise<PageAuthorization> {
  const identity = await requirePageIdentity();
  const organizationId = await readSelectedOrganizationId();
  if (!organizationId) forbidden();
  const authorization = await authorizePermission(permission, {
    kind: "organization",
    organizationId,
  });
  return requireAuthorizedPage(identity, authorization);
}

/**
 * Resolves the home route for either an authorized organization or a platform
 * administrator. The selected organization remains validated on every request.
 */
export async function requireHomeAccess(): Promise<PageAuthorization> {
  const identity = await requirePageIdentity();
  const organizationId = await readSelectedOrganizationId();

  if (organizationId) {
    const organizationAccess = await authorizePermission("workspace.access", {
      kind: "organization",
      organizationId,
    });
    if (organizationAccess) {
      return { identity, authorization: organizationAccess };
    }
  }

  const platformAccess = await authorizePermission("admin.access", { kind: "platform" });
  if (platformAccess) {
    return { identity, authorization: platformAccess };
  }

  redirect("/workspaces");
}
