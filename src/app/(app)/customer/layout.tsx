import { requireSelectedOrganizationPermission } from "@/server/auth/page-guards";

/** Every customer route inherits the caller and selected-organization checks. */
export default async function CustomerLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await requireSelectedOrganizationPermission("portal.customer.access");
  return children;
}
