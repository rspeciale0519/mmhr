import { z } from "zod";
import { RFP_ANSWER_CHOICES, RFP_REQUESTED_DOCUMENTS, RFP_TAB_KEYS } from "./rfp-form-library";

/**
 * Shared rules for the RFP web form.
 *
 * This file has no server-only code, so both the browser (the form) and the
 * server (the commands) import it. Keeping the rules in one place means the
 * two sides can never disagree about what a valid answer looks like.
 */

/**
 * The "Client overview" fields shown to the vendor, in display order.
 * `key` is how the value is stored. `label` is what people read.
 * `long` marks a field that needs a multi-line box.
 */
export const CLIENT_OVERVIEW_FIELDS = [
  { key: "companyName", label: "Company name", required: true },
  { key: "address", label: "Address" },
  { key: "cityStateZip", label: "City, state, ZIP" },
  { key: "businessType", label: "Type of business" },
  { key: "locations", label: "Locations" },
  { key: "employeeCount", label: "Total employee count" },
  { key: "employeeClasses", label: "Primary classes of employees" },
  { key: "currentPayrollHrVendor", label: "Current payroll and HR vendor" },
  { key: "otherCurrentVendors", label: "Other current vendors (recruiting, benefits, and so on)" },
  { key: "payFrequencies", label: "Payroll and deduction frequencies" },
  { key: "timeline", label: "Timeline and key dates", long: true },
] as const satisfies readonly { key: string; label: string; required?: boolean; long?: boolean }[];

export type ClientOverviewKey = (typeof CLIENT_OVERVIEW_FIELDS)[number]["key"];

/** Customer details as saved: every field is text, and may be empty. */
export type ClientOverview = Record<ClientOverviewKey, string>;

/** One text value: trimmed, at most 4,000 characters. */
const overviewText = z.string().trim().max(4000);

/** Checks the client overview. Only the company name is required. */
export const clientOverviewSchema = z.strictObject(
  Object.fromEntries(CLIENT_OVERVIEW_FIELDS.map((field) =>
    [field.key, field.key === "companyName" ? overviewText.min(1) : overviewText])) as Record<ClientOverviewKey, typeof overviewText>,
);

/** Checks the list of chosen tabs: at least one, each a real tab, no repeats. */
export const tabKeysSchema = z.array(z.string()).min(1).max(RFP_TAB_KEYS.length)
  .refine((keys) => keys.every((key) => RFP_TAB_KEYS.includes(key)), "Unknown tab")
  .refine((keys) => new Set(keys).size === keys.length, "Repeated tab");

const answerValues = RFP_ANSWER_CHOICES.map((choice) => choice.value) as [string, ...string[]];

/** One saved answer. Both parts may be empty (null) while the vendor works. */
export const rfpAnswerSchema = z.strictObject({
  answer: z.enum(answerValues).nullable(),
  comment: z.string().max(2000).nullable(),
});
export type RfpAnswer = z.infer<typeof rfpAnswerSchema>;

/** All saved answers, stored under each question's key. */
export type RfpAnswers = Record<string, RfpAnswer>;

/** The six states of a form, with the label staff see. */
export const RFP_FORM_STATES = {
  prepared: "Not sent",
  sent: "Sent, waiting for reply",
  submitted: "Replied on the web form",
  replied: "Replied (recorded by staff)",
  declined: "Declined",
  no_response: "No response",
} as const;
export type RfpFormState = keyof typeof RFP_FORM_STATES;

/** The kinds of line in the tracking log, with the label staff see. */
export const RFP_EVENT_LABELS: Record<string, string> = {
  email_sent: "RFP email sent",
  email_failed: "RFP email failed to send",
  opened: "Vendor opened the form",
  follow_up_email: "Follow-up email sent",
  follow_up_note: "Follow-up noted",
  submitted: "Vendor submitted the form",
  reply_recorded: "Reply recorded",
  declined: "Marked as declined",
  no_response: "Marked as no response",
  reopened: "Form reopened",
  due_changed: "Due date changed",
};

/** File types a vendor may upload: the extension and its official type name. */
export const RFP_UPLOAD_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};

/** Largest upload: 4 MB. The hosting platform refuses bigger requests. */
export const RFP_UPLOAD_MAX_BYTES = 4 * 1024 * 1024;
/** Most files one vendor can attach to one form. */
export const RFP_UPLOAD_MAX_FILES = 12;

/** Valid "which document is this" keys: the requested ones plus "other". */
export const RFP_DOCUMENT_KEYS: readonly string[] = [...RFP_REQUESTED_DOCUMENTS.map((doc) => doc.key), "other"];

/**
 * Adds business days (Monday to Friday) to a date.
 * Example: 10 business days after a Wednesday is the Wednesday two weeks on.
 */
export function addBusinessDays(from: Date, days: number): Date {
  const result = new Date(from);
  let remaining = days;
  while (remaining > 0) {
    result.setDate(result.getDate() + 1);
    const weekday = result.getDay(); // 0 is Sunday, 6 is Saturday
    if (weekday !== 0 && weekday !== 6) remaining -= 1;
  }
  return result;
}

/** True when a sent form is past its due date and still has no reply. */
export function isRfpFormOverdue(state: string, dueAt: string, now: Date = new Date()): boolean {
  return state === "sent" && new Date(dueAt).getTime() < now.getTime();
}
