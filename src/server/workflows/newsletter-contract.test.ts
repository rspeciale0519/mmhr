import { describe, expect, test, vi } from "vitest";

import {
  newsletterRegistrationInputSchema,
  registerNewsletterSubscriber,
  NewsletterServiceError,
} from "./newsletter-contract";

const input = {
  email: "  Alex@Example.COM ",
  consentAt: "2026-08-30T12:00:00.000Z",
  idempotencyKey: "55555555-5555-4555-8555-555555555555",
};

describe("newsletter registration contract", () => {
  test("normalizes the email and idempotency key", () => {
    expect(newsletterRegistrationInputSchema.parse(input)).toEqual({
      email: "alex@example.com",
      consentAt: "2026-08-30T12:00:00.000Z",
      idempotencyKey: input.idempotencyKey,
    });
  });

  test.each([
    ["missing email", { ...input, email: undefined }],
    ["missing consent timestamp", { ...input, consentAt: undefined }],
    ["future consent timestamp", { ...input, consentAt: "2099-01-01T00:00:00.000Z" }],
    ["missing idempotency key", { ...input, idempotencyKey: undefined }],
    ["unsupported field", { ...input, source: "footer" }],
  ])("rejects %s", (_, value) => {
    expect(newsletterRegistrationInputSchema.safeParse(value).success).toBe(false);
  });

  test("passes only normalized data to the provider-neutral service", async () => {
    const service = { addOrUpdateSubscriber: vi.fn().mockResolvedValue({
      outcome: "created",
      correlationId: "22222222-2222-4222-8222-222222222222",
    }) };
    await registerNewsletterSubscriber(input, { service });
    expect(service.addOrUpdateSubscriber).toHaveBeenCalledExactlyOnceWith({
      email: "alex@example.com",
      consentAt: "2026-08-30T12:00:00.000Z",
      idempotencyKey: input.idempotencyKey,
    });
  });

  test("fails closed without invoking an external provider by default", async () => {
    await expect(registerNewsletterSubscriber(input))
      .rejects.toMatchObject({ name: NewsletterServiceError.name, code: "UNAVAILABLE" });
  });
});
