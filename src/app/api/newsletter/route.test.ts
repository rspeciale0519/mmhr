import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const { registerNewsletterSubscriber } = vi.hoisted(() => ({ registerNewsletterSubscriber: vi.fn() }));
vi.mock("@/server/workflows/newsletter-contract", async () => {
  const actual = await vi.importActual<typeof import("@/server/workflows/newsletter-contract")>(
    "@/server/workflows/newsletter-contract",
  );
  return { ...actual, registerNewsletterSubscriber };
});

import { NewsletterServiceError } from "@/server/workflows/newsletter-contract";
import { POST } from "./route";

const payload = {
  email: "alex@example.com",
  consentAt: "2026-08-30T12:00:00.000Z",
  idempotencyKey: "55555555-5555-4555-8555-555555555555",
};

function request(body: unknown, origin?: string) {
  const headers = new Headers({ "content-type": "application/json" });
  if (origin !== undefined) headers.set("origin", origin);
  return new Request("http://localhost:3000/api/newsletter", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("public newsletter route boundary", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
    registerNewsletterSubscriber.mockReset();
    registerNewsletterSubscriber.mockResolvedValue({
      outcome: "created",
      correlationId: "22222222-2222-4222-8222-222222222222",
    });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  test.each([undefined, "https://evil.example", "http://localhost:3000/path"])(
    "rejects a non-exact origin: %s",
    async (origin) => {
      const response = await POST(request(payload, origin));
      expect(response.status).toBe(403);
      expect(registerNewsletterSubscriber).not.toHaveBeenCalled();
    },
  );

  test("accepts the configured origin with one trailing slash", async () => {
    const response = await POST(request(payload, "http://localhost:3000/"));
    expect(response.status).toBe(200);
    expect(registerNewsletterSubscriber).toHaveBeenCalledExactlyOnceWith(payload);
  });

  test("returns a redacted acceptance response", async () => {
    const response = await POST(request(payload, "http://localhost:3000"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ accepted: true });
    expect(registerNewsletterSubscriber).toHaveBeenCalledExactlyOnceWith(payload);
  });

  test("maps invalid input and unavailable service errors safely", async () => {
    registerNewsletterSubscriber.mockRejectedValueOnce(new NewsletterServiceError("INVALID_INPUT"));
    expect((await POST(request(payload, "http://localhost:3000"))).status).toBe(400);
    registerNewsletterSubscriber.mockRejectedValueOnce(new Error("private provider detail"));
    const response = await POST(request(payload, "http://localhost:3000"));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "unavailable" });
  });

  test("keeps answering 503 without calling Resend while the newsletter is not configured", async () => {
    // Run the real contract and Resend service, with the settings left empty.
    const actual = await vi.importActual<typeof import("@/server/workflows/newsletter-contract")>(
      "@/server/workflows/newsletter-contract",
    );
    registerNewsletterSubscriber.mockImplementationOnce(actual.registerNewsletterSubscriber);
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("RESEND_NEWSLETTER_SEGMENT_ID", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(request(payload, "http://localhost:3000"));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "unavailable" });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
