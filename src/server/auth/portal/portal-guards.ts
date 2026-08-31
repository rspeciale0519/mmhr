import {
  requireSelectedOrganizationPermission,
  type PageAuthorization,
} from "@/server/auth/page-guards";

export const portalPermissions = {
  customer: "portal.customer.access",
  vendor: "portal.vendor.access",
} as const;

export type PortalKind = keyof typeof portalPermissions;

/** Uses one fixed permission for each portal route tree. */
export async function requirePortalPageAccess(
  portal: PortalKind,
): Promise<PageAuthorization> {
  return requireSelectedOrganizationPermission(portalPermissions[portal]);
}
