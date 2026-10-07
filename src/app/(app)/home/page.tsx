import { Button } from "@/components/ui/button";
import { requireHomeAccess } from "@/server/auth/page-guards";
import { authorizePermission } from "@/server/auth/authorization";
import { portalPermissions } from "@/server/auth/portal/portal-guards";
import { signOut } from "../../(auth)/actions";
import Link from "next/link";
import { isLaunchAreaEnabled } from "@/lib/launch-surface";

/**
 * The home route is a permission-checked router for authorized users.
 */
export default async function WorkspaceHome() {
  const access = await requireHomeAccess();
  const scope = access.authorization.scope;
  const adminAccess = scope.kind === "platform" ? access.authorization
    : await authorizePermission("admin.access", { kind: "platform" }, { supabase: access.authorization.supabase });
  const [invitationAccess, customerAccess, vendorAccess, memberAccess] = scope.kind === "organization"
    ? await Promise.all([
      authorizePermission("org.members.invite", scope),
      authorizePermission(portalPermissions.customer, scope),
      authorizePermission(portalPermissions.vendor, scope),
      authorizePermission("org.members.view", scope),
    ])
    : [null, null, null, null];

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-8">
      <h1 className="text-2xl font-semibold">Workspace</h1>
      <p className="text-sm">
        Your access is active. Only areas available to your account appear here.
      </p>
      {access.authorization.scope.kind === "organization" ? (
          <nav aria-label="Workspace areas" className="flex flex-wrap gap-4 text-sm underline">
            {isLaunchAreaEnabled("documents") && <Link className="inline-flex min-h-11 items-center" href="/documents">Workspace documents</Link>}
            {customerAccess && <Link className="inline-flex min-h-11 items-center" href="/customer">Customer portal</Link>}
            {vendorAccess && <Link className="inline-flex min-h-11 items-center" href="/vendor">Vendor portal</Link>}
            {invitationAccess && <Link className="inline-flex min-h-11 items-center" href="/invitations/new">Invite a member</Link>}
            {memberAccess && <Link className="inline-flex min-h-11 items-center" href="/invitations">Manage invitations</Link>}
            {memberAccess && <Link className="inline-flex min-h-11 items-center" href="/members">Manage members</Link>}
            {adminAccess && <Link className="inline-flex min-h-11 items-center" href="/admin">Administration</Link>}
          </nav>
      ) : (
        <Link className="text-sm underline" href="/admin">Administration</Link>
      )}
      <Link href="/workspaces" className="inline-flex min-h-11 w-fit items-center text-sm underline underline-offset-4">
        Change workspace
      </Link>
      <form action={signOut}>
        <Button type="submit" variant="outline">
          Sign out
        </Button>
      </form>
    </main>
  );
}
