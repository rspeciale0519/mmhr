import { describe, expect, test } from "vitest";

import { renewalSchema, transitionRenewal } from "./renewal-contract";

const renewalId = "00000000-0000-4000-8000-000000000101";
const organizationId = "00000000-0000-4000-8000-000000000102";
const contractId = "00000000-0000-4000-8000-000000000103";
const ownerId = "00000000-0000-4000-8000-000000000104";
const dealId = "00000000-0000-4000-8000-000000000105";
const approvalId = "00000000-0000-4000-8000-000000000106";
const correlationId = "00000000-0000-4000-8000-000000000107";

function renewal(overrides: Record<string, unknown> = {}) {
  return {
    renewalId,
    organizationId,
    contractId,
    ownerIdentityId: ownerId,
    contractStartAt: "2026-01-01T00:00:00.000Z",
    contractEndAt: "2026-12-31T00:00:00.000Z",
    renewalWindowStartAt: "2026-09-01T00:00:00.000Z",
    renewalWindowEndAt: "2026-12-31T00:00:00.000Z",
    linkedFollowOnDealId: dealId,
    nextActionAt: "2026-09-15T00:00:00.000Z",
    status: "upcoming",
    revision: 1,
    ...overrides,
  };
}

function transition(overrides: Record<string, unknown> = {}) {
  return {
    renewalId,
    fromStatus: "upcoming",
    toStatus: "in_review",
    expectedRevision: 1,
    actorIdentityId: ownerId,
    occurredAt: "2026-09-01T12:00:00.000Z",
    reason: "Renewal review opened",
    approvalReference: null,
    correlationId,
    ...overrides,
  };
}

describe("R8 renewal and customer-success contract", () => {
  test("requires a valid renewal window inside the contract", () => {
    expect(renewalSchema.safeParse(renewal()).success).toBe(true);
    expect(renewalSchema.safeParse(renewal({ renewalWindowEndAt: "2026-08-01T00:00:00.000Z" })).success).toBe(false);
    expect(renewalSchema.safeParse(renewal({ renewalWindowStartAt: "2027-01-01T00:00:00.000Z" })).success).toBe(false);
  });

  test("requires a linked deal for completed renewal outcomes", () => {
    expect(renewalSchema.safeParse(renewal({ status: "renewed", linkedFollowOnDealId: null, nextActionAt: null })).success).toBe(false);
    expect(renewalSchema.safeParse(renewal({ status: "renewed", nextActionAt: null })).success).toBe(true);
  });

  test("applies an audited revision-checked transition", () => {
    const result = transitionRenewal(renewal(), transition());
    expect(result).toMatchObject({ status: "in_review", revision: 2 });
    expect(Object.isFrozen(result)).toBe(true);
  });

  test("requires approval and a linked deal to close a renewal", () => {
    const review = renewal({ status: "in_review" });
    expect(() => transitionRenewal(review, transition({ fromStatus: "in_review", toStatus: "renewed", approvalReference: null }))).toThrow("approval");
    expect(() => transitionRenewal({ ...review, linkedFollowOnDealId: null }, transition({ fromStatus: "in_review", toStatus: "renewed", approvalReference: approvalId }))).toThrow("linked follow-on");
    expect(transitionRenewal(review, transition({ fromStatus: "in_review", toStatus: "renewed", approvalReference: approvalId, reason: "Signed renewal" }))).toMatchObject({ status: "renewed", revision: 2, nextActionAt: null });
  });

  test("rejects stale, backward, and terminal transitions", () => {
    expect(() => transitionRenewal(renewal(), transition({ expectedRevision: 2 }))).toThrow("stale");
    expect(() => transitionRenewal(renewal(), transition({ toStatus: "upcoming" }))).toThrow("not allowed");
    const closed = renewal({ status: "cancelled", nextActionAt: null });
    expect(() => transitionRenewal(closed, transition({ fromStatus: "cancelled", toStatus: "in_review", expectedRevision: 1 }))).toThrow("not allowed");
  });
});
