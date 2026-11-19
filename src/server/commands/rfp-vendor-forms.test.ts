import { beforeEach, describe, expect, test, vi } from "vitest";

import { AuthorizationError, requirePermission } from "@/server/auth/authorization";
import { rfpFormToken, rfpFormTokenHash } from "@/server/workflows/rfp-vendor-form-link";
import {
  getRfpVendorFormFile, getVendorRfpContacts, recordRfpFormEvent, sendRfpVendorForm, sendRfpVendorFormFollowUp,
  setVendorRfpContact,
} from "./rfp-vendor-forms";

vi.mock("server-only", () => ({}));
vi.mock("@/server/auth/authorization", async (original) => ({
  ...(await original<typeof import("@/server/auth/authorization")>()), requirePermission: vi.fn(),
}));

const organizationId = "11111111-1111-4111-8111-111111111111";
const vendorOrganizationId = "22222222-2222-4222-8222-222222222222";
const recipientId = "33333333-3333-4333-8333-333333333333";
const correlationId = "44444444-4444-4444-8444-444444444444";
const idempotencyKey = "55555555-5555-4555-8555-555555555555";
const formId = "66666666-6666-4666-8666-666666666666";
const dueAt = "2026-12-03T04:59:59.000Z";
const linkSecret = "test-secret-that-is-at-least-32-chars";
const baseUrl = "https://example.com";
const rpc = vi.fn();
const sendEmail = vi.fn();
const dependencies = { sendEmail, linkSecret, baseUrl };

const clientOverview = { companyName: "Acme", address: "", cityStateZip: "", businessType: "", locations: "", employeeCount: "250",
  employeeClasses: "", currentPayrollHrVendor: "", otherCurrentVendors: "", payFrequencies: "", timeline: "" };
const sendInput = { organizationId, recipientId, tabKeys: ["core", "payroll"], clientOverview, dueAt, correlationId, idempotencyKey };
const prepared = {
  outcomeCode: "prepared", formId, state: "prepared", dueAt, contactName: "Pat Lee", contactEmail: "pat@northwind.example",
  rfpTitle: "HRIS RFP", vendorName: "Northwind", customerName: "Acme", correlationId,
};
const recorded = { formId, state: "sent", outcomeCode: "recorded", correlationId };
const summary = {
  formId, organizationId, recipientId, vendorOrganizationId, vendorName: "Northwind", customerName: "Acme", rfpTitle: "HRIS RFP",
  state: "sent", contactName: "Pat Lee", contactEmail: "pat@northwind.example", tabKeys: ["core"], libraryVersion: 1, dueAt,
  sentAt: dueAt, openedAt: null, submittedAt: null, repliedAt: null, respondentName: null, respondentEmail: null,
  answeredCount: 0, events: [], files: [],
};
const detail = { ...summary, answers: {}, clientOverview: { companyName: "Acme" }, rfpIntroduction: "Intro", correlationId };

beforeEach(() => {
  rpc.mockReset();
  sendEmail.mockReset().mockResolvedValue({ ok: true, providerMessageId: "email_1" });
  vi.mocked(requirePermission).mockReset().mockResolvedValue({
    supabase: { rpc }, identityId: "77777777-7777-4777-8777-777777777777",
    scope: { kind: "platform" }, assurance: "aal2", correlationId,
  } as never);
});

describe("staff access", () => {
  test("denies AAL1 staff and organization scope before any database call", async () => {
    vi.mocked(requirePermission).mockResolvedValueOnce({ supabase: { rpc }, scope: { kind: "platform" }, assurance: "aal1" } as never);
    await expect(getVendorRfpContacts()).rejects.toBeInstanceOf(AuthorizationError);
    vi.mocked(requirePermission).mockResolvedValueOnce({
      supabase: { rpc }, scope: { kind: "organization", organizationId }, assurance: "aal2",
    } as never);
    await expect(sendRfpVendorForm(sendInput, {}, dependencies)).rejects.toBeInstanceOf(AuthorizationError);
    expect(rpc).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  test("turns a database permission error into a denial", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "42501" } });
    await expect(getVendorRfpContacts()).rejects.toBeInstanceOf(AuthorizationError);
    expect(requirePermission).toHaveBeenCalledWith("admin.access", { kind: "platform" }, {});
  });
});

describe("vendor RFP contact", () => {
  test("saves a trimmed name and a lower-case email", async () => {
    rpc.mockResolvedValue({ data: { vendorOrganizationId, outcomeCode: "saved", correlationId }, error: null });
    await setVendorRfpContact({ vendorOrganizationId, contactName: " Pat Lee ", contactEmail: "Pat@Northwind.example", correlationId, idempotencyKey });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("mmhr_set_vendor_rfp_contact", {
      payload: { vendorOrganizationId, contactName: "Pat Lee", contactEmail: "pat@northwind.example" },
      correlation_id: correlationId, idempotency_key: idempotencyKey,
    });
  });

  test("refuses a bad email before any database call", async () => {
    await expect(setVendorRfpContact({ vendorOrganizationId, contactName: "Pat", contactEmail: "pat", correlationId, idempotencyKey }))
      .rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(rpc).not.toHaveBeenCalled();
  });

  test("returns contacts keyed by vendor", async () => {
    rpc.mockResolvedValue({ data: { items: [{ vendorOrganizationId, contactName: "Pat Lee", contactEmail: "pat@northwind.example" }] }, error: null });
    expect((await getVendorRfpContacts()).get(vendorOrganizationId)?.contactName).toBe("Pat Lee");
  });
});

describe("sending the RFP form", () => {
  test("saves only the token hash, emails the link, and logs the send", async () => {
    rpc.mockResolvedValueOnce({ data: prepared, error: null }).mockResolvedValueOnce({ data: recorded, error: null });
    await expect(sendRfpVendorForm(sendInput, {}, dependencies)).resolves.toEqual({ outcome: "sent", formId });

    const token = rfpFormToken(recipientId, linkSecret)!;
    const [name, args] = rpc.mock.calls[0]!;
    expect(name).toBe("mmhr_prepare_rfp_vendor_form");
    expect(args).toMatchObject({ payload: { organizationId, recipientId, tokenHash: rfpFormTokenHash(token), libraryVersion: 1,
      tabKeys: ["core", "payroll"], clientOverview, dueAt }, correlation_id: correlationId, idempotency_key: idempotencyKey });
    // The token itself must never reach the database.
    expect(JSON.stringify(rpc.mock.calls)).not.toContain(token);

    const email = sendEmail.mock.calls[0]![0];
    expect(email.to).toBe("pat@northwind.example");
    expect(email.text).toContain(`${baseUrl}/rfp/${token}`);
    expect(email.idempotencyKey).toBe(`rfp-form-${formId}-${idempotencyKey}`);
    expect(rpc.mock.calls[1]![0]).toBe("mmhr_record_rfp_vendor_form_event");
    expect(rpc.mock.calls[1]![1].payload).toEqual({ formId, kind: "email_sent", providerMessageId: "email_1" });
  });

  test.each([
    ["not_configured", "email_not_configured"], ["rejected", "email_rejected"], ["unavailable", "email_unavailable"],
  ] as const)("logs a failed email (%s) and does not mark the form as sent", async (reason, outcome) => {
    rpc.mockResolvedValueOnce({ data: prepared, error: null }).mockResolvedValueOnce({ data: { ...recorded, state: "prepared" }, error: null });
    sendEmail.mockResolvedValue({ ok: false, reason });
    await expect(sendRfpVendorForm(sendInput, {}, dependencies)).resolves.toEqual({ outcome, formId });
    expect(rpc.mock.calls[1]![1].payload).toMatchObject({ formId, kind: "email_failed" });
  });

  test.each(["contact_missing", "closed"] as const)("stops without an email when the database answers %s", async (outcomeCode) => {
    rpc.mockResolvedValue({ data: { outcomeCode, correlationId }, error: null });
    await expect(sendRfpVendorForm(sendInput, {}, dependencies)).resolves.toEqual({ outcome: outcomeCode, formId: null });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledOnce();
  });

  test("stops before the database when no link secret is set", async () => {
    await expect(sendRfpVendorForm(sendInput, {}, { ...dependencies, linkSecret: "short" })).resolves.toEqual({ outcome: "links_not_configured", formId: null });
    expect(rpc).not.toHaveBeenCalled();
  });

  test.each([
    [{ ...sendInput, tabKeys: [] }], [{ ...sendInput, tabKeys: ["made_up"] }],
    [{ ...sendInput, clientOverview: { ...clientOverview, companyName: "" } }], [{ ...sendInput, dueAt: "next week" }],
  ])("refuses bad input %#", async (input) => {
    await expect(sendRfpVendorForm(input, {}, dependencies)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("follow-up email", () => {
  test("sends the same link and logs the follow-up with the staff note", async () => {
    rpc.mockResolvedValueOnce({ data: detail, error: null }).mockResolvedValueOnce({ data: recorded, error: null });
    await expect(sendRfpVendorFormFollowUp({ formId, note: "Any questions?", correlationId, idempotencyKey }, {}, dependencies))
      .resolves.toEqual({ outcome: "sent" });
    const email = sendEmail.mock.calls[0]![0];
    expect(email.subject.startsWith("Reminder: ")).toBe(true);
    expect(email.text).toContain(`${baseUrl}/rfp/${rfpFormToken(recipientId, linkSecret)}`);
    expect(rpc.mock.calls[1]![1].payload).toEqual({ formId, kind: "follow_up_email", note: "Any questions?", providerMessageId: "email_1" });
  });

  test("sends nothing for a form that is no longer waiting on the vendor", async () => {
    rpc.mockResolvedValue({ data: { ...detail, state: "submitted" }, error: null });
    await expect(sendRfpVendorFormFollowUp({ formId, correlationId, idempotencyKey }, {}, dependencies)).resolves.toEqual({ outcome: "closed" });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  test("logs nothing when the email fails", async () => {
    rpc.mockResolvedValue({ data: detail, error: null });
    sendEmail.mockResolvedValue({ ok: false, reason: "unavailable" });
    await expect(sendRfpVendorFormFollowUp({ formId, correlationId, idempotencyKey }, {}, dependencies)).resolves.toEqual({ outcome: "email_unavailable" });
    expect(rpc).toHaveBeenCalledOnce();
  });
});

describe("tracking log and files", () => {
  test("records a reply with its date and leaves out empty fields", async () => {
    rpc.mockResolvedValue({ data: { ...recorded, state: "replied" }, error: null });
    await recordRfpFormEvent({ formId, kind: "reply_recorded", note: "", occurredAt: "2026-11-20T12:00:00.000Z", correlationId, idempotencyKey });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("mmhr_record_rfp_vendor_form_event", {
      payload: { formId, kind: "reply_recorded", occurredAt: "2026-11-20T12:00:00.000Z" },
      correlation_id: correlationId, idempotency_key: idempotencyKey,
    });
  });

  test("staff cannot record the email kinds by hand", async () => {
    await expect(recordRfpFormEvent({ formId, kind: "email_sent" as never, correlationId, idempotencyKey })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(rpc).not.toHaveBeenCalled();
  });

  test("returns an uploaded file as bytes", async () => {
    const fileId = "88888888-8888-4888-8888-888888888888";
    rpc.mockResolvedValue({ data: { fileId, fileName: "plan.pdf", contentType: "application/pdf", byteSize: 4,
      contentBase64: Buffer.from("%PDF").toString("base64"), correlationId }, error: null });
    const file = await getRfpVendorFormFile(fileId);
    expect(file).toMatchObject({ fileName: "plan.pdf", contentType: "application/pdf" });
    expect(file.bytes.toString()).toBe("%PDF");
  });

  test("rejects an unexpected database answer", async () => {
    rpc.mockResolvedValue({ data: { ...recorded, extra: true }, error: null });
    await expect(recordRfpFormEvent({ formId, kind: "declined", correlationId, idempotencyKey })).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
});
