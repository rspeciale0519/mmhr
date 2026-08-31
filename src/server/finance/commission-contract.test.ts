import { describe, expect, test } from "vitest";

import {
  assertOneEventPerContract,
  calculateCommission,
  canFinanciallyCloseCommission,
  commissionStructureSchema,
  canIssueInvoice,
  canViewCommissionData,
  issueInvoice,
  reconcileFinancialReport,
  prepareFinanceHandoff,
  type CommissionEvent,
  type CommissionPayment,
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
const invoiceId = "00000000-0000-4000-8000-000000000011";
const ownerId = "00000000-0000-4000-8000-000000000012";
const disputeId = "00000000-0000-4000-8000-000000000013";

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

function invoice(overrides: Record<string, unknown> = {}) {
  return {
    invoiceId,
    commissionEventId: eventId,
    vendorOrganizationId: vendorId,
    ownerIdentityId: ownerId,
    currency: "USD",
    amountMinorUnits: 12_500,
    status: "ready",
    invoiceNumber: null,
    issueDate: null,
    dueDate: null,
    supportingDocumentReferences: ["document:invoice-support"],
    ...overrides,
  };
}

function payment(overrides: Record<string, unknown> = {}) {
  return {
    paymentId,
    commissionEventId: eventId,
    amountMinorUnits: 5_000,
    receivedAt: "2026-08-31T12:00:00.000Z",
    state: "received",
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

  test("requires an approved event before issuing a matching invoice", () => {
    expect(canIssueInvoice(event(), invoice())).toBe(false);
    const approvedEvent = event({ state: "approved" });
    expect(canIssueInvoice(approvedEvent, invoice())).toBe(true);
    expect(issueInvoice(invoice(), {
      invoiceNumber: "INV-1001",
      issueDate: "2026-08-31T12:00:00.000Z",
      dueDate: "2026-09-30T12:00:00.000Z",
    })).toMatchObject({ status: "issued", invoiceNumber: "INV-1001" });
    expect(() => issueInvoice(invoice({ status: "draft" }), {
      invoiceNumber: "INV-1001",
      issueDate: "2026-08-31T12:00:00.000Z",
      dueDate: "2026-09-30T12:00:00.000Z",
    })).toThrow("not ready");
  });

  test("rejects unresolved disputes and unapproved adjustments", async () => {
    const { disputeSchema, adjustmentSchema } = await import("./commission-contract");
    expect(disputeSchema.safeParse({
      disputeId,
      commissionEventId: eventId,
      openedByIdentityId: ownerId,
      openedAt: "2026-08-31T12:00:00.000Z",
      reasonCode: "amount",
      reason: "Amount needs review",
      status: "open",
      resolvedByIdentityId: null,
      resolvedAt: null,
      resolution: null,
    }).success).toBe(true);
    expect(disputeSchema.safeParse({
      disputeId,
      commissionEventId: eventId,
      openedByIdentityId: ownerId,
      openedAt: "2026-08-31T12:00:00.000Z",
      reasonCode: "amount",
      reason: "Amount needs review",
      status: "resolved",
      resolvedByIdentityId: null,
      resolvedAt: null,
      resolution: null,
    }).success).toBe(false);
    expect(adjustmentSchema.safeParse({
      adjustmentId: "00000000-0000-4000-8000-000000000014",
      commissionEventId: eventId,
      direction: "decrease",
      amountMinorUnits: 500,
      reason: "Approved correction",
      approvedByIdentityId: ownerId,
      approvedAt: "2026-08-31T12:00:00.000Z",
      createdAt: "2026-08-31T11:00:00.000Z",
    }).success).toBe(true);
  });

  test("reconciles reports to immutable event and payment totals", () => {
    const sourceEvent = event({ state: "approved" }) as CommissionEvent;
    const sourcePayment = payment() as CommissionPayment;
    const row = {
      commissionEventId: eventId,
      currency: "USD",
      earnedMinorUnits: 12_500,
      invoicedMinorUnits: 12_500,
      receivedMinorUnits: 5_000,
      balanceMinorUnits: 7_500,
    };
    expect(reconcileFinancialReport([sourceEvent], [sourcePayment], [row])).toEqual([row]);
    expect(() => reconcileFinancialReport([sourceEvent], [sourcePayment], [{ ...row, receivedMinorUnits: 4_000, balanceMinorUnits: 8_500 }])).toThrow("does not reconcile");
    expect(() => reconcileFinancialReport([sourceEvent], [sourcePayment], [{ ...row, invoicedMinorUnits: 10_000, balanceMinorUnits: 5_000 }])).toThrow("does not reconcile");
  });

  test("prepares an approved handoff and denies portal finance visibility", () => {
    expect(prepareFinanceHandoff({
      handoffId: "00000000-0000-4000-8000-000000000015",
      destinationReference: "finance:approved-destination",
      sourceEventIds: [eventId],
      approvedByIdentityId: ownerId,
      approvedAt: "2026-08-31T12:00:00.000Z",
      reason: "Monthly finance reconciliation",
    })).toMatchObject({ destinationReference: "finance:approved-destination" });
    expect(canViewCommissionData("internal")).toBe(true);
    expect(canViewCommissionData("customer")).toBe(false);
    expect(canViewCommissionData("vendor")).toBe(false);
  });
});
