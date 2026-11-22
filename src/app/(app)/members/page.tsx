import Link from "next/link";
import { forbidden } from "next/navigation";
import { requireSelectedOrganizationPermission } from "@/server/auth/page-guards";
import { authorizePermission, AuthorizationError } from "@/server/auth/authorization";
import { securityUuidSchema } from "@/server/audit/security-values";
import { getOrganizationMembers } from "@/server/commands/organization-member-read";
import { MemberControls } from "./member-controls";

const linkClass = "inline-flex min-h-11 items-center text-sm underline underline-offset-4";
const roles = { organization_admin: "Organization administrator", contributor: "Contributor", viewer: "Viewer" };

export default async function MembersPage({ searchParams }: { searchParams: Promise<{ after?: string | string[] }> }) {
  const { authorization } = await requireSelectedOrganizationPermission("org.members.view");
  const scope = authorization.scope;
  if (scope.kind !== "organization") forbidden();
  const query = await searchParams;
  const cursor = query.after === undefined ? undefined : securityUuidSchema.safeParse(query.after);
  if (cursor && !cursor.success) return <main className="co-w space-y-4">
    <h1 className="co-pt">Members</h1><p role="alert">This member page reference is invalid.</p>
    <Link className={linkClass} href="/members">Return to first page</Link>
  </main>;
  const [roleAccess, fieldAccess, statusAccess, revokeAccess] = await Promise.all([
    authorizePermission("org.members.change_role", scope), authorizePermission("member.role.update", scope),
    authorizePermission("org.members.status.change", scope), authorizePermission("org.members.revoke", scope),
  ]);
  let page;
  try {
    page = await getOrganizationMembers({ organizationId: scope.organizationId, afterId: cursor?.data, pageSize: 25 },
      { supabase: authorization.supabase });
  } catch (error) {
    if (error instanceof AuthorizationError) forbidden();
    return <main className="co-w space-y-4">
      <h1 className="co-pt">Members</h1>
      <p role="alert">Members could not load. Retry or return to your workspace.</p>
      <Link className={linkClass} href="/members">Retry member list</Link>
      <Link className={linkClass} href="/home">Back to workspace</Link>
    </main>;
  }
  return <main className="co-w space-y-8">
    <Link className={linkClass} href="/home">Back to workspace</Link>
    <header className="space-y-3">
      <p className="text-sm font-medium text-muted-foreground">Organization access</p>
      <h1 className="text-balance text-3xl font-semibold tracking-tight">Members</h1>
      <p className="text-pretty text-sm leading-6 text-muted-foreground">
        Review active and suspended memberships. Confirm the member reference before changing access.
        This view does not expose account names or email addresses.
      </p>
      <Link className={linkClass} href="/invitations">Manage invitations</Link>
    </header>
    {page.members.length === 0 ? <p role="status" className="border-t pt-6 text-sm">
      {cursor ? "No more members on this page." : "No reviewed members are available in this workspace."}
    </p> : <ul aria-label="Organization members" className="divide-y border-y">
      {page.members.map((member) => {
        const isSelf = member.identity_id === authorization.identityId;
        return <li key={member.membership_id} className="space-y-4 py-6">
          <div className="space-y-2">
            <h2 className="font-medium">Member reference{isSelf ? " · You" : ""}</h2>
            <p className="break-all font-mono text-sm">{member.identity_id}</p>
          </div>
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div><dt className="text-muted-foreground">Role</dt><dd>{member.role_key ? roles[member.role_key] : "Restricted"}</dd></div>
            <div><dt className="text-muted-foreground">Status</dt><dd className="capitalize">{member.status}</dd></div>
          </dl>
          {isSelf ? <p className="text-sm text-muted-foreground">Ask another administrator to change your membership.</p>
            : <MemberControls key={`${member.membership_id}:${member.status}:${member.role_key}`}
              organizationId={scope.organizationId} membershipId={member.membership_id}
              status={member.status} roleKey={member.role_key}
              canChangeRole={Boolean(roleAccess && fieldAccess && member.role_key && member.status === "active")}
              canChangeStatus={Boolean(statusAccess)} canRevoke={Boolean(revokeAccess)} />}
        </li>;
      })}
    </ul>}
    <nav aria-label="Member pages" className="flex flex-wrap gap-6">
      {cursor && <Link className={linkClass} href="/members">Return to first page</Link>}
      {page.nextCursor && <Link className={linkClass} href={`/members?after=${page.nextCursor}`}>Next page</Link>}
    </nav>
  </main>;
}
