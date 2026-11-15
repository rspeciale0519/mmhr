import { randomUUID } from "node:crypto";
import Link from "next/link";
import { forbidden } from "next/navigation";

import { AuthorizationError } from "@/server/auth/authorization";
import { requirePagePermission } from "@/server/auth/page-guards";
import { getStaffVendorDirectory, type StaffVendor } from "@/server/commands/staff-vendors";
import { CreateVendorForm, EnablePortalForm, InviteAdminForm, NextSteps } from "./vendor-forms";

const statusText: Record<StaffVendor["status"], string> = {
  pending: "Waiting for its first administrator",
  active: "Active",
  suspended: "Suspended",
};

function memberText(count: number) {
  return count === 0 ? "No active members" : count === 1 ? "1 active member" : `${count} active members`;
}

/** The three setup steps for one vendor. Each line says if it is done. */
function SetupSteps({ vendor }: { vendor: StaffVendor }) {
  const live = vendor.pendingInvitations.filter((invitation) => !invitation.expired).length;
  const steps = [
    ["Vendor added", true],
    ["Vendor portal on", vendor.portalOn],
    [vendor.status === "pending" ? (live > 0 ? "First administrator invited, not accepted yet" : "First administrator not invited")
      : "Administrator accepted", vendor.status !== "pending"],
  ] as const;
  return <ol aria-label={`Setup steps for ${vendor.name}`} className="space-y-1 text-sm">
    {steps.map(([label, done]) => <li key={label} className="flex gap-2">
      <span className={done ? "font-medium" : "text-muted-foreground"}>{done ? "Done:" : "To do:"}</span>
      <span>{label}</span>
    </li>)}
  </ol>;
}

function VendorEntry({ vendor }: { vendor: StaffVendor }) {
  const canChange = vendor.status !== "suspended";
  return <li className="space-y-5 py-6">
    <div className="space-y-2">
      <h3 className="break-words text-lg font-semibold">{vendor.name}</h3>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
        <dt className="text-muted-foreground">Status</dt><dd>{statusText[vendor.status]}</dd>
        <dt className="text-muted-foreground">Vendor portal</dt><dd>{vendor.portalOn ? "On" : "Off"}</dd>
        <dt className="text-muted-foreground">Members</dt><dd>{memberText(vendor.activeMembers)}</dd>
      </dl>
    </div>
    <SetupSteps vendor={vendor}/>
    <section aria-label={`Pending invitations for ${vendor.name}`} className="space-y-2">
      <h4 className="text-sm font-medium">Pending invitations</h4>
      {vendor.pendingInvitations.length === 0 ? <p className="text-sm text-muted-foreground">None.</p> : (
        <ul className="space-y-3">
          {vendor.pendingInvitations.map((invitation) => <li key={invitation.invitationId}
            className="rounded-md border px-3 py-2 text-sm">
            {invitation.expired ? <p>
              <span className="break-all font-medium">{invitation.email}</span>: expired. Invite the same email again to replace it.
            </p> : <NextSteps email={invitation.email} expiresAt={invitation.expiresAt}/>}
          </li>)}
        </ul>
      )}
    </section>
    {canChange ? <div className="space-y-5">
      {!vendor.portalOn && <EnablePortalForm organizationId={vendor.organizationId} organizationName={vendor.name}
        idempotencyKey={randomUUID()}/>}
      <InviteAdminForm organizationId={vendor.organizationId} organizationName={vendor.name}
        idempotencyKey={randomUUID()}/>
    </div> : <p className="text-sm">This vendor is suspended. Setup changes are unavailable here.</p>}
  </li>;
}

export default async function StaffVendorsPage() {
  const { authorization } = await requirePagePermission("admin.access", { kind: "platform" });
  let directory;
  try {
    directory = await getStaffVendorDirectory({ supabase: authorization.supabase });
  } catch (error) {
    if (error instanceof AuthorizationError) forbidden();
    throw error;
  }

  return <main className="mx-auto w-full max-w-4xl space-y-10 px-4 py-8 sm:px-6 sm:py-10">
    <header className="space-y-3">
      <Link href="/admin" className="inline-flex min-h-11 items-center text-sm underline underline-offset-4">Back to administration</Link>
      <h1 className="text-balance text-3xl font-semibold tracking-tight">Vendors</h1>
      <p className="max-w-prose text-pretty text-sm leading-6 text-muted-foreground">
        Add a vendor, turn on its portal, and invite its first user. Each action is recorded in the audit log.
        You do not become a member of the vendor.
      </p>
    </header>

    <section aria-labelledby="add-vendor" className="max-w-xl space-y-4">
      <h2 id="add-vendor" className="text-xl font-semibold">Add vendor</h2>
      <p className="text-sm leading-6">
        A new vendor waits until its first administrator accepts. Catalog approval for comparisons stays a separate review.
      </p>
      <CreateVendorForm idempotencyKey={randomUUID()}/>
    </section>

    <section aria-labelledby="vendor-list" className="space-y-2">
      <h2 id="vendor-list" className="text-xl font-semibold">Vendor organizations</h2>
      {directory.items.length === 0 ? (
        <p role="status" className="text-sm leading-6">No vendors yet. Add the first vendor above.</p>
      ) : (
        <ul aria-label="Vendor organizations" className="max-w-2xl divide-y border-y">
          {directory.items.map((vendor) => <VendorEntry key={vendor.organizationId} vendor={vendor}/>)}
        </ul>
      )}
      {directory.truncated && <p className="text-sm">Only the first 200 vendors are shown.</p>}
    </section>
  </main>;
}
