import { beforeEach, describe, expect, test, vi } from "vitest";

import { rfpFormTokenHash } from "@/server/workflows/rfp-vendor-form-link";
import {
  addPublicRfpFile, detectUploadType, readPublicRfpForm, removePublicRfpFile, reopenPublicRfpForm, savePublicRfpAnswers,
  submitPublicRfpForm,
} from "./rfp-vendor-form-public";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

// A token is 43 web-safe characters. The database only ever sees its hash.
const token = "A".repeat(43);
const p_token_hash = rfpFormTokenHash(token);
const fileId = "33333333-3333-4333-8333-333333333333";
const rpc = vi.fn();
const options = { supabase: { rpc } as never };
const form = {
  state: "sent", editable: true, dueAt: "2026-12-03T04:59:59+00:00", submittedAt: null, vendorName: "Northwind",
  rfpTitle: "HRIS RFP", rfpIntroduction: "Intro", clientOverview: { companyName: "Acme" }, tabKeys: ["payroll"],
  libraryVersion: 1, answers: { payroll_01: { answer: "yes", comment: null } }, respondentName: null, respondentEmail: null,
  files: [],
};
const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);

beforeEach(() => rpc.mockReset());

describe("reading the vendor form", () => {
  test("looks the form up by the token hash, never by the token", async () => {
    rpc.mockResolvedValue({ data: form, error: null });
    await expect(readPublicRfpForm(token, options)).resolves.toEqual(form);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("mmhr_vendor_rfp_form_read", { p_token_hash });
    expect(JSON.stringify(rpc.mock.calls)).not.toContain(token);
  });

  test("returns nothing for a malformed token without asking the database", async () => {
    await expect(readPublicRfpForm("not-a-token", options)).resolves.toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });

  test.each([
    [{ data: null, error: null }], [{ data: null, error: { code: "42501" } }],
    [{ data: { ...form, staffNote: "internal" }, error: null }], [{ data: { ...form, state: "prepared" }, error: null }],
  ])("returns nothing for an unknown link or an unexpected answer %#", async (response) => {
    rpc.mockResolvedValue(response);
    await expect(readPublicRfpForm(token, options)).resolves.toBeNull();
  });
});

describe("saving answers", () => {
  test("saves answers for questions on the form and stores an empty comment as none", async () => {
    rpc.mockResolvedValue({ data: { saved: true, state: "sent" }, error: null });
    await expect(savePublicRfpAnswers(token, { payroll_01: { answer: "no", comment: "  " } }, ["payroll"], options))
      .resolves.toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("mmhr_vendor_rfp_form_save",
      { p_token_hash, p_answers: { payroll_01: { answer: "no", comment: null } } });
  });

  test.each([
    [{ core_01: { answer: "yes", comment: null } }], // a question from a tab that is not on this form
    [{ payroll_01: { answer: "maybe", comment: null } }], [{}], ["text"],
  ])("refuses an answer that does not belong on the form %#", async (answers) => {
    await expect(savePublicRfpAnswers(token, answers, ["payroll"], options)).resolves.toEqual({ ok: false, reason: "invalid" });
    expect(rpc).not.toHaveBeenCalled();
  });

  test("reports a locked form and a failed save differently", async () => {
    const answers = { payroll_01: { answer: "yes", comment: null } };
    rpc.mockResolvedValueOnce({ data: { saved: false, state: "submitted" }, error: null });
    await expect(savePublicRfpAnswers(token, answers, ["payroll"], options)).resolves.toEqual({ ok: false, reason: "locked" });
    rpc.mockRejectedValueOnce(new Error("network"));
    await expect(savePublicRfpAnswers(token, answers, ["payroll"], options)).resolves.toEqual({ ok: false, reason: "unavailable" });
  });
});

describe("submitting", () => {
  test("submits with a trimmed name and a lower-case email", async () => {
    rpc.mockResolvedValue({ data: { submitted: true, state: "submitted" }, error: null });
    await expect(submitPublicRfpForm(token, { name: " Pat Lee ", email: "Pat@Northwind.example" }, options)).resolves.toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("mmhr_vendor_rfp_form_submit",
      { p_token_hash, p_name: "Pat Lee", p_email: "pat@northwind.example" });
  });

  test("refuses a missing name or a bad email before any database call", async () => {
    await expect(submitPublicRfpForm(token, { name: "", email: "pat@northwind.example" }, options)).resolves.toEqual({ ok: false, reason: "invalid" });
    await expect(submitPublicRfpForm(token, { name: "Pat", email: "not-an-email" }, options)).resolves.toEqual({ ok: false, reason: "invalid" });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("reopening", () => {
  test("reopens a submitted form by the token hash", async () => {
    rpc.mockResolvedValue({ data: { reopened: true, state: "sent" }, error: null });
    await expect(reopenPublicRfpForm(token, options)).resolves.toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("mmhr_vendor_rfp_form_reopen", { p_token_hash });
  });

  test("reports a form that cannot be reopened as locked", async () => {
    rpc.mockResolvedValue({ data: { reopened: false, state: "declined" }, error: null });
    await expect(reopenPublicRfpForm(token, options)).resolves.toEqual({ ok: false, reason: "locked" });
  });

  test("refuses a malformed link before any database call and reports a failed call", async () => {
    await expect(reopenPublicRfpForm("short", options)).resolves.toEqual({ ok: false, reason: "invalid" });
    expect(rpc).not.toHaveBeenCalled();
    rpc.mockResolvedValue({ data: null, error: { message: "down" } });
    await expect(reopenPublicRfpForm(token, options)).resolves.toEqual({ ok: false, reason: "unavailable" });
  });
});

describe("files", () => {
  test("accepts a file only when its first bytes match its extension", () => {
    expect(detectUploadType("plan.pdf", pdf)).toBe("application/pdf");
    expect(detectUploadType("PLAN.PDF", pdf)).toBe("application/pdf");
    // A program renamed to .pdf starts with "MZ", not "%PDF".
    expect(detectUploadType("plan.pdf", new Uint8Array([0x4d, 0x5a, 0x90, 0x00]))).toBeNull();
    expect(detectUploadType("plan.exe", pdf)).toBeNull();
    expect(detectUploadType("sheet.xlsx", new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).not.toBeNull();
    expect(detectUploadType("photo.jpg", new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).not.toBeNull();
  });

  test("stores a file under a cleaned name with the detected type", async () => {
    rpc.mockResolvedValue({ data: { stored: true, fileId }, error: null });
    await expect(addPublicRfpFile(token, { documentKey: "contract_sample", fileName: "C:\\docs\\our plan.pdf", bytes: pdf }, options))
      .resolves.toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("mmhr_vendor_rfp_form_file_add", {
      p_token_hash, p_document_key: "contract_sample", p_file_name: "our plan.pdf", p_content_type: "application/pdf",
      p_content_base64: Buffer.from(pdf).toString("base64"),
    });
  });

  test("refuses an unknown document slot, an empty file, an oversized file, and a wrong type", async () => {
    const big = new Uint8Array(4 * 1024 * 1024 + 1); big.set(pdf);
    for (const input of [
      { documentKey: "made_up", fileName: "a.pdf", bytes: pdf }, { documentKey: "other", fileName: "a.pdf", bytes: new Uint8Array() },
      { documentKey: "other", fileName: "a.pdf", bytes: big }, { documentKey: "other", fileName: "a.txt", bytes: pdf },
    ]) await expect(addPublicRfpFile(token, input, options)).resolves.toEqual({ ok: false, reason: "invalid" });
    expect(rpc).not.toHaveBeenCalled();
  });

  test("reports the file limit and a locked form", async () => {
    const input = { documentKey: "other", fileName: "a.pdf", bytes: pdf };
    rpc.mockResolvedValueOnce({ data: { stored: false, reason: "too_many" }, error: null });
    await expect(addPublicRfpFile(token, input, options)).resolves.toEqual({ ok: false, reason: "too_many" });
    rpc.mockResolvedValueOnce({ data: { stored: false, reason: "locked" }, error: null });
    await expect(addPublicRfpFile(token, input, options)).resolves.toEqual({ ok: false, reason: "locked" });
  });

  test("removes a file by id and refuses a malformed id", async () => {
    rpc.mockResolvedValue({ data: { removed: true }, error: null });
    await expect(removePublicRfpFile(token, fileId, options)).resolves.toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("mmhr_vendor_rfp_form_file_remove", { p_token_hash, p_file_id: fileId });
    await expect(removePublicRfpFile(token, "1", options)).resolves.toEqual({ ok: false, reason: "invalid" });
  });
});
