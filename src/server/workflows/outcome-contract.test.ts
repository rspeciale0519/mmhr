import { describe, expect, test } from "vitest";

import { appendCustomerSuccessOutcome, customerSuccessOutcomeSchema } from "./outcome-contract";

const outcomeId = "00000000-0000-4000-8000-000000000501";
const sourceEventId = "00000000-0000-4000-8000-000000000502";
const customerId = "00000000-0000-4000-8000-000000000503";
const vendorId = "00000000-0000-4000-8000-000000000504";
const dealId = "00000000-0000-4000-8000-000000000505";
const onboardingId = "00000000-0000-4000-8000-000000000506";
const actorId = "00000000-0000-4000-8000-000000000507";
const followOnDealId = "00000000-0000-4000-8000-000000000508";

function outcome(overrides: Record<string, unknown> = {}) {
  return {
    outcomeId,
    sourceEventId,
    customerOrganizationId: customerId,
    vendorOrganizationId: vendorId,
    dealId,
    onboardingId,
    followOnDealId: null,
    outcomeType: "customer_satisfied",
    satisfactionScore: 5,
    summary: "Customer confirmed the rollout outcome",
    recordedByIdentityId: actorId,
    recordedAt: "2026-12-15T00:00:00.000Z",
    ...overrides,
  };
}

describe("R8 customer-success outcome contract", () => {
  test("requires distinct organizations and valid satisfaction scores", () => {
    expect(customerSuccessOutcomeSchema.safeParse(outcome()).success).toBe(true);
    expect(customerSuccessOutcomeSchema.safeParse(outcome({ vendorOrganizationId: customerId })).success).toBe(false);
    expect(customerSuccessOutcomeSchema.safeParse(outcome({ satisfactionScore: null })).success).toBe(false);
  });

  test("requires a follow-on deal for renewal outcomes", () => {
    expect(customerSuccessOutcomeSchema.safeParse(outcome({ outcomeType: "renewed", satisfactionScore: null })).success).toBe(false);
    expect(customerSuccessOutcomeSchema.safeParse(outcome({ outcomeType: "renewed", followOnDealId, satisfactionScore: null })).success).toBe(true);
  });

  test("appends immutable outcomes in deterministic time order", () => {
    const earlier = outcome({ outcomeId: "00000000-0000-4000-8000-000000000509", sourceEventId: "00000000-0000-4000-8000-000000000510", recordedAt: "2026-12-01T00:00:00.000Z" });
    const result = appendCustomerSuccessOutcome([outcome()], earlier);
    expect(result.map((entry) => entry.outcomeId)).toEqual([earlier.outcomeId, outcomeId]);
    expect(Object.isFrozen(result)).toBe(true);
  });

  test("rejects duplicate outcome and source identifiers", () => {
    expect(() => appendCustomerSuccessOutcome([outcome()], outcome({ outcomeId: "00000000-0000-4000-8000-000000000511" }))).toThrow("source event");
    expect(() => appendCustomerSuccessOutcome([outcome()], outcome({ sourceEventId: "00000000-0000-4000-8000-000000000512" }))).toThrow("outcome");
  });

  test("rejects malformed history instead of hiding it", () => {
    expect(() => appendCustomerSuccessOutcome([{ ...outcome(), summary: "" }], outcome({ outcomeId: "00000000-0000-4000-8000-000000000513", sourceEventId: "00000000-0000-4000-8000-000000000514" }))).toThrow();
  });
});
