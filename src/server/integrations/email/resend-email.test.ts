import { describe, expect, test, vi } from "vitest";

// "server-only" blocks browser imports; tests run in Node, so stub it out.
vi.mock("server-only", () => ({}));

import { sendResendEmail, type ResendConfig, type ResendEmail } from "./resend-email";

// Made-up values. No real key or address appears in tests.
const config: ResendConfig = { apiKey: "synthetic-key", from: "MMHR <rfp@example.test>", replyTo: "replies@example.test" };
const email: ResendEmail = {
  to: "vendor@example.test",
  subject: "Request for proposal",
  html: "<p>Hello</p>",
  text: "Hello",
  idempotencyKey: "9f4ef26b-cdfd-44c0-9849-4ce87af223a9",
};

/** Builds a fake `fetch` that answers with the given status and JSON body. */
function fakeFetch(status: number, body: unknown) {
  return vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(body), { status }));
}

describe("sendResendEmail", () => {
  test("posts the email to Resend and returns the message id", async () => {
    const fetchImplementation = fakeFetch(200, { id: "msg_123" });
    expect(await sendResendEmail(email, config, fetchImplementation)).toEqual({ ok: true, providerMessageId: "msg_123" });

    const [url, init] = fetchImplementation.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    const headers = new Headers(init?.headers);
    expect(headers.get("Authorization")).toBe("Bearer synthetic-key");
    expect(headers.get("Idempotency-Key")).toBe(email.idempotencyKey);
    expect(JSON.parse(String(init?.body))).toEqual({
      from: config.from, to: [email.to], subject: email.subject, html: email.html, text: email.text, reply_to: config.replyTo,
    });
  });

  test("leaves out the reply address when none is configured", async () => {
    const fetchImplementation = fakeFetch(200, { id: "msg_123" });
    await sendResendEmail(email, { ...config, replyTo: undefined }, fetchImplementation);
    expect(JSON.parse(String(fetchImplementation.mock.calls[0][1]?.body))).not.toHaveProperty("reply_to");
  });

  test.each([{ ...config, apiKey: undefined }, { ...config, from: "" }])("does not call Resend when not configured %#", async (bad) => {
    const fetchImplementation = fakeFetch(200, { id: "msg_123" });
    expect(await sendResendEmail(email, bad, fetchImplementation)).toEqual({ ok: false, reason: "not_configured" });
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  test.each([[422, "rejected"], [403, "rejected"], [500, "unavailable"]] as const)("maps status %i to %s", async (status, reason) => {
    expect(await sendResendEmail(email, config, fakeFetch(status, {}))).toEqual({ ok: false, reason });
  });

  test("reports unavailable when the answer has no id or the network fails", async () => {
    expect(await sendResendEmail(email, config, fakeFetch(200, {}))).toEqual({ ok: false, reason: "unavailable" });
    const failing = vi.fn<typeof fetch>().mockRejectedValue(new Error("offline"));
    expect(await sendResendEmail(email, config, failing)).toEqual({ ok: false, reason: "unavailable" });
  });
});
