import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { NewsletterServiceError } from "./newsletter-contract";
import {
  getConfiguredNewsletterService,
  isNewsletterConfigured,
  resendNewsletterService,
} from "./resend-newsletter-service";

// Every test replaces `fetch` with a fake, so no request ever reaches Resend.

const segmentId = "78261eea-8f8b-4381-83c6-79fa7120f1cf";
const request = {
  email: "alex@example.com",
  consentAt: "2026-08-30T12:00:00.000Z",
  idempotencyKey: "55555555-5555-4555-8555-555555555555",
} as const;
const consentProperties = { consent_at: request.consentAt, consent_source: "website footer" };

const fetchMock = vi.fn<typeof fetch>();

function configure() {
  vi.stubEnv("RESEND_API_KEY", "re_test_key");
  vi.stubEnv("RESEND_NEWSLETTER_SEGMENT_ID", segmentId);
}

/** The URL, method, and parsed JSON body of the fake fetch's nth call. */
function call(index: number) {
  const [url, init] = fetchMock.mock.calls[index]!;
  return {
    url: String(url),
    method: init?.method,
    body: init?.body ? (JSON.parse(String(init.body)) as unknown) : undefined,
    headers: init?.headers,
  };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  // Start every test unconfigured, whatever the machine's environment holds.
  vi.stubEnv("RESEND_API_KEY", "");
  vi.stubEnv("RESEND_NEWSLETTER_SEGMENT_ID", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("newsletter configuration gate", () => {
  test("is true only when both the key and a segment id are set", () => {
    expect(isNewsletterConfigured()).toBe(false);
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    expect(isNewsletterConfigured()).toBe(false);
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("RESEND_NEWSLETTER_SEGMENT_ID", segmentId);
    expect(isNewsletterConfigured()).toBe(false);
    configure();
    expect(isNewsletterConfigured()).toBe(true);
  });

  test("rejects a segment id that is not a Resend id", () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("RESEND_NEWSLETTER_SEGMENT_ID", "../emails");
    expect(isNewsletterConfigured()).toBe(false);
  });

  test("the public route uses the Resend service", () => {
    expect(getConfiguredNewsletterService()).toBe(resendNewsletterService);
  });
});

describe("Resend newsletter service", () => {
  test("fails closed without calling Resend when unconfigured", async () => {
    await expect(resendNewsletterService.addOrUpdateSubscriber(request))
      .rejects.toMatchObject({ name: NewsletterServiceError.name, code: "UNAVAILABLE" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("creates the contact in the newsletter segment with the consent record", async () => {
    configure();
    fetchMock.mockResolvedValue(Response.json({ object: "contact", id: "479e3145-dd38-476b-932c-529ceb705947" }));

    await expect(resendNewsletterService.addOrUpdateSubscriber(request))
      .resolves.toMatchObject({ outcome: "created" });
    expect(fetchMock).toHaveBeenCalledOnce();
    const created = call(0);
    expect(created.url).toBe("https://api.resend.com/contacts");
    expect(created.method).toBe("POST");
    expect(created.headers).toEqual({ Authorization: "Bearer re_test_key", "Content-Type": "application/json" });
    // Only the email, the consent record, and the segment. `unsubscribed` is
    // left out so an earlier unsubscribe is never undone.
    expect(created.body).toEqual({
      email: request.email,
      properties: consentProperties,
      segments: [{ id: segmentId }],
    });
  });

  test("treats an already-subscribed email as success", async () => {
    configure();
    fetchMock
      .mockResolvedValueOnce(Response.json({ name: "validation_error", message: "Contact already exists" }, { status: 422 }))
      .mockResolvedValueOnce(Response.json({ object: "contact", id: "479e3145-dd38-476b-932c-529ceb705947" }))
      .mockResolvedValueOnce(Response.json({ id: segmentId }));

    await expect(resendNewsletterService.addOrUpdateSubscriber(request))
      .resolves.toMatchObject({ outcome: "replayed" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    // The existing contact gets the new consent record, without a subscription change.
    expect(call(1)).toMatchObject({
      url: "https://api.resend.com/contacts/alex%40example.com",
      method: "PATCH",
      body: { properties: consentProperties },
    });
    expect(call(2)).toMatchObject({
      url: `https://api.resend.com/contacts/alex%40example.com/segments/${segmentId}`,
      method: "POST",
    });
  });

  test("treats a contact already in the segment as success", async () => {
    configure();
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 409 }))
      .mockResolvedValueOnce(Response.json({ object: "contact", id: "479e3145-dd38-476b-932c-529ceb705947" }))
      .mockResolvedValueOnce(new Response(null, { status: 409 }));

    await expect(resendNewsletterService.addOrUpdateSubscriber(request))
      .resolves.toMatchObject({ outcome: "replayed" });
  });

  test.each([
    ["an auth failure", [401]],
    ["a rate limit", [429]],
    ["a server error", [500]],
    ["an invalid request whose follow-up also fails", [422, 422]],
    ["a failed segment add", [409, 200, 500]],
  ])("fails closed for %s", async (_, statuses) => {
    configure();
    for (const status of statuses) {
      fetchMock.mockResolvedValueOnce(Response.json({ message: "private provider detail" }, { status }));
    }
    const failure = resendNewsletterService.addOrUpdateSubscriber(request);
    await expect(failure).rejects.toMatchObject({ name: NewsletterServiceError.name, code: "UNAVAILABLE" });
    // The thrown error carries no provider text.
    await expect(failure).rejects.not.toHaveProperty("message", expect.stringContaining("private"));
  });

  test("rejects a success answer without a contact id", async () => {
    configure();
    fetchMock.mockResolvedValue(Response.json({ object: "contact" }));
    await expect(resendNewsletterService.addOrUpdateSubscriber(request))
      .rejects.toMatchObject({ name: NewsletterServiceError.name, code: "INVALID_RESPONSE" });
  });

  test("maps a network error to a generic unavailable error", async () => {
    configure();
    fetchMock.mockRejectedValue(new Error("private provider detail"));
    await expect(resendNewsletterService.addOrUpdateSubscriber(request))
      .rejects.toMatchObject({ name: NewsletterServiceError.name, code: "UNAVAILABLE", message: "Newsletter service is unavailable" });
  });
});
