"use client";

import { startTransition, useActionState } from "react";

import { Button } from "@/components/ui/button";
import { brand } from "@/lib/brand";
import { RFP_LIBRARY } from "@/lib/rfp-form-library";
import { CLIENT_OVERVIEW_FIELDS } from "@/lib/rfp-vendor-form";
import type { RfpSendOut } from "@/server/commands/rfp-vendor-forms";
import { sendRfpFormAction, type RfpFormActionState } from "./actions";
import { RfpTrackingCard } from "./tracking-card";

/**
 * Staff screen section: send a delivered RFP to each vendor by email.
 *
 * It is one form. Staff fill in the client overview once, tick the topic
 * tabs to include, then press "Send" beside each vendor. The pressed
 * button's value tells the server which vendor to send to.
 */

const inputClass = "mt-1 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm";

/** `defaultDueDate` is YYYY-MM-DD, worked out on the server (10 business days ahead). */
export function RfpSendOutPanel({ sendOut, defaultDueDate }: { sendOut: RfpSendOut; defaultDueDate: string }) {
  const [state, action, pending] = useActionState<RfpFormActionState, FormData>(sendRfpFormAction, null);
  // Pre-fill from the last form sent for this customer, if there is one.
  const overview: Record<string, string> = sendOut.lastClientOverview ?? { companyName: sendOut.customerName };
  const tabs = new Set(sendOut.lastTabKeys ?? RFP_LIBRARY.map((tab) => tab.key));
  const today = new Date().toISOString().slice(0, 10);

  /**
   * Sends the form ourselves instead of letting the browser do it. That way
   * the typed client overview stays on screen if the send fails.
   */
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // The second argument adds the pressed button, which names the vendor.
    const formData = new FormData(event.currentTarget, (event.nativeEvent as SubmitEvent).submitter);
    // A fresh id for every submit lets the server ignore an accidental repeat.
    formData.set("idempotencyKey", crypto.randomUUID());
    startTransition(() => action(formData));
  }

  return (
    <section className="space-y-6 rounded-lg border p-5" aria-labelledby={`send-out-${sendOut.rfpId}`}>
      <div>
        <h3 id={`send-out-${sendOut.rfpId}`} className="text-lg font-semibold">Email the RFP form to vendors</h3>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          Each vendor contact gets an email with a private link to the RFP web form. No vendor sign-in is needed.
          The form shows the client overview below, the RFP text above as its introduction, and the topic tabs you tick.
        </p>
      </div>

      <form className="space-y-6" onSubmit={submit}>
        <input type="hidden" name="organizationId" value={sendOut.organizationId} />

        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold">Client overview (shown to vendors)</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {CLIENT_OVERVIEW_FIELDS.map((field) => (
              <label key={field.key} className={`block text-sm ${"long" in field && field.long ? "sm:col-span-2" : ""}`}>{field.label}
                {"long" in field && field.long
                  ? <textarea name={`overview.${field.key}`} rows={3} maxLength={4000} defaultValue={overview[field.key] ?? ""} className={inputClass} />
                  : <input name={`overview.${field.key}`} maxLength={4000} required={"required" in field && field.required} defaultValue={overview[field.key] ?? ""} className={inputClass} />}
              </label>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">Vendors see {brand.name} as the only contact. Do not enter the client&apos;s contact person here.</p>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold">Topic tabs to include</legend>
          <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
            {RFP_LIBRARY.map((tab) => (
              <label key={tab.key} className="flex min-h-9 items-center gap-3 text-sm">
                <input type="checkbox" name="tab" value={tab.key} defaultChecked={tabs.has(tab.key)} className="size-4" />
                <span>{tab.title} <span className="text-muted-foreground">({tab.items.filter((item) => item.kind === "question").length})</span></span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold">Vendors</legend>
          {sendOut.recipients.length === 0 && <p className="text-sm">This RFP has no vendors.</p>}
          <ul className="space-y-3">
            {sendOut.recipients.map((recipient) => {
              // A closed form must be reopened on its tracking card first.
              const canSend = recipient.contactEmail !== null && (recipient.form === null || recipient.form.state === "prepared" || recipient.form.state === "sent");
              const sentBefore = recipient.form?.state === "sent";
              return (
                <li key={recipient.recipientId} className="flex flex-wrap items-end justify-between gap-3 rounded-md border px-3 py-3">
                  <div className="min-w-0 text-sm">
                    <p className="font-medium">{recipient.vendorName}</p>
                    <p className="break-all text-muted-foreground">{recipient.contactEmail ? `${recipient.contactName}, ${recipient.contactEmail}` : "No RFP contact. Add one at Administration, Vendors."}</p>
                  </div>
                  {canSend && <div className="flex flex-wrap items-end gap-3">
                    <label className="block text-sm">Due date
                      <input type="date" name={`dueDate.${recipient.recipientId}`} min={today} required
                        defaultValue={recipient.form ? recipient.form.dueAt.slice(0, 10) : defaultDueDate} className={inputClass} />
                    </label>
                    <Button type="submit" name="recipientId" value={recipient.recipientId} disabled={pending} className="min-h-11 px-4"
                      aria-label={`${sentBefore ? "Send again to" : "Send RFP email to"} ${recipient.vendorName}`}>
                      {sentBefore ? "Send again" : "Send RFP email"}
                    </Button>
                  </div>}
                </li>
              );
            })}
          </ul>
        </fieldset>
        <p role={state?.status === "error" ? "alert" : "status"} className={`text-sm empty:hidden ${state?.status === "error" ? "text-destructive" : ""}`}>{pending ? "Sending…" : state?.message ?? ""}</p>
      </form>

      {sendOut.recipients.some((recipient) => recipient.form) && (
        <div className="space-y-3">
          <h3 className="text-lg font-semibold">Vendor tracking</h3>
          {sendOut.recipients.map((recipient) => recipient.form && <RfpTrackingCard key={recipient.form.formId} form={recipient.form} heading="vendor" />)}
        </div>
      )}
    </section>
  );
}
