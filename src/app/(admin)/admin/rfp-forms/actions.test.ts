import { beforeEach, expect, test, vi } from "vitest";
import { headers } from "next/headers";
import { AuthorizationError } from "@/server/auth/authorization";
import { recordRfpFormEvent, sendRfpVendorForm, sendRfpVendorFormFollowUp } from "@/server/commands/rfp-vendor-forms";
import { sendRfpFormAction, trackRfpFormAction } from "./actions";

vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/commands/rfp-vendor-forms", async (original) => ({
  ...(await original<typeof import("@/server/commands/rfp-vendor-forms")>()),
  recordRfpFormEvent: vi.fn(), sendRfpVendorForm: vi.fn(), sendRfpVendorFormFollowUp: vi.fn(),
}));
vi.mock("server-only", () => ({}));

const organizationId = "11111111-1111-4111-8111-111111111111";
const recipientId = "33333333-3333-4333-8333-333333333333";
const idempotencyKey = "55555555-5555-4555-8555-555555555555";
const formId = "66666666-6666-4666-8666-666666666666";

/** Builds a submitted form. A list value adds the field once per item. */
function form(values: Record<string, string | string[]>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) for (const item of [value].flat()) data.append(key, item);
  return data;
}
const sendForm = () => form({
  organizationId, recipientId, idempotencyKey, "overview.companyName": "Acme", "overview.employeeCount": "250",
  tab: ["core", "payroll"], [`dueDate.${recipientId}`]: "2026-12-02",
});

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
  vi.mocked(headers).mockResolvedValue(new Headers({ origin: "http://localhost:3000" }) as never);
  vi.mocked(sendRfpVendorForm).mockReset().mockResolvedValue({ outcome: "sent", formId });
  vi.mocked(sendRfpVendorFormFollowUp).mockReset().mockResolvedValue({ outcome: "sent" });
  vi.mocked(recordRfpFormEvent).mockReset().mockResolvedValue({ formId, state: "replied", outcomeCode: "recorded", correlationId: idempotencyKey });
});

test("sends to the pressed vendor with the overview, the ticked tabs, and the end of the due day in Eastern time", async () => {
  await expect(sendRfpFormAction(null, sendForm())).resolves.toEqual({ status: "success", message: "Email sent." });
  const input = vi.mocked(sendRfpVendorForm).mock.calls[0]![0];
  expect(input).toMatchObject({ organizationId, recipientId, idempotencyKey, tabKeys: ["core", "payroll"],
    // 2 December is in winter time (UTC-5), so 23:59:59 Eastern is 04:59:59 UTC the next day.
    dueAt: "2026-12-03T04:59:59.000Z" });
  expect(input.clientOverview).toMatchObject({ companyName: "Acme", employeeCount: "250", address: "" });
});

test("uses summer time for a summer due date", async () => {
  const data = sendForm(); data.set(`dueDate.${recipientId}`, "2026-07-01");
  await sendRfpFormAction(null, data);
  expect(vi.mocked(sendRfpVendorForm).mock.calls[0]![0].dueAt).toBe("2026-07-02T03:59:59.000Z");
});

test("asks for a due date and at least one tab before calling the command", async () => {
  const noDate = sendForm(); noDate.delete(`dueDate.${recipientId}`);
  await expect(sendRfpFormAction(null, noDate)).resolves.toMatchObject({ status: "error", message: "Choose a due date for this vendor." });
  const noTabs = sendForm(); noTabs.delete("tab");
  await expect(sendRfpFormAction(null, noTabs)).resolves.toMatchObject({ status: "error", message: "Tick at least one topic tab to include." });
  expect(sendRfpVendorForm).not.toHaveBeenCalled();
});

test("explains a missing contact, an email failure, and a refusal", async () => {
  vi.mocked(sendRfpVendorForm).mockResolvedValueOnce({ outcome: "contact_missing", formId: null });
  await expect(sendRfpFormAction(null, sendForm())).resolves.toMatchObject({ status: "error", message: expect.stringContaining("no RFP contact") });
  vi.mocked(sendRfpVendorForm).mockResolvedValueOnce({ outcome: "email_rejected", formId });
  await expect(sendRfpFormAction(null, sendForm())).resolves.toMatchObject({ status: "error", message: expect.stringContaining("saved but not sent") });
  vi.mocked(sendRfpVendorForm).mockRejectedValueOnce(new AuthorizationError());
  await expect(sendRfpFormAction(null, sendForm())).resolves.toMatchObject({ status: "error", message: expect.stringContaining("refused") });
});

test("rejects a request from another site", async () => {
  vi.mocked(headers).mockResolvedValue(new Headers({ origin: "https://evil.example" }) as never);
  await expect(sendRfpFormAction(null, sendForm())).rejects.toThrow();
  await expect(trackRfpFormAction(null, form({ formId, idempotencyKey, intent: "declined" }))).rejects.toThrow();
  expect(sendRfpVendorForm).not.toHaveBeenCalled();
  expect(recordRfpFormEvent).not.toHaveBeenCalled();
});

test("sends a follow-up email with the optional note", async () => {
  await expect(trackRfpFormAction(null, form({ formId, idempotencyKey, intent: "follow_up_email", note: " Any questions? " })))
    .resolves.toEqual({ status: "success", message: "Follow-up email sent." });
  expect(vi.mocked(sendRfpVendorFormFollowUp).mock.calls[0]![0]).toMatchObject({ formId, idempotencyKey, note: "Any questions?" });
});

test("records a reply with its date and notes", async () => {
  await expect(trackRfpFormAction(null, form({ formId, idempotencyKey, intent: "reply_recorded", occurredOn: "2026-11-20", note: "By phone" })))
    .resolves.toEqual({ status: "success", message: "Saved." });
  expect(vi.mocked(recordRfpFormEvent).mock.calls[0]![0]).toMatchObject({
    formId, idempotencyKey, kind: "reply_recorded", note: "By phone", occurredAt: "2026-11-20T12:00:00.000Z" });
});

test("explains a change that does not fit the form's status, and refuses unknown buttons", async () => {
  vi.mocked(recordRfpFormEvent).mockResolvedValueOnce({ formId, state: "submitted", outcomeCode: "conflict", correlationId: idempotencyKey });
  await expect(trackRfpFormAction(null, form({ formId, idempotencyKey, intent: "reopened" })))
    .resolves.toMatchObject({ status: "error", message: expect.stringContaining("current status") });
  await expect(trackRfpFormAction(null, form({ formId, idempotencyKey, intent: "email_sent" }))).resolves.toMatchObject({ status: "error" });
  expect(recordRfpFormEvent).toHaveBeenCalledOnce();
});
