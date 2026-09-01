import { describe, expect, test } from "vitest";

import { summarizeCustomerJourney } from "./customer-journey-contract";

const organizationId = "00000000-0000-4000-8000-000000000601";
const vendorId = "00000000-0000-4000-8000-000000000602";
const ownerId = "00000000-0000-4000-8000-000000000603";
const dealId = "00000000-0000-4000-8000-000000000604";
const contractId = "00000000-0000-4000-8000-000000000605";

const onboarding = {
  onboardingId: "00000000-0000-4000-8000-000000000606", organizationId, dealId, ownerIdentityId: ownerId,
  targetGoLiveAt: "2026-12-01T00:00:00.000Z", status: "at_risk", revision: 1,
  milestones: [{ milestoneId: "00000000-0000-4000-8000-000000000607", title: "Configure", ownerIdentityId: ownerId, dueAt: "2026-11-01T00:00:00.000Z", status: "in_progress", completedAt: null }],
  checkIns: [], risks: [], failureReason: null, reactivatedFromRevision: null,
};
const renewal = {
  renewalId: "00000000-0000-4000-8000-000000000608", organizationId, contractId, ownerIdentityId: ownerId,
  contractStartAt: "2026-01-01T00:00:00.000Z", contractEndAt: "2026-12-31T00:00:00.000Z", renewalWindowStartAt: "2026-09-01T00:00:00.000Z", renewalWindowEndAt: "2026-12-31T00:00:00.000Z", linkedFollowOnDealId: null, nextActionAt: "2026-09-15T00:00:00.000Z", status: "at_risk", revision: 1,
};
const outcome = {
  outcomeId: "00000000-0000-4000-8000-000000000609", sourceEventId: "00000000-0000-4000-8000-000000000610", customerOrganizationId: organizationId, vendorOrganizationId: vendorId, dealId, onboardingId: onboarding.onboardingId, followOnDealId: null, outcomeType: "customer_satisfied", satisfactionScore: 5, summary: "Good rollout", recordedByIdentityId: ownerId, recordedAt: "2026-12-15T00:00:00.000Z",
};

describe("R8 customer-journey report contract", () => {
  test("reconciles onboarding, renewal, and outcome counts", () => {
    expect(summarizeCustomerJourney({ onboardings: [onboarding], renewals: [renewal], outcomes: [outcome] }, "2026-12-31T00:00:00.000Z")).toEqual({ asOf: "2026-12-31T00:00:00.000Z", organizations: [{ organizationId, onboardingCount: 1, activeOnboardingCount: 1, renewalCount: 1, atRiskRenewalCount: 1, outcomeCount: 1, latestOutcomeType: "customer_satisfied" }] });
  });

  test("sorts organizations deterministically and keeps empty sources", () => {
    const result = summarizeCustomerJourney({ onboardings: [], renewals: [], outcomes: [outcome] }, "2026-12-31T00:00:00.000Z");
    expect(result.organizations).toHaveLength(1);
    expect(Object.isFrozen(result)).toBe(true);
  });

  test("rejects future source events", () => {
    expect(() => summarizeCustomerJourney({ onboardings: [], renewals: [], outcomes: [outcome] }, "2026-12-01T00:00:00.000Z")).toThrow("after report as-of");
  });

  test("rejects duplicate source identifiers and invalid as-of values", () => {
    expect(() => summarizeCustomerJourney({ onboardings: [onboarding, onboarding], renewals: [], outcomes: [] }, "2026-12-31T00:00:00.000Z")).toThrow("Duplicate customer journey onboarding");
    expect(() => summarizeCustomerJourney({ onboardings: [], renewals: [], outcomes: [] }, "not-a-date")).toThrow("Invalid customer journey as-of");
  });

  test("does not merge vendor organization outcomes into customer reports", () => {
    const vendorOutcome = { ...outcome, outcomeId: "00000000-0000-4000-8000-000000000611", sourceEventId: "00000000-0000-4000-8000-000000000612", customerOrganizationId: vendorId, vendorOrganizationId: organizationId };
    const result = summarizeCustomerJourney({ onboardings: [], renewals: [], outcomes: [outcome, vendorOutcome] }, "2026-12-31T00:00:00.000Z");
    expect(result.organizations.map((row) => row.organizationId)).toEqual([organizationId, vendorId]);
    expect(result.organizations.map((row) => row.outcomeCount)).toEqual([1, 1]);
  });
});
