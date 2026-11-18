"use client";

import { useActionState, useId } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createVendorAction, enableVendorPortalAction, inviteVendorAdminAction, listVendorAction, type VendorActionState,
} from "./actions";

const expiry = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });
const fieldClass = "min-h-11 text-base";

function Result({ state, id }: { state: VendorActionState; id: string }) {
  // Both regions stay mounted so screen readers announce each new message.
  return <>
    <p id={`${id}-error`} role="alert" className="text-sm leading-6 text-destructive empty:hidden">
      {state?.status === "error" ? state.message : ""}
    </p>
    <div role="status" className="text-sm leading-6 empty:hidden">
      {state?.status === "success" ? <>
        <p>{state.message}</p>
        {state.email && state.expiresAt && <NextSteps email={state.email} expiresAt={state.expiresAt}/>}
      </> : null}
    </div>
  </>;
}

/** The invited person's own steps. The app sends no email, so staff pass these on. */
export function NextSteps({ email, expiresAt }: { email: string; expiresAt: string }) {
  return <div className="mt-2 space-y-2">
    <p>Tell this person to follow these steps before <time dateTime={expiresAt}>{expiry.format(new Date(expiresAt))} UTC</time>:</p>
    <ol className="list-decimal space-y-1 pl-5">
      <li>Sign up or sign in with <span className="break-all font-medium">{email}</span>.</li>
      <li>Set up two-step sign-in at /mfa. A new vendor cannot be accepted without it.</li>
      <li>Open /invitations/accept and accept the invitation.</li>
    </ol>
  </div>;
}

export function CreateVendorForm({ idempotencyKey }: { idempotencyKey: string }) {
  const [state, action, pending] = useActionState<VendorActionState, FormData>(createVendorAction, null);
  const id = useId();
  const invalid = state?.status === "error" && state.field === "name";
  return <form action={action} className="space-y-3">
    <input type="hidden" name="idempotencyKey" value={idempotencyKey}/>
    <div className="space-y-2">
      <Label htmlFor={`${id}-name`}>Vendor name</Label>
      <Input id={`${id}-name`} name="name" required maxLength={200} autoComplete="organization"
        defaultValue={state?.status === "error" ? state.value ?? "" : ""}
        aria-invalid={invalid || undefined} aria-describedby={`${id}-hint${invalid ? ` ${id}-error` : ""}`} className={fieldClass}/>
      <p id={`${id}-hint`} className="text-sm text-muted-foreground">Use the company name that vendor users will see.</p>
    </div>
    <Result state={state} id={id}/>
    <Button type="submit" disabled={pending} className="min-h-11 w-full px-4 sm:w-auto">
      {pending ? "Adding vendor…" : "Add vendor"}
    </Button>
  </form>;
}

export function EnablePortalForm({ organizationId, organizationName, idempotencyKey }: {
  organizationId: string; organizationName: string; idempotencyKey: string;
}) {
  const [state, action, pending] = useActionState<VendorActionState, FormData>(enableVendorPortalAction, null);
  const id = useId();
  return <form action={action} className="space-y-2">
    <input type="hidden" name="organizationId" value={organizationId}/>
    <input type="hidden" name="idempotencyKey" value={idempotencyKey}/>
    <Result state={state} id={id}/>
    <Button type="submit" variant="outline" disabled={pending} className="min-h-11 w-full px-4 sm:w-auto"
      aria-label={`Turn on vendor portal for ${organizationName}`}>
      {pending ? "Turning on portal…" : "Turn on vendor portal"}
    </Button>
  </form>;
}

export function InviteAdminForm({ organizationId, organizationName, idempotencyKey }: {
  organizationId: string; organizationName: string; idempotencyKey: string;
}) {
  const [state, action, pending] = useActionState<VendorActionState, FormData>(inviteVendorAdminAction, null);
  const id = useId();
  const invalid = state?.status === "error" && state.field === "email";
  const label = "Invite vendor user";
  return <form action={action} className="space-y-3">
    <input type="hidden" name="organizationId" value={organizationId}/>
    <input type="hidden" name="idempotencyKey" value={idempotencyKey}/>
    <div className="space-y-2">
      <Label htmlFor={`${id}-email`}>Email of the vendor administrator</Label>
      <Input id={`${id}-email`} name="email" type="email" required maxLength={254} autoComplete="off"
        defaultValue={state?.status === "error" ? state.value ?? "" : ""}
        aria-invalid={invalid || undefined} aria-describedby={`${id}-hint${invalid ? ` ${id}-error` : ""}`} className={fieldClass}/>
      <p id={`${id}-hint`} className="text-sm text-muted-foreground">
        This person becomes an organization administrator. The invitation lasts 72 hours. No email is sent.
      </p>
    </div>
    <Result state={state} id={id}/>
    <Button type="submit" disabled={pending} className="min-h-11 w-full px-4 sm:w-auto"
      aria-label={`${label} for ${organizationName}`}>
      {pending ? "Saving invitation…" : label}
    </Button>
  </form>;
}

/** Super Admin only. The reason goes into the audit log. */
export function ListVendorForm({ organizationId, organizationName, idempotencyKey }: {
  organizationId: string; organizationName: string; idempotencyKey: string;
}) {
  const [state, action, pending] = useActionState<VendorActionState, FormData>(listVendorAction, null);
  const id = useId();
  const invalid = state?.status === "error" && state.field === "reason";
  return <form action={action} className="space-y-3">
    <input type="hidden" name="organizationId" value={organizationId}/>
    <input type="hidden" name="idempotencyKey" value={idempotencyKey}/>
    <div className="space-y-2">
      <Label htmlFor={`${id}-reason`}>Reason for listing</Label>
      <textarea id={`${id}-reason`} name="reason" required maxLength={500} rows={2}
        defaultValue={state?.status === "error" ? state.value ?? "" : ""}
        aria-invalid={invalid || undefined} aria-describedby={`${id}-hint${invalid ? ` ${id}-error` : ""}`}
        className="min-h-11 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive md:text-sm"/>
      <p id={`${id}-hint`} className="text-sm text-muted-foreground">
        For example, the source you checked. Listing makes the vendor active with no vendor users. Its products still need approval.
      </p>
    </div>
    <Result state={state} id={id}/>
    <Button type="submit" disabled={pending || state?.status === "success"} className="min-h-11 w-full px-4 sm:w-auto"
      aria-label={`List ${organizationName}`}>
      {pending ? "Listing vendor…" : "List vendor"}
    </Button>
  </form>;
}
