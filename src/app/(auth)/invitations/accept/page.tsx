import { requirePageIdentity } from "@/server/auth/page-guards";
import { getMyInvitations, InvitationReadError } from "@/server/commands/invitation-read";
import { InvitationAcceptForm } from "./invitation-accept-form";

/** Shows caller-bound pending invitations without exposing tokens or email addresses. */
export default async function InvitationAcceptancePage() {
  await requirePageIdentity();

  let invitations;
  try {
    invitations = await getMyInvitations();
  } catch (error) {
    if (error instanceof InvitationReadError) {
      return (
        <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-8">
          <h1 className="text-2xl font-semibold">Invitations unavailable</h1>
          <p className="text-sm" role="alert">We could not load invitations. Refresh the page and try again.</p>
        </main>
      );
    }
    throw error;
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-8">
      <h1 className="text-2xl font-semibold">Your invitations</h1>
      {invitations.length === 0 ? (
        <p className="text-sm" role="status">No pending invitations are available for this account.</p>
      ) : (
        <ul className="flex flex-col gap-4" aria-label="Pending invitations">
          {invitations.map((invitation) => (
            <li key={invitation.invitation_id} className="rounded border p-4">
              <p className="font-medium">{invitation.organization_name}</p>
              <p className="text-sm">Role: {invitation.role_key.replaceAll("_", " ")}</p>
              <p className="text-sm">Expires {new Date(invitation.expires_at).toLocaleDateString()}</p>
              <InvitationAcceptForm invitationId={invitation.invitation_id} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
