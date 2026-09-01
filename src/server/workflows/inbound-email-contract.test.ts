import { describe, expect, test, vi } from "vitest";

import {
  InboundEmailError,
  verifyAndNormalizeInboundEmail,
} from "./inbound-email-contract";

const event = {
  eventId: "11111111-1111-4111-8111-111111111111",
  providerEventId: "provider-event-1",
  organizationId: "22222222-2222-4222-8222-222222222222",
  conversationToken: "conversation:abc",
  senderAddress: "Sender@Example.com",
  recipientAddresses: ["inbound@example.com"],
  subject: "RFP response",
  bodyReference: "blob:message-1",
  attachmentReferences: ["blob:attachment-1"],
  rawBodyHash: "a".repeat(64),
  signedAt: "2026-08-31T12:00:00.000Z",
  receivedAt: "2026-08-31T12:00:01.000Z",
  signature: "A".repeat(16),
};

const options = {
  verifySignature: vi.fn().mockResolvedValue(true),
  seenProviderEventIds: new Set<string>(),
  now: "2026-08-31T12:05:00.000Z",
};

describe("inbound email contract", () => {
  test("normalizes verified addresses and preserves references only", async () => {
    const result = await verifyAndNormalizeInboundEmail(event, options);
    expect(result).toMatchObject({
      senderAddress: "sender@example.com",
      recipientAddresses: ["inbound@example.com"],
      bodyReference: "blob:message-1",
    });
    expect(result).not.toHaveProperty("body");
    expect(Object.isFrozen(result)).toBe(true);
  });

  test("rejects malformed events before signature verification", async () => {
    const verify = vi.fn().mockResolvedValue(true);
    await expect(verifyAndNormalizeInboundEmail({ ...event, body: "private content" }, {
      ...options,
      verifySignature: verify,
    })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(verify).not.toHaveBeenCalled();
  });

  test("rejects invalid signatures and stale signed timestamps", async () => {
    await expect(verifyAndNormalizeInboundEmail(event, {
      ...options,
      verifySignature: vi.fn().mockResolvedValue(false),
    })).rejects.toBeInstanceOf(InboundEmailError);
    await expect(verifyAndNormalizeInboundEmail({ ...event, signedAt: "2026-08-31T11:00:00.000Z" }, options))
      .rejects.toMatchObject({ code: "STALE_EVENT" });
  });

  test("rejects replayed provider events", async () => {
    const verifySignature = vi.fn().mockResolvedValue(true);
    await expect(verifyAndNormalizeInboundEmail(event, {
      ...options,
      verifySignature,
      seenProviderEventIds: new Set([event.providerEventId]),
    })).rejects.toMatchObject({ code: "REPLAY" });
    expect(verifySignature).not.toHaveBeenCalled();
  });
});
