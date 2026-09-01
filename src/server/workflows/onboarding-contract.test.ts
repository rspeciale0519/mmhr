import { describe, expect, test } from "vitest";

import { onboardingSchema, transitionOnboarding } from "./onboarding-contract";

const onboardingId = "00000000-0000-4000-8000-000000000201";
const organizationId = "00000000-0000-4000-8000-000000000202";
const dealId = "00000000-0000-4000-8000-000000000203";
const ownerId = "00000000-0000-4000-8000-000000000204";
const milestoneId = "00000000-0000-4000-8000-000000000205";
const approvalId = "00000000-0000-4000-8000-000000000206";
const correlationId = "00000000-0000-4000-8000-000000000207";

function onboarding(overrides: Record<string, unknown> = {}) {
  return {
    onboardingId,
    organizationId,
    dealId,
    ownerIdentityId: ownerId,
    targetGoLiveAt: "2026-12-01T00:00:00.000Z",
    status: "planned",
    revision: 1,
    milestones: [{ milestoneId, title: "Configure workspace", ownerIdentityId: ownerId, dueAt: "2026-11-01T00:00:00.000Z", status: "pending", completedAt: null }],
    checkIns: [],
    risks: [],
    failureReason: null,
    reactivatedFromRevision: null,
    ...overrides,
  };
}

function transition(overrides: Record<string, unknown> = {}) {
  return {
    onboardingId,
    fromStatus: "planned",
    toStatus: "active",
    expectedRevision: 1,
    actorIdentityId: ownerId,
    occurredAt: "2026-09-01T12:00:00.000Z",
    reason: "Kickoff complete",
    failureReason: null,
    approvalReference: null,
    correlationId,
    ...overrides,
  };
}

describe("R8 onboarding contract", () => {
  test("validates milestones, check-ins, and risks", () => {
    expect(onboardingSchema.safeParse(onboarding()).success).toBe(true);
    expect(onboardingSchema.safeParse(onboarding({ risks: [{ riskId: milestoneId, severity: "high", description: "Blocked data", status: "open", raisedAt: "2026-09-01T00:00:00.000Z", resolvedAt: "2026-09-02T00:00:00.000Z" }] })).success).toBe(false);
  });

  test("rejects duplicate milestone identifiers", () => {
    expect(onboardingSchema.safeParse(onboarding({ milestones: [onboarding().milestones[0], onboarding().milestones[0]] })).success).toBe(false);
  });

  test("applies a revision-checked active transition", () => {
    const result = transitionOnboarding(onboarding(), transition());
    expect(result).toMatchObject({ status: "active", revision: 2 });
    expect(Object.isFrozen(result)).toBe(true);
  });

  test("records visible failure reasons", () => {
    const result = transitionOnboarding(onboarding({ status: "active" }), transition({ fromStatus: "active", toStatus: "failed", failureReason: "Vendor import failed" }));
    expect(result).toMatchObject({ status: "failed", failureReason: "Vendor import failed" });
    expect(() => transitionOnboarding(onboarding({ status: "active" }), transition({ fromStatus: "active", toStatus: "failed" }))).toThrow("failure reason");
  });

  test("requires approval and preserves failed history on reactivation", () => {
    const failed = onboarding({ status: "failed", failureReason: "Prior rollout failed" });
    expect(() => transitionOnboarding(failed, transition({ fromStatus: "failed", toStatus: "reactivated" }))).toThrow("approval");
    const result = transitionOnboarding(failed, transition({ fromStatus: "failed", toStatus: "reactivated", approvalReference: approvalId }));
    expect(result).toMatchObject({ status: "reactivated", revision: 2, reactivatedFromRevision: 1, failureReason: "Prior rollout failed" });
    const active = transitionOnboarding(result, transition({ fromStatus: "reactivated", toStatus: "active", expectedRevision: 2 }));
    expect(onboardingSchema.safeParse(active).success).toBe(true);
    expect(active).toMatchObject({ status: "active", failureReason: null, reactivatedFromRevision: null });
  });

  test("blocks completion with unfinished milestones and terminal reopening", () => {
    const completed = onboarding({ status: "active", milestones: [{ ...onboarding().milestones[0], status: "completed", completedAt: "2026-11-01T00:00:00.000Z" }] });
    expect(transitionOnboarding(completed, transition({ fromStatus: "active", toStatus: "completed" }))).toMatchObject({ status: "completed" });
    expect(() => transitionOnboarding(onboarding({ status: "active" }), transition({ fromStatus: "active", toStatus: "completed" }))).toThrow("incomplete");
    expect(() => transitionOnboarding(onboarding({ status: "cancelled" }), transition({ fromStatus: "cancelled", toStatus: "active" }))).toThrow("not allowed");
  });
});
