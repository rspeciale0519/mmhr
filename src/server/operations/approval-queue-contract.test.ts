import { describe, expect, test } from "vitest";

import { approvalRequestSchema, transitionApprovalRequest } from "./approval-queue-contract";

const requestId = "00000000-0000-4000-8000-000000000401";
const organizationId = "00000000-0000-4000-8000-000000000402";
const resourceId = "00000000-0000-4000-8000-000000000403";
const requesterId = "00000000-0000-4000-8000-000000000404";
const reviewerId = "00000000-0000-4000-8000-000000000405";
const correlationId = "00000000-0000-4000-8000-000000000406";

function request(overrides: Record<string, unknown> = {}) {
  return {
    requestId,
    organizationId,
    category: "configuration",
    resourceId,
    requestedByIdentityId: requesterId,
    requestedAt: "2026-09-01T00:00:00.000Z",
    status: "pending",
    reviewedByIdentityId: null,
    reviewedAt: null,
    decisionReason: null,
    revision: 1,
    ...overrides,
  };
}

function transition(overrides: Record<string, unknown> = {}) {
  return {
    requestId,
    fromStatus: "pending",
    toStatus: "approved",
    expectedRevision: 1,
    actorIdentityId: reviewerId,
    occurredAt: "2026-09-01T12:00:00.000Z",
    reason: "Configuration reviewed",
    correlationId,
    ...overrides,
  };
}

describe("R8 approval queue contract", () => {
  test("requires a decision record for closed approvals", () => {
    expect(approvalRequestSchema.safeParse(request()).success).toBe(true);
    expect(approvalRequestSchema.safeParse(request({ status: "approved" })).success).toBe(false);
    expect(approvalRequestSchema.safeParse(request({ status: "approved", reviewedByIdentityId: reviewerId, reviewedAt: "2026-09-01T12:00:00.000Z", decisionReason: "Approved" })).success).toBe(true);
  });

  test("rejects self-review and review timestamps before request", () => {
    expect(approvalRequestSchema.safeParse(request({ status: "rejected", reviewedByIdentityId: requesterId, reviewedAt: "2026-09-01T12:00:00.000Z", decisionReason: "No" })).success).toBe(false);
    expect(approvalRequestSchema.safeParse(request({ status: "rejected", reviewedByIdentityId: reviewerId, reviewedAt: "2026-08-31T23:00:00.000Z", decisionReason: "No" })).success).toBe(false);
  });

  test("applies an audited approval and increments the revision", () => {
    const result = transitionApprovalRequest(request(), transition());
    expect(result).toMatchObject({ status: "approved", revision: 2, reviewedByIdentityId: reviewerId, decisionReason: "Configuration reviewed" });
    expect(Object.isFrozen(result)).toBe(true);
  });

  test("blocks requester approval", () => {
    expect(() => transitionApprovalRequest(request(), transition({ actorIdentityId: requesterId }))).toThrow("own approval");
  });

  test("rejects stale and terminal transitions", () => {
    expect(() => transitionApprovalRequest(request(), transition({ expectedRevision: 2 }))).toThrow("stale");
    const approved = request({ status: "approved", reviewedByIdentityId: reviewerId, reviewedAt: "2026-09-01T12:00:00.000Z", decisionReason: "Approved" });
    expect(() => transitionApprovalRequest(approved, transition({ fromStatus: "approved", toStatus: "pending" }))).toThrow("not allowed");
  });

  test("records expiration as a closed, auditable outcome", () => {
    const expired = transitionApprovalRequest(request(), transition({ toStatus: "expired", reason: "Approval window elapsed", actorIdentityId: reviewerId }));
    expect(expired).toMatchObject({ status: "expired", reviewedByIdentityId: reviewerId, decisionReason: "Approval window elapsed" });
  });
});
