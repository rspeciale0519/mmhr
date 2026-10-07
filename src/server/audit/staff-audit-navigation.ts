import "server-only";
import { authorizePermission, type AuthorizationContext } from "@/server/auth/authorization";
import { readSelectedOrganizationId } from "@/server/auth/page-guards";

export async function staffAuditNavigation(staff: AuthorizationContext): Promise<string | null> {
  if (staff.scope.kind !== "platform" || staff.assurance !== "aal2") return null;
  const options = { supabase: staff.supabase, correlationId: staff.correlationId };
  const platform = await authorizePermission("audit.view", { kind: "platform" }, options);
  if (platform && platform.identityId === staff.identityId && platform.assurance === "aal2") return "/admin/audit?scope=platform";
  const organizationId = await readSelectedOrganizationId();
  if (!organizationId) return null;
  const organization = await authorizePermission("audit.view", { kind: "organization", organizationId }, options);
  return organization && organization.identityId === staff.identityId && organization.assurance === "aal2"
    ? "/admin/audit?scope=workspace" : null;
}
