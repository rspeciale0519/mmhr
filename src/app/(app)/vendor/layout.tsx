import { requireSelectedOrganizationPermission } from "@/server/auth/page-guards";

/** Every vendor route inherits the caller and selected-organization checks. */
export default async function VendorLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await requireSelectedOrganizationPermission("portal.vendor.access");
  return children;
}
