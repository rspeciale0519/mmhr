import { describe, expect, test } from "vitest";

import {
  communicationDeliveryReceiptSchema,
  prepareOutboundCommunication,
} from "./communication-contract";

const input = {
  channel: "email" as const,
  idempotencyKey: "11111111-1111-4111-8111-111111111111",
  correlationId: "22222222-2222-4222-8222-222222222222",
  templateKey: "rfp.invitation",
  subject: "Please review this request",
  body: "The request is ready for your review.",
  recipientIds: ["33333333-3333-4333-8333-333333333333"],
  associations: [{
    organizationId: "44444444-4444-4444-8444-444444444444",
    recordType: "rfp" as const,
    recordId: "55555555-5555-4555-8555-555555555555",
  }],
  consent: "transactional" as const,
};

describe("communication contract", () => {
  test("returns a provider-neutral normalized request", () => {
    const result = prepareOutboundCommunication({ ...input, templateKey: " RFP.INVITATION " });
    expect(result).toMatchObject({ ok: true, request: { templateKey: "rfp.invitation" } });
  });

  test.each(["opted_out", "unknown"] as const)("blocks %s recipients", (consent) => {
    expect(prepareOutboundCommunication({ ...input, consent })).toEqual({ ok: false, code: "consent_required" });
  });

  test("requires an association and rejects unknown provider fields", () => {
    expect(prepareOutboundCommunication({ ...input, associations: [] })).toEqual({ ok: false, code: "invalid_input" });
    expect(prepareOutboundCommunication({ ...input, provider: "provider-specific" })).toEqual({ ok: false, code: "invalid_input" });
  });

  test("validates delivery receipts without requiring a provider name", () => {
    expect(communicationDeliveryReceiptSchema.parse({
      communicationId: input.correlationId,
      providerMessageId: "message-123",
      state: "sent",
      failureCode: null,
      retryable: false,
    })).toMatchObject({ state: "sent", providerMessageId: "message-123" });
  });
});
