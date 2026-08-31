import { requirePortalPageAccess } from "@/server/auth/portal/portal-guards";

/** Every customer route inherits the caller and selected-organization checks. */
export default async function CustomerLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await requirePortalPageAccess("customer");
  return children;
}
