"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { CLIENT_OVERVIEW_FIELDS, type ClientOverview } from "@/lib/rfp-vendor-form";
import { AuthorizationError } from "@/server/auth/authorization";
import { requireTrustedServerActionOrigin } from "@/server/auth/server-action-request";
import {
  recordRfpFormEvent, RfpVendorFormError, sendRfpVendorForm, sendRfpVendorFormFollowUp, type RfpSendOutcome,
} from "@/server/commands/rfp-vendor-forms";

/**
 * Server actions behind the staff RFP send-out and tracking screens.
 * Each action reads a submitted form, calls one command, and returns a short
 * message for the screen. The commands check staff access themselves.
 */

/** What an action reports back to the screen. */
export type RfpFormActionState = { status: "success" | "error"; message: string } | null;

const refused = "This action was refused. You need staff access with two-step sign-in. Reload the page and try again.";
const uncertain = "We could not confirm the result. Reload the page to check the saved state before trying again.";

/** The message shown for each way a send can end. */
const sendMessages: Record<RfpSendOutcome, RfpFormActionState> = {
  sent: { status: "success", message: "Email sent." },
  contact_missing: { status: "error", message: "This vendor has no RFP contact. Add one at Administration, Vendors, then send again." },
  closed: { status: "error", message: "This form is closed. Reopen it before sending again." },
  links_not_configured: { status: "error", message: "Private links are not set up on this server. RFP_FORM_LINK_SECRET is missing." },
  email_not_configured: { status: "error", message: "Email is not set up on this server. RESEND_API_KEY or EMAIL_FROM is missing. The form was saved but not sent." },
  email_rejected: { status: "error", message: "The email service refused this email. Check the contact address and the sender domain. The form was saved but not sent." },
  email_unavailable: { status: "error", message: "The email service did not answer. The form was saved but not sent. Try again in a minute." },
};

/** Reads one text field from a submitted form. */
function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/**
 * Turns a date picked in the browser (like "2026-12-02") into the exact
 * moment that day ends in US Eastern time. Eastern time is 4 or 5 hours
 * behind UTC depending on daylight saving, so we test which one applies.
 */
function endOfDayEastern(day: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  for (const offset of ["-05:00", "-04:00"]) {
    const moment = new Date(`${day}T23:59:59${offset}`);
    if (Number.isNaN(moment.getTime())) return null;
    const hour = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", hourCycle: "h23" }).format(moment);
    if (hour === "23") return moment.toISOString();
  }
  return null;
}

/** Turns a thrown error into a message for the screen. */
function failure(error: unknown, invalid: string): RfpFormActionState {
  if (error instanceof AuthorizationError) return { status: "error", message: refused };
  if (error instanceof RfpVendorFormError && error.code === "INVALID_INPUT") return { status: "error", message: invalid };
  return { status: "error", message: uncertain };
}

/** Refreshes every screen that shows tracking data. */
function refresh() {
  revalidatePath("/admin/evaluations");
  revalidatePath("/admin/vendor-evidence");
  revalidatePath("/admin/rfp-forms", "layout");
}

/** Sends the RFP web form to one vendor. The pressed button names the vendor. */
export async function sendRfpFormAction(_previous: RfpFormActionState, formData: FormData): Promise<RfpFormActionState> {
  requireTrustedServerActionOrigin((await headers()).get("origin"));
  const recipientId = text(formData, "recipientId");
  const dueAt = endOfDayEastern(text(formData, `dueDate.${recipientId}`));
  if (!dueAt) return { status: "error", message: "Choose a due date for this vendor." };
  // Collect the client overview fields and the ticked topic tabs.
  const clientOverview = Object.fromEntries(CLIENT_OVERVIEW_FIELDS.map((field) => [field.key, text(formData, `overview.${field.key}`)])) as ClientOverview;
  const tabKeys = formData.getAll("tab").filter((value): value is string => typeof value === "string");
  if (tabKeys.length === 0) return { status: "error", message: "Tick at least one topic tab to include." };
  try {
    const result = await sendRfpVendorForm({
      organizationId: text(formData, "organizationId"), recipientId, tabKeys, clientOverview, dueAt,
      idempotencyKey: text(formData, "idempotencyKey"), correlationId: randomUUID(),
    });
    refresh();
    return sendMessages[result.outcome];
  } catch (error) {
    return failure(error, "Check the form. A company name, at least one tab, and a future due date are required.");
  }
}

/** Handles every button on a tracking card. `intent` says which one. */
export async function trackRfpFormAction(_previous: RfpFormActionState, formData: FormData): Promise<RfpFormActionState> {
  requireTrustedServerActionOrigin((await headers()).get("origin"));
  const intent = text(formData, "intent");
  const base = { formId: text(formData, "formId"), idempotencyKey: text(formData, "idempotencyKey"), correlationId: randomUUID() };
  const note = text(formData, "note").trim() || undefined;
  try {
    if (intent === "follow_up_email") {
      const result = await sendRfpVendorFormFollowUp({ ...base, note });
      refresh();
      return result.outcome === "sent" ? { status: "success", message: "Follow-up email sent." } : sendMessages[result.outcome];
    }
    // A date typed by staff ("when did this happen") is taken as noon UTC of
    // that day, which shows as the same calendar day in every US time zone.
    const day = text(formData, "occurredOn");
    const occurredAt = /^\d{4}-\d{2}-\d{2}$/.test(day) ? `${day}T12:00:00.000Z` : undefined;
    const dueDay = text(formData, "dueDate");
    const dueAt = dueDay ? endOfDayEastern(dueDay) ?? undefined : undefined;
    if (dueDay && !dueAt) return { status: "error", message: "Choose a valid due date." };
    if (intent !== "follow_up_note" && intent !== "reply_recorded" && intent !== "declined" && intent !== "no_response"
      && intent !== "reopened" && intent !== "due_changed") return { status: "error", message: uncertain };
    const result = await recordRfpFormEvent({ ...base, kind: intent, note, occurredAt, dueAt });
    refresh();
    if (result.outcomeCode === "conflict") {
      return { status: "error", message: "This change does not fit the form's current status. To reopen a form, set a due date in the future." };
    }
    return { status: "success", message: "Saved." };
  } catch (error) {
    return failure(error, "Check the entry. Notes can have up to 2,000 characters, dates cannot be in the future, and a new due date must be in the future.");
  }
}
