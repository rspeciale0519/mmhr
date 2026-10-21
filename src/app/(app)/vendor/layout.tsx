import { requirePortalPageAccess } from "@/server/auth/portal/portal-guards";

/** Every vendor route inherits the caller and selected-organization checks. */
export default async function VendorLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await requirePortalPageAccess("vendor");
  return children;
}
