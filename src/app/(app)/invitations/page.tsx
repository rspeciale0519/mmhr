import Link from "next/link";
import { forbidden } from "next/navigation";
import { requireSelectedOrganizationPermission } from "@/server/auth/page-guards";
import { authorizePermission, AuthorizationError } from "@/server/auth/authorization";
import { securityUuidSchema } from "@/server/audit/security-values";
import { getOrganizationInvitations } from "@/server/commands/organization-invitation-read";
import { InvitationControls } from "./invitation-controls";

const linkClass = "inline-flex min-h-11 items-center text-sm underline underline-offset-4";
const roles = { organization_admin: "Organization administrator", contributor: "Contributor", viewer: "Viewer" };

export default async function InvitationsPage({ searchParams }: {
  searchParams: Promise<{ after?: string | string[] }>;
}) {
  const { authorization } = await requireSelectedOrganizationPermission("org.members.view");
  const scope = authorization.scope;
  if (scope.kind !== "organization") forbidden();
  const query = await searchParams;
  const cursor = query.after === undefined ? undefined : securityUuidSchema.safeParse(query.after);
  if (cursor && !cursor.success) return <main className="co-w space-y-4">
    <h1 className="co-pt">Invitations</h1>
    <p role="alert">This invitation page reference is invalid.</p>
    <Link className={linkClass} href="/invitations">Return to first page</Link>
  </main>;

  const [inviteAccess, revokeAccess] = await Promise.all([
    authorizePermission("org.members.invite", scope), authorizePermission("org.members.revoke", scope),
  ]);
  let page;
  try {
    page = await getOrganizationInvitations({ organizationId: scope.organizationId,
      afterId: cursor?.data, pageSize: 25 }, { supabase: authorization.supabase });
  } catch (error) {
    if (error instanceof AuthorizationError) forbidden();
    return <main className="co-w space-y-4">
      <h1 className="co-pt">Invitations</h1>
      <p role="alert">Invitations could not load. Retry or return to your workspace.</p>
      <Link className={linkClass} href="/invitations">Retry invitation list</Link>
      <Link className={linkClass} href="/home">Back to workspace</Link>
    </main>;
  }
  return <main className="co-w space-y-8">
    <Link className={linkClass} href="/home">Back to workspace</Link>
    <header className="space-y-3">
      <p className="text-sm font-medium text-muted-foreground">Organization access</p>
      <h1 className="text-balance text-3xl font-semibold tracking-tight">Invitations</h1>
      <p className="text-pretty text-sm leading-6 text-muted-foreground">
        Review access invitations for this workspace. A recorded invitation does not confirm email delivery.
      </p>
      {inviteAccess && <Link className={linkClass} href="/invitations/new">Invite a member</Link>}
    </header>
    {page.invitations.length === 0 ? <p role="status" className="border-t pt-6 text-sm">
      {cursor ? "No more invitations on this page." : "This workspace has no invitations."}
    </p> : <ul aria-label="Organization invitations" className="divide-y border-y">
      {page.invitations.map((invitation) => <li key={invitation.invitation_id} className="space-y-4 py-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="min-w-0 break-all font-medium">{invitation.invited_email}</h2>
          <span className="text-sm capitalize">{invitation.status}</span>
        </div>
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <div><dt className="text-muted-foreground">Role</dt><dd>{invitation.role_key ? roles[invitation.role_key] : "Restricted"}</dd></div>
          <div><dt className="text-muted-foreground">Expiry (UTC)</dt>
            <dd className="tabular-nums"><time dateTime={invitation.expires_at}>
              {new Date(invitation.expires_at).toISOString().slice(0, 16).replace("T", " ")}
            </time></dd></div>
        </dl>
        {invitation.status === "pending" && (inviteAccess || revokeAccess) && <InvitationControls
          organizationId={scope.organizationId} invitationId={invitation.invitation_id}
          canResend={Boolean(inviteAccess)} canRevoke={Boolean(revokeAccess)} />}
      </li>)}
    </ul>}
    <nav aria-label="Invitation pages" className="flex flex-wrap gap-6">
      {cursor && <Link className={linkClass} href="/invitations">Return to first page</Link>}
      {page.nextCursor && <Link className={linkClass} href={`/invitations?after=${page.nextCursor}`}>Next page</Link>}
    </nav>
  </main>;
}
