"use client";

import Link from "next/link";
import { useActionState, useId } from "react";

import { Button } from "@/components/ui/button";
import { rfpQuestionKeys } from "@/lib/rfp-form-library";
import { isRfpFormOverdue, RFP_EVENT_LABELS, RFP_FORM_STATES } from "@/lib/rfp-vendor-form";
import type { RfpFormSummary } from "@/server/commands/rfp-vendor-forms";
import { trackRfpFormAction, type RfpFormActionState } from "./actions";

/**
 * One RFP sent to one vendor, as staff track it: status, dates, the log of
 * everything that happened, and the buttons to follow up or record a reply.
 *
 * The same card is used on the customer review page (one card per vendor)
 * and in the vendor workspace (one card per customer RFP). `heading` says
 * which name to show at the top.
 */

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "America/New_York" });
const inputClass = "mt-1 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm";

/** Writes a saved time as a short date, or a dash when there is none. */
function day(value: string | null): string {
  return value ? dateFormat.format(new Date(value)) : "—";
}

/** Today's date as the browser's date input wants it: YYYY-MM-DD. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * One small form inside a fold-out. Every form posts to the same server
 * action; the hidden `intent` field says which button was used.
 */
function TrackForm({ formId, intent, summary, button, children }: {
  formId: string; intent: string; summary: string; button: string; children?: React.ReactNode;
}) {
  const [state, action, pending] = useActionState<RfpFormActionState, FormData>(trackRfpFormAction, null);
  return (
    <details className="rounded-md border px-3 py-2">
      <summary className="min-h-8 cursor-pointer text-sm font-medium">{summary}</summary>
      <form className="mt-3 space-y-3"
        // A fresh id for every submit lets the server ignore an accidental repeat.
        action={(formData) => { formData.set("idempotencyKey", crypto.randomUUID()); action(formData); }}>
        <input type="hidden" name="formId" value={formId} />
        <input type="hidden" name="intent" value={intent} />
        {children}
        <p role={state?.status === "error" ? "alert" : "status"} className={`text-sm empty:hidden ${state?.status === "error" ? "text-destructive" : ""}`}>{state?.message ?? ""}</p>
        <Button type="submit" variant="outline" disabled={pending} className="min-h-11 px-4">{pending ? "Saving…" : button}</Button>
      </form>
    </details>
  );
}

export function RfpTrackingCard({ form, heading }: { form: RfpFormSummary; heading: "vendor" | "customer" }) {
  const id = useId();
  const overdue = isRfpFormOverdue(form.state, form.dueAt);
  const total = rfpQuestionKeys(form.tabKeys).length;
  // What staff may do depends on the form's status.
  const waiting = form.state === "sent";
  const closed = form.state === "submitted" || form.state === "replied" || form.state === "declined" || form.state === "no_response";

  return (
    <article className="space-y-4 rounded-lg border p-5" aria-labelledby={`${id}-title`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h4 id={`${id}-title`} className="break-words text-base font-semibold">
          {heading === "vendor" ? form.vendorName : `${form.customerName} · ${form.rfpTitle}`}
        </h4>
        <p className="text-sm font-medium">
          {RFP_FORM_STATES[form.state]}
          {overdue && <span className="ml-2 rounded-md border border-destructive/50 px-2 py-0.5 text-xs font-semibold text-destructive">Overdue</span>}
        </p>
      </div>

      <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
        <dt className="text-muted-foreground">Contact</dt><dd className="break-all">{form.contactName}, {form.contactEmail}</dd>
        <dt className="text-muted-foreground">Sent</dt><dd>{day(form.sentAt)}</dd>
        <dt className="text-muted-foreground">Due</dt><dd>{day(form.dueAt)}</dd>
        <dt className="text-muted-foreground">Opened by vendor</dt><dd>{form.openedAt ? day(form.openedAt) : "Not yet"}</dd>
        <dt className="text-muted-foreground">Progress</dt><dd>{form.answeredCount} of {total} questions answered · {form.files.length} file{form.files.length === 1 ? "" : "s"}</dd>
        {form.submittedAt && <><dt className="text-muted-foreground">Submitted</dt><dd className="break-all">{day(form.submittedAt)} by {form.respondentName} ({form.respondentEmail})</dd></>}
        {form.repliedAt && <><dt className="text-muted-foreground">Reply date</dt><dd>{day(form.repliedAt)}</dd></>}
      </dl>

      {form.state !== "prepared" && <Link href={`/admin/rfp-forms/${form.formId}`} className="inline-flex min-h-11 items-center text-sm underline underline-offset-4">View answers and files</Link>}

      <section aria-label="Tracking log">
        <h5 className="text-sm font-medium">Tracking log</h5>
        {form.events.length === 0 ? <p className="text-sm text-muted-foreground">Nothing recorded yet.</p> : (
          <ol className="mt-1 space-y-1 text-sm">
            {form.events.map((event) => (
              <li key={event.eventId} className="[overflow-wrap:anywhere]">
                <span className="text-muted-foreground">{day(event.occurredAt)}</span> · {RFP_EVENT_LABELS[event.kind] ?? event.kind}{event.note ? `: ${event.note}` : ""}
              </li>
            ))}
          </ol>
        )}
      </section>

      {form.state !== "prepared" && (
        <div className="space-y-2">
          {waiting && <TrackForm formId={form.formId} intent="follow_up_email" summary="Send a follow-up email" button="Send follow-up email">
            <label className="block text-sm">Message to add (optional)
              <textarea name="note" rows={2} maxLength={1000} className={inputClass} />
            </label>
            <p className="text-sm text-muted-foreground">Sends a reminder with the same private link to {form.contactEmail}.</p>
          </TrackForm>}
          <TrackForm formId={form.formId} intent="follow_up_note" summary="Log a call or other follow-up" button="Save follow-up">
            <label className="block text-sm">What happened
              <textarea name="note" rows={2} maxLength={2000} required className={inputClass} />
            </label>
            <label className="block text-sm">Date
              <input type="date" name="occurredOn" defaultValue={today()} max={today()} className={inputClass} />
            </label>
          </TrackForm>
          {form.state !== "submitted" && <TrackForm formId={form.formId} intent="reply_recorded" summary="Record a reply received outside the form" button="Record reply">
            <label className="block text-sm">Reply date
              <input type="date" name="occurredOn" defaultValue={today()} max={today()} className={inputClass} />
            </label>
            <label className="block text-sm">Notes
              <textarea name="note" rows={3} maxLength={2000} className={inputClass} />
            </label>
          </TrackForm>}
          {form.state !== "submitted" && <TrackForm formId={form.formId} intent="declined" summary="Mark as declined" button="Mark as declined">
            <label className="block text-sm">Notes
              <textarea name="note" rows={2} maxLength={2000} className={inputClass} />
            </label>
          </TrackForm>}
          {form.state !== "submitted" && <TrackForm formId={form.formId} intent="no_response" summary="Mark as no response" button="Mark as no response">
            <label className="block text-sm">Notes
              <textarea name="note" rows={2} maxLength={2000} className={inputClass} />
            </label>
          </TrackForm>}
          {waiting && <TrackForm formId={form.formId} intent="due_changed" summary="Change the due date" button="Save due date">
            <label className="block text-sm">New due date
              <input type="date" name="dueDate" required min={today()} className={inputClass} />
            </label>
          </TrackForm>}
          {closed && <TrackForm formId={form.formId} intent="reopened" summary="Reopen the form for the vendor" button="Reopen form">
            <label className="block text-sm">New due date (needed if the old one has passed)
              <input type="date" name="dueDate" min={today()} className={inputClass} />
            </label>
            <p className="text-sm text-muted-foreground">The vendor can change answers again with the same link. Saved answers are kept.</p>
          </TrackForm>}
        </div>
      )}
    </article>
  );
}
