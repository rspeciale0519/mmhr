import { randomUUID } from "node:crypto";
import { expect, test } from "vitest";
import { portalClarificationCommandSchema } from "./portal-clarification";

const metadata = { organizationId: randomUUID(), correlationId: randomUUID(), idempotencyKey: randomUUID() };
const ask = { ...metadata, action: "ask", recipientId: randomUUID(), normalizationId: randomUUID(),
  question: "Confirm this implementation condition.", deadlineAt: "2030-01-02T00:00:00Z" };
test("keeps staff questions strict and bounds their encoded size", () => {
  expect(portalClarificationCommandSchema.parse(ask)).toEqual(ask);
  expect(portalClarificationCommandSchema.safeParse({ ...ask, actorIdentityId: randomUUID() }).success).toBe(false);
  expect(portalClarificationCommandSchema.safeParse({ ...ask, question: " \t\u00a0" }).success).toBe(false);
  expect(portalClarificationCommandSchema.safeParse({ ...ask, question: "é".repeat(2500) }).success).toBe(true);
  expect(portalClarificationCommandSchema.safeParse({ ...ask, question: "é".repeat(2501) }).success).toBe(false);
  expect(portalClarificationCommandSchema.safeParse({ ...ask, deadlineAt: "tomorrow" }).success).toBe(false);
});
test("requires a vendor answer and an explicit statement about response changes", () => {
  const reply = { ...metadata, action: "reply", clarificationId: randomUUID(), answer: "No setup fee applies.",
    changeSummary: "No response revision is required.", replyNormalizationId: null };
  expect(portalClarificationCommandSchema.parse(reply)).toEqual(reply);
  expect(portalClarificationCommandSchema.safeParse({ ...reply, changeSummary: "" }).success).toBe(false);
  expect(portalClarificationCommandSchema.safeParse({ ...reply, decision: "accepted" }).success).toBe(false);
  expect(portalClarificationCommandSchema.safeParse({ ...reply, replyNormalizationId: "unverified" }).success).toBe(false);
});
test("requires a staff decision and recorded reason", () => {
  const decision = { ...metadata, action: "decide", clarificationId: randomUUID(), decision: "deferred", reason: "The updated conditions need review." };
  expect(portalClarificationCommandSchema.parse(decision)).toEqual(decision);
  expect(portalClarificationCommandSchema.safeParse({ ...decision, reason: "" }).success).toBe(false);
  expect(portalClarificationCommandSchema.safeParse({ ...decision, decision: "approved" }).success).toBe(false);
});
