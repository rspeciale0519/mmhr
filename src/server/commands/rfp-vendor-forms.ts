import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { AuthorizationError, requirePermission, type AuthorizationOptions } from "@/server/auth/authorization";
import { RFP_LIBRARY_VERSION } from "@/lib/rfp-form-library";
import { clientOverviewSchema, rfpAnswerSchema, tabKeysSchema } from "@/lib/rfp-vendor-form";
import { sendResendEmail, type ResendResult } from "@/server/integrations/email/resend-email";
import { buildRfpEmail } from "@/server/workflows/rfp-vendor-form-email";
import { rfpFormToken, rfpFormTokenHash, rfpFormUrl } from "@/server/workflows/rfp-vendor-form-link";

/**
 * Staff commands for the RFP web form: vendor contacts, sending the form by
 * email, follow-ups, recording replies, and reading the tracking data.
 *
 * Every function here first checks that the caller is MMHR staff with
 * two-step sign-in ("admin.access"). The SQL functions in migration 0180
 * check again, so a mistake here cannot open the data.
 */

/** Thrown for a problem the screen can explain to staff. */
export class RfpVendorFormError extends Error {
  constructor(readonly code: "INVALID_INPUT" | "UNAVAILABLE" | "INVALID_RESPONSE") {
    super("RFP vendor form request failed");
    this.name = "RfpVendorFormError";
  }
}

const uuid = z.uuid().transform((value) => value.toLowerCase());
const date = z.iso.datetime({ offset: true });
const email = z.string().trim().toLowerCase().min(3).max(320).regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
// Two ids travel with every change: one to trace it, one to make retries safe.
const commandIds = { correlationId: uuid, idempotencyKey: uuid };

/** One line of the tracking log. */
const eventSchema = z.strictObject({
  eventId: uuid, kind: z.string().min(1).max(40), note: z.string().nullable(), occurredAt: date, byStaff: z.boolean(),
});
const fileSchema = z.strictObject({
  fileId: uuid, documentKey: z.string(), fileName: z.string(), byteSize: z.number().int().positive(), uploadedAt: date,
});
const formState = z.enum(["prepared", "sent", "submitted", "replied", "declined", "no_response"]);

/** One form as shown in tracking lists. It does not include the answers. */
const formSummarySchema = z.strictObject({
  formId: uuid, organizationId: uuid, recipientId: uuid, vendorOrganizationId: uuid,
  vendorName: z.string(), customerName: z.string(), rfpTitle: z.string(), state: formState,
  contactName: z.string(), contactEmail: z.string(), tabKeys: z.array(z.string()), libraryVersion: z.number().int().positive(),
  dueAt: date, sentAt: date.nullable(), openedAt: date.nullable(), submittedAt: date.nullable(), repliedAt: date.nullable(),
  respondentName: z.string().nullable(), respondentEmail: z.string().nullable(),
  answeredCount: z.number().int().nonnegative(), events: z.array(eventSchema), files: z.array(fileSchema),
});
export type RfpFormSummary = z.output<typeof formSummarySchema>;

const sendOutSchema = z.strictObject({
  organizationId: uuid, rfpId: uuid, version: z.number().int().positive(), title: z.string(), status: z.string(),
  customerName: z.string(),
  recipients: z.array(z.strictObject({
    recipientId: uuid, vendorOrganizationId: uuid, vendorName: z.string(), deadlineAt: date.nullable(),
    contactName: z.string().nullable(), contactEmail: z.string().nullable(), form: formSummarySchema.nullable(),
  })),
  lastClientOverview: z.record(z.string(), z.string()).nullable(), lastTabKeys: z.array(z.string()).nullable(),
  correlationId: uuid,
});
export type RfpSendOut = z.output<typeof sendOutSchema>;

const formDetailSchema = formSummarySchema.extend({
  answers: z.record(z.string(), rfpAnswerSchema), clientOverview: z.record(z.string(), z.string()),
  rfpIntroduction: z.string(), correlationId: uuid,
});
export type RfpFormDetail = z.output<typeof formDetailSchema>;

const trackingSchema = z.strictObject({
  vendorOrganizationId: uuid,
  contact: z.strictObject({ contactName: z.string(), contactEmail: z.string() }).nullable(),
  items: z.array(formSummarySchema), correlationId: uuid,
});
export type VendorRfpTracking = z.output<typeof trackingSchema>;

const contactsSchema = z.strictObject({
  items: z.array(z.strictObject({ vendorOrganizationId: uuid, contactName: z.string(), contactEmail: z.string() })),
});

const preparedSchema = z.union([
  z.strictObject({ outcomeCode: z.enum(["contact_missing", "closed"]), correlationId: uuid }),
  z.strictObject({
    outcomeCode: z.enum(["prepared", "replayed"]), formId: uuid, state: formState, dueAt: date,
    contactName: z.string(), contactEmail: z.string(), rfpTitle: z.string(), vendorName: z.string(),
    customerName: z.string(), correlationId: uuid,
  }),
]);

const eventResultSchema = z.strictObject({
  formId: uuid, state: formState, outcomeCode: z.enum(["recorded", "replayed", "conflict"]), correlationId: uuid,
});

/** Confirms the caller is staff with two-step sign-in. */
async function staffContext(options: AuthorizationOptions) {
  const context = await requirePermission("admin.access", { kind: "platform" }, options);
  if (context.scope.kind !== "platform" || context.assurance !== "aal2") throw new AuthorizationError();
  return context;
}

/** Runs one SQL function as the signed-in staff member and checks its answer. */
async function call<T>(name: string, args: Record<string, unknown>, schema: z.ZodType<T>, options: AuthorizationOptions): Promise<T> {
  const context = await staffContext(options);
  let response;
  try { response = await context.supabase.rpc(name, args); }
  catch { throw new RfpVendorFormError("UNAVAILABLE"); }
  if (!response || response.error) {
    // 42501 is the database's "permission denied". 22023 is "bad input".
    if (response?.error?.code === "42501") throw new AuthorizationError();
    if (response?.error?.code === "22023") throw new RfpVendorFormError("INVALID_INPUT");
    throw new RfpVendorFormError("UNAVAILABLE");
  }
  const result = schema.safeParse(response.data);
  if (!result.success) throw new RfpVendorFormError("INVALID_RESPONSE");
  return result.data;
}

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new RfpVendorFormError("INVALID_INPUT");
  return parsed.data;
}

// ---------------------------------------------------------------------------
// Vendor contacts
// ---------------------------------------------------------------------------

export const vendorRfpContactInputSchema = z.strictObject({
  vendorOrganizationId: uuid, contactName: z.string().trim().min(1).max(200), contactEmail: email, ...commandIds,
});

/** Saves the person at a vendor who receives RFP emails. */
export async function setVendorRfpContact(input: z.input<typeof vendorRfpContactInputSchema>, options: AuthorizationOptions = {}) {
  const value = parse(vendorRfpContactInputSchema, input);
  return call("mmhr_set_vendor_rfp_contact", {
    payload: { vendorOrganizationId: value.vendorOrganizationId, contactName: value.contactName, contactEmail: value.contactEmail },
    correlation_id: value.correlationId, idempotency_key: value.idempotencyKey,
  }, z.strictObject({ vendorOrganizationId: uuid, outcomeCode: z.enum(["saved", "replayed"]), correlationId: uuid }),
  { ...options, correlationId: value.correlationId });
}

/** Returns every saved vendor contact, keyed by vendor organization id. */
export async function getVendorRfpContacts(options: AuthorizationOptions = {}) {
  const { items } = await call("mmhr_get_vendor_rfp_contacts", {}, contactsSchema, options);
  return new Map(items.map((item) => [item.vendorOrganizationId, item]));
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/** The vendors on one delivered RFP, each with its contact and form. */
export async function getRfpSendOut(input: { organizationId: string; rfpId: string; version: number }, options: AuthorizationOptions = {}) {
  const value = parse(z.strictObject({ organizationId: uuid, rfpId: uuid, version: z.number().int().positive() }), input);
  return call("mmhr_get_rfp_send_out", { payload: value, correlation_id: randomUUID() }, sendOutSchema, options);
}

/** One form with all its answers. */
export async function getRfpVendorForm(formId: string, options: AuthorizationOptions = {}) {
  return call("mmhr_get_rfp_vendor_form", { payload: { formId: parse(uuid, formId) }, correlation_id: randomUUID() }, formDetailSchema, options);
}

/** The newest forms sent to one vendor, for the vendor workspace. */
export async function getVendorRfpTracking(vendorOrganizationId: string, options: AuthorizationOptions = {}) {
  return call("mmhr_get_vendor_rfp_tracking", {
    payload: { vendorOrganizationId: parse(uuid, vendorOrganizationId) }, correlation_id: randomUUID(),
  }, trackingSchema, options);
}

/** One uploaded file with its bytes, for a staff download. */
export async function getRfpVendorFormFile(fileId: string, options: AuthorizationOptions = {}) {
  const file = await call("mmhr_get_rfp_vendor_form_file", { payload: { fileId: parse(uuid, fileId) }, correlation_id: randomUUID() },
    z.strictObject({ fileId: uuid, fileName: z.string(), contentType: z.string(), byteSize: z.number().int().positive(),
      contentBase64: z.string(), correlationId: uuid }), options);
  return { fileName: file.fileName, contentType: file.contentType, bytes: Buffer.from(file.contentBase64, "base64") };
}

// ---------------------------------------------------------------------------
// Tracking log
// ---------------------------------------------------------------------------

export const rfpFormEventInputSchema = z.strictObject({
  formId: uuid,
  kind: z.enum(["follow_up_note", "reply_recorded", "declined", "no_response", "reopened", "due_changed"]),
  note: z.string().trim().max(2000).optional(),
  occurredAt: date.optional(),
  dueAt: date.optional(),
  ...commandIds,
});

/** Internal: writes one tracking line. Email kinds are only used by this file. */
async function recordEvent(
  value: { formId: string; kind: string; note?: string; occurredAt?: string; dueAt?: string; providerMessageId?: string;
    correlationId: string; idempotencyKey: string },
  options: AuthorizationOptions,
) {
  const { correlationId, idempotencyKey, ...fields } = value;
  // Leave out empty fields: the SQL function accepts only text values.
  const payload = Object.fromEntries(Object.entries(fields).filter(([, item]) => item !== undefined && item !== ""));
  return call("mmhr_record_rfp_vendor_form_event", { payload, correlation_id: correlationId, idempotency_key: idempotencyKey },
    eventResultSchema, { ...options, correlationId });
}

/** Staff record a follow-up note, a reply, a status, a reopen, or a new due date. */
export async function recordRfpFormEvent(input: z.input<typeof rfpFormEventInputSchema>, options: AuthorizationOptions = {}) {
  return recordEvent(parse(rfpFormEventInputSchema, input), options);
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

/** What a send attempt ended as. The screen turns each into a message. */
export type RfpSendOutcome =
  | "sent" | "contact_missing" | "closed" | "links_not_configured" | "email_not_configured" | "email_rejected" | "email_unavailable";

/** Maps the email sender's result to an outcome. */
function emailOutcome(result: ResendResult): RfpSendOutcome {
  if (result.ok) return "sent";
  if (result.reason === "not_configured") return "email_not_configured";
  return result.reason === "rejected" ? "email_rejected" : "email_unavailable";
}

export const sendRfpVendorFormInputSchema = z.strictObject({
  organizationId: uuid, recipientId: uuid, tabKeys: tabKeysSchema, clientOverview: clientOverviewSchema, dueAt: date, ...commandIds,
});

/** Lets tests replace the email sender and the link secret. */
export type RfpSendDependencies = { sendEmail?: typeof sendResendEmail; linkSecret?: string; baseUrl?: string };

/**
 * Sends the RFP web form to one vendor's contact.
 *
 * Steps:
 * 1. Make the vendor's private link token and save the form (only the
 *    token's hash is stored).
 * 2. Send the email through Resend.
 * 3. Write the result to the tracking log. Only a successful send moves the
 *    form to "sent" and makes the link work.
 */
export async function sendRfpVendorForm(
  input: z.input<typeof sendRfpVendorFormInputSchema>, options: AuthorizationOptions = {}, dependencies: RfpSendDependencies = {},
): Promise<{ outcome: RfpSendOutcome; formId: string | null }> {
  const value = parse(sendRfpVendorFormInputSchema, input);
  const token = rfpFormToken(value.recipientId, dependencies.linkSecret);
  if (!token) return { outcome: "links_not_configured", formId: null };

  const prepared = await call("mmhr_prepare_rfp_vendor_form", {
    payload: {
      organizationId: value.organizationId, recipientId: value.recipientId, tokenHash: rfpFormTokenHash(token),
      libraryVersion: RFP_LIBRARY_VERSION, tabKeys: value.tabKeys, clientOverview: value.clientOverview, dueAt: value.dueAt,
    },
    correlation_id: value.correlationId, idempotency_key: value.idempotencyKey,
  }, preparedSchema, { ...options, correlationId: value.correlationId });
  // Only a prepared form carries a form id. The other outcomes stop here.
  if (!("formId" in prepared)) return { outcome: prepared.outcomeCode, formId: null };

  const message = buildRfpEmail({
    kind: "invitation", contactName: prepared.contactName, vendorName: prepared.vendorName,
    customerName: value.clientOverview.companyName, rfpTitle: prepared.rfpTitle,
    formUrl: rfpFormUrl(token, dependencies.baseUrl), dueAt: new Date(prepared.dueAt),
  });
  // The form id is the email's idempotency key: a retry cannot double-send.
  const result = await (dependencies.sendEmail ?? sendResendEmail)({ to: prepared.contactEmail, ...message, idempotencyKey: `rfp-form-${prepared.formId}-${value.idempotencyKey}` });
  await recordEvent({
    formId: prepared.formId, kind: result.ok ? "email_sent" : "email_failed",
    providerMessageId: result.ok ? result.providerMessageId : undefined,
    note: result.ok ? undefined : `Email not sent: ${result.reason.replace("_", " ")}`,
    correlationId: value.correlationId, idempotencyKey: randomUUID(),
  }, options);
  return { outcome: emailOutcome(result), formId: prepared.formId };
}

export const followUpRfpVendorFormInputSchema = z.strictObject({
  formId: uuid, note: z.string().trim().max(1000).optional(), ...commandIds,
});

/** Emails the vendor contact a reminder with the same private link. */
export async function sendRfpVendorFormFollowUp(
  input: z.input<typeof followUpRfpVendorFormInputSchema>, options: AuthorizationOptions = {}, dependencies: RfpSendDependencies = {},
): Promise<{ outcome: RfpSendOutcome }> {
  const value = parse(followUpRfpVendorFormInputSchema, input);
  const form = await getRfpVendorForm(value.formId, options);
  // A reminder only makes sense while the vendor can still answer.
  if (form.state !== "sent") return { outcome: "closed" };
  const token = rfpFormToken(form.recipientId, dependencies.linkSecret);
  if (!token) return { outcome: "links_not_configured" };
  const message = buildRfpEmail({
    kind: "follow_up", contactName: form.contactName, vendorName: form.vendorName,
    customerName: form.clientOverview.companyName ?? form.customerName, rfpTitle: form.rfpTitle,
    formUrl: rfpFormUrl(token, dependencies.baseUrl), dueAt: new Date(form.dueAt), note: value.note || undefined,
  });
  const result = await (dependencies.sendEmail ?? sendResendEmail)({ to: form.contactEmail, ...message, idempotencyKey: `rfp-follow-up-${value.idempotencyKey}` });
  if (result.ok) {
    await recordEvent({
      formId: form.formId, kind: "follow_up_email", note: value.note || undefined, providerMessageId: result.providerMessageId,
      correlationId: value.correlationId, idempotencyKey: value.idempotencyKey,
    }, options);
  }
  return { outcome: emailOutcome(result) };
}
