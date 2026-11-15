import "server-only";
import { cookies } from "next/headers";

import {
  authorizePermission,
  type AuthorizationContext,
  type RequestSupabaseClient,
} from "@/server/auth/authorization";
import { organizationContextCookie } from "@/server/auth/page-guards";
import { portalPermissions } from "@/server/auth/portal/portal-guards";
import { membershipRowsSchema } from "@/server/auth/workspace-memberships";

type EntryOptions = { supabase?: RequestSupabaseClient };

/**
 * Stores the selected workspace only after a current `workspace.access` decision.
 * The cookie never grants access: every later request checks it again.
 * Callers must pass a validated, non-nil organization UUID.
 */
export async function selectWorkspace(
  organizationId: string,
  options: EntryOptions = {},
): Promise<AuthorizationContext | null> {
  const access = await authorizePermission("workspace.access", {
    kind: "organization", organizationId,
  }, options);
  if (!access) return null;

  (await cookies()).set(organizationContextCookie, organizationId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 8 * 60 * 60,
  });
  return access;
}

/** Returns the portal for a selected workspace, or `/home` when the caller has no portal there. */
export async function workspaceLandingPath(
  organizationId: string,
  options: EntryOptions = {},
): Promise<string> {
  const scope = { kind: "organization", organizationId } as const;
  if (await authorizePermission(portalPermissions.customer, scope, options)) return "/customer";
  if (await authorizePermission(portalPermissions.vendor, scope, options)) return "/vendor";
  return "/home";
}

/**
 * Chooses the first page after sign-in or email confirmation.
 * Staff with administration access go to `/admin`. A caller with exactly one
 * workspace has it selected and goes to that portal. Other callers choose a workspace.
 */
export async function signedInDestination(supabase: RequestSupabaseClient): Promise<string> {
  const options = { supabase };
  try {
    if (await authorizePermission("admin.access", { kind: "platform" }, options)) return "/admin";

    const response = await supabase.rpc("mmhr_get_my_memberships");
    const memberships = membershipRowsSchema.safeParse(response.error ? null : response.data);
    if (!memberships.success) return "/home";
    if (memberships.data.length !== 1) return "/workspaces";

    const organizationId = memberships.data[0].organization_id.toLowerCase();
    if (!await selectWorkspace(organizationId, options)) return "/workspaces";
    return await workspaceLandingPath(organizationId, options);
  } catch {
    // The caller is already signed in. `/home` repeats every access check and
    // shows the workspace error and retry path, so no failure is hidden.
    return "/home";
  }
}
