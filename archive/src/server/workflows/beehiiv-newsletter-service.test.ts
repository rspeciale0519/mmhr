import { afterEach, describe, expect, test, vi } from "vitest";

import { NewsletterServiceError } from "./newsletter-contract";
import { beehiivNewsletterService } from "./beehiiv-newsletter-service";

const request = {
  email: "alex@example.com",
  consentAt: "2026-08-30T12:00:00.000Z",
  idempotencyKey: "55555555-5555-4555-8555-555555555555",
} as const;

describe("Beehiiv newsletter service", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  test("fails closed when configuration is incomplete", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("BEEHIIV_PUBLICATION_ID", "pub_00000000-0000-0000-0000-000000000000");

    await expect(beehiivNewsletterService.addOrUpdateSubscriber(request))
      .rejects.toMatchObject({ name: NewsletterServiceError.name, code: "UNAVAILABLE" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("sends only the consented email through the documented subscription endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: { id: "sub_00000000-0000-0000-0000-000000000000" },
    }), { status: 201, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("BEEHIIV_API_KEY", "test-api-key");
    vi.stubEnv("BEEHIIV_PUBLICATION_ID", "pub_00000000-0000-0000-0000-000000000000");

    await expect(beehiivNewsletterService.addOrUpdateSubscriber(request)).resolves.toMatchObject({ outcome: "created" });
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      "https://api.beehiiv.com/v2/publications/pub_00000000-0000-0000-0000-000000000000/subscriptions",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer test-api-key",
          "Content-Type": "application/json",
        },
      }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string) as Record<string, unknown>;
    expect(body).toEqual({
      email: request.email,
      reactivate_existing: false,
      send_welcome_email: false,
      utm_source: "mmhr",
    });
  });

  test("maps duplicate subscriptions to a replay without exposing provider details", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 409 })));
    vi.stubEnv("BEEHIIV_API_KEY", "test-api-key");
    vi.stubEnv("BEEHIIV_PUBLICATION_ID", "pub_00000000-0000-0000-0000-000000000000");

    await expect(beehiivNewsletterService.addOrUpdateSubscriber(request)).resolves.toMatchObject({ outcome: "replayed" });
  });

  test.each([
    ["provider status", new Response(null, { status: 503 })],
    ["malformed response", new Response(JSON.stringify({ data: {} }), { status: 200 })],
  ])("fails closed for %s", async (_, response) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    vi.stubEnv("BEEHIIV_API_KEY", "test-api-key");
    vi.stubEnv("BEEHIIV_PUBLICATION_ID", "pub_00000000-0000-0000-0000-000000000000");

    await expect(beehiivNewsletterService.addOrUpdateSubscriber(request))
      .rejects.toMatchObject({ name: NewsletterServiceError.name });
  });

  test("maps transport errors to a generic unavailable result", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("private provider detail")));
    vi.stubEnv("BEEHIIV_API_KEY", "test-api-key");
    vi.stubEnv("BEEHIIV_PUBLICATION_ID", "pub_00000000-0000-0000-0000-000000000000");

    await expect(beehiivNewsletterService.addOrUpdateSubscriber(request))
      .rejects.toMatchObject({ name: NewsletterServiceError.name, code: "UNAVAILABLE" });
  });
});
