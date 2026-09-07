import Link from "next/link";
import { forbidden } from "next/navigation";

import { requireSelectedOrganizationPermission } from "@/server/auth/page-guards";
import { InvitationCreateForm } from "./invitation-create-form";

export default async function NewInvitationPage() {
  const { authorization } = await requireSelectedOrganizationPermission("org.members.invite");
  if (authorization.scope.kind !== "organization") forbidden();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-5 py-8 sm:p-8">
      <Link href="/home" className="inline-flex min-h-11 w-fit items-center text-sm underline underline-offset-4">
        Back to workspace
      </Link>
      <header className="space-y-3">
        <p className="text-sm font-medium text-muted-foreground">Organization access</p>
        <h1 className="text-balance text-3xl font-semibold tracking-tight">Invite a member</h1>
        <p className="text-pretty text-sm leading-6 text-muted-foreground">
          The recipient must verify their identity before they can accept. Invitations expire after 72 hours.
        </p>
        <p className="break-all text-xs text-muted-foreground">
          Organization reference: <span className="font-mono">{authorization.scope.organizationId}</span>
        </p>
      </header>
      <InvitationCreateForm organizationId={authorization.scope.organizationId} />
    </main>
  );
}
