import { describe, expect, test } from "vitest";
import { formatProposalQuoteAmount, parseProposalQuoteAmount } from "@/lib/proposal-quote";
import { calculateCollectionLedger, checkCollectionReport, collectionAllocationSchema, collectionBalanceSchema } from "./managed-collection-ledger";

const id = (value: number) => `00000000-0000-4000-8000-${value.toString(16).padStart(12, "0")}`;
const scope = { organizationId: id(1), commissionEventId: id(2), invoiceId: id(3), expectationId: id(4),
  vendorOrganizationId: id(5), internalOrganizationId: id(6) };
const allocation = (revision: number, amount: number, changes: Record<string, unknown> = {}) => ({
  ...scope, allocationId: id(20 + revision), receiptId: id(40 + revision), amountMinorUnits: amount, currency: "USD",
  referenceRule: "exact_issuer_account_reference_v1", issuerNamespace: "Recorded issuer", accountNamespace: "Recorded account",
  referenceUniqueness: "issuer_account_guaranteed", uniquenessEvidenceReference: "Issuer account identifier specification",
  evidenceLocator: `Page 1 transaction ${revision}`, sourceDigest: "a".repeat(64),
  transactionReference: `Receipt-${revision}`, ledgerRevision: revision,
  receivedAt: "2026-10-03T10:00:00.000001Z", approvedAt: "2026-10-03T10:00:00.000002Z", ...changes });
const ledger = (amount: number, allocations: unknown[] = [], changes: Record<string, unknown> = {}) =>
  calculateCollectionLedger({ ...scope, expectedMinorUnits: amount, currency: "USD", sourceDigest: "a".repeat(64), allocations, ...changes });

describe("exact managed collection ledger", () => {
  test("retains separate partial, full and financially open results", () => {
    const partial = ledger(10000, [allocation(1, 4000)]);
    expect(partial).toMatchObject({ approvedReceivedMinorUnits: 4000, outstandingMinorUnits: 6000,
      eventState: "partially_paid", financialClosureApproved: false, collectionComplete: false });
    expect(ledger(10000, [allocation(1, 4000), allocation(2, 6000)])).toMatchObject({
      approvedReceivedMinorUnits: 10000, outstandingMinorUnits: 0, eventState: "paid", financialClosureApproved: false, collectionComplete: true });
    expect(partial.outstandingMinorUnits).toBe(6000);
  });
  test("a zero invoice cannot create paid status or an allocation", () => {
    expect(ledger(0)).toMatchObject({ eventState: "invoiced", zeroTerminalApprovalRequired: true, collectionComplete: false });
    expect(() => ledger(0, [allocation(1, 1)])).toThrow();
    expect(collectionBalanceSchema.safeParse({ ...ledger(0), eventState: "paid" }).success).toBe(false);
  });
  test("sums the largest supported invoice without floating point loss", () => {
    expect(ledger(Number.MAX_SAFE_INTEGER, [allocation(1, Number.MAX_SAFE_INTEGER - 1), allocation(2, 1)]))
      .toMatchObject({ approvedReceivedMinorUnits: Number.MAX_SAFE_INTEGER, outstandingMinorUnits: 0 });
    expect(() => ledger(Number.MAX_SAFE_INTEGER, [allocation(1, Number.MAX_SAFE_INTEGER), allocation(2, 1)])).toThrow();
  });
  test.each([0, -1, 0.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])("rejects an invalid allocation %s", amount => {
    expect(() => ledger(10000, [allocation(1, amount)])).toThrow();
  });
  test.each([{ invoiceId: id(90) }, { expectationId: id(90) }, { organizationId: id(90) },
    { internalOrganizationId: id(90) }, { vendorOrganizationId: id(90) }, { commissionEventId: id(90) },
    { currency: "JPY" }, { currency: "usd" }, { state: "reversed" }, { ledgerRevision: 2 }])("rejects crossed or unproven rows %j", changes => {
    expect(() => ledger(10000, [allocation(1, 100, changes)])).toThrow();
  });
  test.each([{ allocationId: id(21) }, { receiptId: id(41) }, { transactionReference: "Receipt-1" }, { ledgerRevision: 1 }])(
    "rejects duplicate allocations and references %j", changes => expect(() => ledger(10000,
      [allocation(1, 100), allocation(2, 100, changes)])).toThrow());
  test("matches UUID case without changing transaction reference case", () => {
    const mixed = "AB000000-0000-4000-8000-000000000001";
    expect(ledger(100, [allocation(1, 100, { organizationId: mixed.toLowerCase() })], { organizationId: mixed }).eventState).toBe("paid");
  });
  test("keeps microsecond chronology and rejects a future report", () => {
    const current = ledger(10000);
    expect(checkCollectionReport(100, "USD", current, "2026-10-03T10:00:00.000001Z", "2026-10-03T12:00:00.000001+02:00"))
      .toEqual({ amountMinorUnits: 100, currency: "USD" });
    expect(() => checkCollectionReport(100, "USD", current, "2026-10-03T10:00:00.000002Z", "2026-10-03T10:00:00.000001Z")).toThrow();
    expect(collectionAllocationSchema.safeParse(allocation(1, 100, { approvedAt: "2026-10-03T10:00:00.000000Z" })).success).toBe(false);
    expect(collectionAllocationSchema.safeParse(allocation(1, 100, { receivedAt: "2026-10-03T10:00:00.0000001Z" })).success).toBe(false);
  });
  test("checks exact current outstanding and currency before reporting", () => {
    const current = ledger(10000, [allocation(1, 4000)]);
    expect(checkCollectionReport(6000, "USD", current, "2026-10-03T10:00:00Z", "2026-10-03T10:00:00Z").amountMinorUnits).toBe(6000);
    expect(() => checkCollectionReport(6001, "USD", current, "2026-10-03T10:00:00Z", "2026-10-03T10:00:00Z")).toThrow();
    expect(() => checkCollectionReport(1, "JPY", current, "2026-10-03T10:00:00Z", "2026-10-03T10:00:00Z")).toThrow();
  });
  test.each(["receivedAt", "approvedAt"])("returns validation errors for malformed %s without throwing", field => {
    for (const time of ["2026-10-03T10:00:00.0000001Z", "not-a-date"]) {
      const result = collectionAllocationSchema.safeParse(allocation(1, 100, { [field]: time }));
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ path: [field] }),
      ]));
    }
  });
  test.each([["123", "JPY", 123], ["1.234", "KWD", 1234], ["12.34", "USD", 1234]] as const)(
    "uses the existing exact currency helpers for %s %s", (text, currency, minor) => {
      expect(parseProposalQuoteAmount(text, currency)).toBe(minor);
      expect(formatProposalQuoteAmount(minor, currency)).not.toBe("Unknown");
    });
});
