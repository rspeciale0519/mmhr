import { randomUUID } from "node:crypto";
import Link from "next/link";
import { forbidden } from "next/navigation";

import { Button } from "@/components/ui/button";
import { AuthorizationError } from "@/server/auth/authorization";
import { requirePagePermission } from "@/server/auth/page-guards";
import { getStaffVendorDirectory, type StaffVendor } from "@/server/commands/staff-vendors";
import { getVendorRfpContacts } from "@/server/commands/rfp-vendor-forms";
import { openVendorWorkspaceAction } from "./actions";
import { CreateVendorForm, EnablePortalForm, InviteAdminForm, ListVendorForm, NextSteps, RfpContactForm } from "./vendor-forms";

/** The saved RFP contact of one vendor, if any. */
type RfpContact = { contactName: string; contactEmail: string } | undefined;

const statusText: Record<StaffVendor["status"], string> = {
  pending: "Not listed",
  active: "Listed",
  suspended: "Suspended",
};

function memberText(count: number) {
  return count === 0 ? "Not joined" : count === 1 ? "1 vendor user" : `${count} vendor users`;
}

/** The setup steps for one vendor. Each line says if it is done. */
function SetupSteps({ vendor }: { vendor: StaffVendor }) {
  const live = vendor.pendingInvitations.filter((invitation) => !invitation.expired).length;
  const joined = vendor.activeMembers > 0;
  const steps = [
    ["Vendor added", true],
    ["Vendor listed for customer comparisons", vendor.status !== "pending"],
    ["Vendor portal on", vendor.portalOn],
    [joined ? "First vendor user joined" : live > 0 ? "Vendor user invited, not joined yet" : "No vendor user invited", joined],
  ] as const;
  return <ol aria-label={`Setup steps for ${vendor.name}`} className="space-y-1 text-sm">
    {steps.map(([label, done]) => <li key={label} className="flex gap-2">
      <span className={done ? "font-medium" : "text-muted-foreground"}>{done ? "Done:" : "To do:"}</span>
      <span>{label}</span>
    </li>)}
  </ol>;
}

function OpenWorkspaceForm({ vendor }: { vendor: StaffVendor }) {
  const label = vendor.callerHasAccess ? "Continue in vendor workspace" : "Open vendor workspace";
  return <form action={openVendorWorkspaceAction} className="space-y-2">
    <input type="hidden" name="organizationId" value={vendor.organizationId}/>
    <input type="hidden" name="idempotencyKey" value={randomUUID()}/>
    <p className="text-sm text-muted-foreground">
      {vendor.callerHasAccess ? "You have access to this vendor workspace."
        : "Opening gives you staff access to add products and evidence. It is recorded in the audit log."}
    </p>
    <Button type="submit" variant={vendor.callerHasAccess ? "outline" : "default"} className="min-h-11 w-full px-4 sm:w-auto"
      aria-label={`${label} for ${vendor.name}`}>
      {label}
    </Button>
  </form>;
}

function VendorEntry({ vendor, callerCanList, contact }: { vendor: StaffVendor; callerCanList: boolean; contact: RfpContact }) {
  const canChange = vendor.status !== "suspended";
  return <li className="space-y-5 py-6">
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="break-words text-lg font-semibold">{vendor.name}</h3>
        {vendor.activeMembers === 0 && <span className="rounded-md border px-2 py-0.5 text-xs font-medium">Not joined</span>}
      </div>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
        <dt className="text-muted-foreground">Status</dt><dd>{statusText[vendor.status]}</dd>
        <dt className="text-muted-foreground">Vendor portal</dt><dd>{vendor.portalOn ? "On" : "Off"}</dd>
        <dt className="text-muted-foreground">Vendor users</dt><dd>{memberText(vendor.activeMembers)}</dd>
        <dt className="text-muted-foreground">RFP contact</dt>
        <dd className="break-all">{contact ? `${contact.contactName}, ${contact.contactEmail}` : "Not set. RFP emails cannot be sent yet."}</dd>
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
      <RfpContactForm organizationId={vendor.organizationId} organizationName={vendor.name} idempotencyKey={randomUUID()}
        contactName={contact?.contactName} contactEmail={contact?.contactEmail}/>
      {vendor.status === "pending" && (callerCanList
        ? <ListVendorForm organizationId={vendor.organizationId} organizationName={vendor.name} idempotencyKey={randomUUID()}/>
        : <p className="text-sm">Only a Super Admin can list this vendor.</p>)}
      {vendor.status === "active" && <OpenWorkspaceForm vendor={vendor}/>}
      {!vendor.portalOn && <EnablePortalForm organizationId={vendor.organizationId} organizationName={vendor.name}
        idempotencyKey={randomUUID()}/>}
      <InviteAdminForm organizationId={vendor.organizationId} organizationName={vendor.name}
        idempotencyKey={randomUUID()}/>
    </div> : <p className="text-sm">This vendor is suspended. Setup changes are unavailable here.</p>}
  </li>;
}

export default async function StaffVendorsPage({ searchParams }: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
} = {}) {
  const { authorization } = await requirePagePermission("admin.access", { kind: "platform" });
  const notice = (await searchParams)?.notice;
  let directory;
  try {
    directory = await getStaffVendorDirectory({ supabase: authorization.supabase });
  } catch (error) {
    if (error instanceof AuthorizationError) forbidden();
    throw error;
  }
  // RFP contacts are an extra. If they cannot be read, the page still works
  // and each vendor shows "Not set".
  const contacts = await getVendorRfpContacts({ supabase: authorization.supabase }).catch(() => new Map<string, NonNullable<RfpContact>>());

  return <main className="mx-auto w-full max-w-4xl space-y-10 px-4 py-8 sm:px-6 sm:py-10">
    <header className="space-y-3">
      <Link href="/admin" className="inline-flex min-h-11 items-center text-sm underline underline-offset-4">Back to administration</Link>
      <h1 className="text-balance text-3xl font-semibold tracking-tight">Vendors</h1>
      <p className="max-w-prose text-pretty text-sm leading-6 text-muted-foreground">
        Add a vendor, list it for customer comparisons, and enter its products in its workspace. Invite its first user
        when a customer picks it. Each action is recorded in the audit log.
      </p>
    </header>
    {notice === "denied" && <p role="alert" className="max-w-2xl rounded-lg border border-destructive/40 px-4 py-3 text-sm">
      The vendor workspace could not be opened. The vendor must be listed and active, you need staff access with two-step
      sign-in, and access that was removed is not given again here.
    </p>}

    <section aria-labelledby="add-vendor" className="max-w-xl space-y-4">
      <h2 id="add-vendor" className="text-xl font-semibold">Add vendor</h2>
      <p className="text-sm leading-6">
        A new vendor is not listed until a Super Admin lists it. Catalog and evidence approval for comparisons stay separate reviews.
      </p>
      <CreateVendorForm idempotencyKey={randomUUID()}/>
    </section>

    <section aria-labelledby="vendor-list" className="space-y-2">
      <h2 id="vendor-list" className="text-xl font-semibold">Vendor organizations</h2>
      {directory.items.length === 0 ? (
        <p role="status" className="text-sm leading-6">No vendors yet. Add the first vendor above.</p>
      ) : (
        <ul aria-label="Vendor organizations" className="max-w-2xl divide-y border-y">
          {directory.items.map((vendor) => <VendorEntry key={vendor.organizationId} vendor={vendor}
            callerCanList={directory.callerCanList} contact={contacts.get(vendor.organizationId)}/>)}
        </ul>
      )}
      {directory.truncated && <p className="text-sm">Only the first 200 vendors are shown.</p>}
    </section>
  </main>;
}
