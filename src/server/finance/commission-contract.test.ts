import { describe, expect, test } from "vitest";

import {
  assertOneEventPerContract,
  calculateCommission,
  canFinanciallyCloseCommission,
  commissionStructureSchema,
  reconcilePayments,
} from "./commission-contract";

const structureId = "00000000-0000-4000-8000-000000000001";
const agreementId = "00000000-0000-4000-8000-000000000002";
const vendorId = "00000000-0000-4000-8000-000000000003";
const contractId = "00000000-0000-4000-8000-000000000004";
const dealId = "00000000-0000-4000-8000-000000000005";
const eventId = "00000000-0000-4000-8000-000000000006";
const idempotencyKey = "00000000-0000-4000-8000-000000000007";
const paymentId = "00000000-0000-4000-8000-000000000008";

function structure(overrides: Record<string, unknown> = {}) {
  return {
    structureId,
    vendorOrganizationId: vendorId,
    effectiveFrom: "2026-01-01T00:00:00.000Z",
    calculationType: "contract_value_rate",
    rateBasisPoints: 1250,
    currency: "USD",
    sourceAgreementId: agreementId,
    revision: 2,
    ...overrides,
  };
}

function event(overrides: Record<string, unknown> = {}) {
  return {
    eventId,
    idempotencyKey,
    contractId,
    dealId,
    vendorOrganizationId: vendorId,
    structureId,
    signedAt: "2026-08-31T12:00:00.000Z",
    currency: "USD",
    contractValueMinorUnits: 100_000,
    commissionAmountMinorUnits: 12_500,
    calculationRevision: 2,
    state: "pending_review",
    ...overrides,
  };
}

describe("R7 commission contract", () => {
  test("requires exactly one calculation input mode", () => {
    expect(commissionStructureSchema.safeParse(structure()).success).toBe(true);
    expect(commissionStructureSchema.safeParse(structure({ flatAmountMinorUnits: 500 })).success).toBe(false);
    expect(commissionStructureSchema.safeParse(structure({ calculationType: "flat_amount", rateBasisPoints: undefined, flatAmountMinorUnits: 500 })).success).toBe(true);
  });

  test("calculates percentage commissions with integer half-up rounding", () => {
    expect(calculateCommission(structure(), 100_001, "2026-08-31T12:00:00.000Z")).toEqual({
      currency: "USD",
      contractValueMinorUnits: 100_001,
      commissionAmountMinorUnits: 12_500,
      structureId,
      structureRevision: 2,
    });
  });

  test("keeps percentage arithmetic exact near the safe integer boundary", () => {
    const maximumMinorUnits = Number.MAX_SAFE_INTEGER;
    expect(calculateCommission(
      structure({ rateBasisPoints: 10_000 }),
      maximumMinorUnits,
      "2026-08-31T12:00:00.000Z",
    ).commissionAmountMinorUnits).toBe(maximumMinorUnits);
  });

  test("supports flat amounts and rejects an out-of-date agreement", () => {
    expect(calculateCommission(structure({ calculationType: "flat_amount", rateBasisPoints: undefined, flatAmountMinorUnits: 2_500 }), 1, "2026-08-31T12:00:00.000Z").commissionAmountMinorUnits).toBe(2_500);
    expect(() => calculateCommission(structure({ effectiveTo: "2026-08-01T00:00:00.000Z" }), 100, "2026-08-31T12:00:00.000Z")).toThrow("not effective");
  });

  test("rejects duplicate contract or idempotency events", () => {
    expect(assertOneEventPerContract([event()])).toHaveLength(1);
    expect(() => assertOneEventPerContract([event(), event({ eventId: "00000000-0000-4000-8000-000000000009" })])).toThrow("Duplicate commission event");
    expect(() => assertOneEventPerContract([event(), event({ eventId: "00000000-0000-4000-8000-000000000009", contractId: "00000000-0000-4000-8000-000000000010" })])).toThrow("idempotency key");
  });

  test("reconciles partial, complete, reversed, and overpaid receipts", () => {
    expect(reconcilePayments(1_000, [])).toMatchObject({ receivedMinorUnits: 0, balanceMinorUnits: 1_000, state: "unpaid" });
    expect(reconcilePayments(1_000, [{ paymentId, commissionEventId: eventId, amountMinorUnits: 400, receivedAt: "2026-08-31T12:00:00.000Z", state: "received" }])).toMatchObject({ receivedMinorUnits: 400, balanceMinorUnits: 600, state: "partially_paid" });
    expect(reconcilePayments(1_000, [{ paymentId, commissionEventId: eventId, amountMinorUnits: 1_000, receivedAt: "2026-08-31T12:00:00.000Z", state: "received" }]).state).toBe("paid");
    expect(reconcilePayments(1_000, [{ paymentId, commissionEventId: eventId, amountMinorUnits: 1_000, receivedAt: "2026-08-31T12:00:00.000Z", state: "reversed" }]).state).toBe("unpaid");
    expect(reconcilePayments(1_000, [{ paymentId, commissionEventId: eventId, amountMinorUnits: 1_100, receivedAt: "2026-08-31T12:00:00.000Z", state: "received" }]).state).toBe("overpaid");
  });

  test("allows financial close only for approved terminal states", () => {
    expect(canFinanciallyCloseCommission("paid")).toBe(true);
    expect(canFinanciallyCloseCommission("voided")).toBe(true);
    expect(canFinanciallyCloseCommission("written_off")).toBe(true);
    expect(canFinanciallyCloseCommission("disputed")).toBe(false);
    expect(canFinanciallyCloseCommission("pending_review")).toBe(false);
  });
});
