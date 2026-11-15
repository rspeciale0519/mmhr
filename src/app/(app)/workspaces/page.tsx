import Link from "next/link";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { requirePageIdentity } from "@/server/auth/page-guards";
import { membershipRowsSchema, type MembershipRows } from "@/server/auth/workspace-memberships";
import { selectOrganizationAction } from "./actions";

const organizationLabels = { internal: "MMHR", customer: "Customer", vendor: "Vendor" };

export default async function WorkspacesPage() {
  await requirePageIdentity();
  let memberships: MembershipRows | null = null;
  try {
    const supabase = await createClient();
    // This fixed RPC applies current workspace access and field permissions in SQL.
    const response = await supabase.rpc("mmhr_get_my_memberships");
    const parsed = membershipRowsSchema.safeParse(response.error ? null : response.data);
    if (parsed.success) memberships = parsed.data;
  } catch {
    // Keep provider details private; the visible error gives a retry path.
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-5 py-8 sm:p-8">
      <header className="space-y-3">
        <p className="text-sm font-medium text-muted-foreground">Organization access</p>
        <h1 className="text-balance text-3xl font-semibold tracking-tight">Choose a workspace</h1>
        <p className="text-pretty text-sm leading-6 text-muted-foreground">
          Each workspace belongs to one organization. Your access is checked when you open it.
        </p>
      </header>
      {memberships === null ? (
        <section className="space-y-3">
          <p role="alert" className="text-sm">We could not load your workspaces. Refresh the page and try again.</p>
          <Link href="/workspaces" className="inline-flex min-h-11 items-center text-sm underline underline-offset-4">Reload workspaces</Link>
        </section>
      ) : memberships.length === 0 ? (
        <p role="status" className="text-pretty text-sm leading-6">
          No workspaces are available. Review your invitations or contact your organization administrator.
        </p>
      ) : (
        <ul aria-label="Available workspaces" className="divide-y border-y">
          {memberships.map((membership) => (
            <li key={membership.organization_id} className="py-5">
              <form action={selectOrganizationAction} className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <input type="hidden" name="organizationId" value={membership.organization_id} />
                <div className="min-w-0 space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">{organizationLabels[membership.organization_type]}</p>
                  <h2 className="break-words text-lg font-semibold">{membership.organization_name ?? "Organization name restricted"}</h2>                </div>
                <Button type="submit" className="min-h-11 shrink-0 transition-colors"
                  aria-label={`Open ${membership.organization_name ?? membership.organization_id}`}>
                  Open workspace
                </Button>
              </form>
            </li>
          ))}
        </ul>
      )}
      <Link href="/invitations/accept" className="inline-flex min-h-11 w-fit items-center text-sm underline underline-offset-4">
        Review pending invitations
      </Link>
    </main>
  );
}
