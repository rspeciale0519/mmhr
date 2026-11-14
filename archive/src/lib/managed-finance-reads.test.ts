import { describe, expect, test } from "vitest";
import { managedFinancePageSchema, verifyManagedFinanceDetail, verifyManagedFinancePage } from "./managed-finance-reads";

const id = (value: number) => `10000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const origin = { organizationId: id(1), correlationId: id(2) };
const request = { ...origin, view: "agreements" as const };
const item = { agreementId: id(3), vendorOrganizationId: id(4), vendorLabel: "Synthetic vendor", seriesRevision: 0,
  currentApprovedVersionId: null, pendingVersionCount: 1 };
const page = { ...origin, view: "agreements", items: [item], nextCursor: null };
const originalDocument = { documentId: id(6), versionId: id(7), version: 1, isCurrent: true, state: "approved", revision: 6,
  fileName: "Synthetic original.pdf", contentType: "application/pdf", byteSize: 64, failureCode: null,
  createdAt: "2026-10-03T09:00:00Z", updatedAt: "2026-10-03T10:00:00Z" };

describe("Managed finance read boundaries in scratch", () => {
  function calculationDetail() {
    const original = { organizationId: id(1), documentId: id(6), versionId: id(7), sha256: "a".repeat(64),
      fileName: "Synthetic original.pdf", currentDocumentVersion: 1, originalVersion: 1, document: originalDocument };
    return { ...origin, entityId: id(8), view: "calculation", calculation: { calculationId: id(8), commissionEventId: id(9),
      contractId: id(10), dealLabel: "Synthetic case", vendorLabel: "Synthetic vendor", state: "pending", revision: 1,
      calculationRevision: 1, amountMinorUnits: 0, currency: "USD", blockerCodes: [], preparedByIdentityId: id(21),
      preparedByLabel: "Synthetic preparer", preparedAt: "2026-10-03T10:00:00Z", decidedByIdentityId: null,
      decidedByLabel: null, decidedAt: null, decisionReason: null, canDecide: true, canApprove: true, canReject: true,
      expectedEventRevision: 1, currentEventRevision: 1, expectedSourceDigest: "b".repeat(64), currentSourceDigest: "b".repeat(64),
      factsVersionId: id(11), agreementVersionId: id(12), agreementOrganizationId: id(13), contractOriginal: original,
      agreementOriginal: { ...original, organizationId: id(13) }, contractValue: { amountMinorUnits: null, currency: null },
      rule: { kind: "flat_amount", amountMinorUnits: 0, currency: "USD" }, conditionReferences: [], currentActorIdentityId: id(20) } };
  }
  test("permits independent stale-source rejection without implying approval", () => {
    const detail = calculationDetail(), input = { ...origin, entityId: id(8), view: "calculation" };
    expect(verifyManagedFinanceDetail(detail, input)).toEqual(detail);
    const stale = { ...detail, calculation: { ...detail.calculation, currentSourceDigest: "c".repeat(64), canApprove: false } };
    expect(verifyManagedFinanceDetail(stale, input)).toEqual(stale);
    expect(verifyManagedFinanceDetail({ ...stale, calculation: { ...stale.calculation, currentSourceDigest: null } }, input).view)
      .toBe("calculation");
    expect(() => verifyManagedFinanceDetail({ ...stale, calculation: { ...stale.calculation, canApprove: true } }, input)).toThrow();
  });
  test("rejects self review, stale event decisions, and inconsistent decision buttons", () => {
    const detail = calculationDetail(), input = { ...origin, entityId: id(8), view: "calculation" };
    for (const changed of [{ currentActorIdentityId: id(21) }, { currentEventRevision: 2 }, { canDecide: false },
      { state: "approved" }, { decidedAt: "2026-10-03T09:00:00Z" }, { amountMinorUnits: null, currency: null }]) {
      expect(() => verifyManagedFinanceDetail({ ...detail, calculation: { ...detail.calculation, ...changed } }, input)).toThrow();
    }
  });
  test("checks independent decision chronology without losing microseconds", () => {
    const detail = calculationDetail(), input = { ...origin, entityId: id(8), view: "calculation" };
    const decided = { ...detail, calculation: { ...detail.calculation, state: "rejected", revision: 2,
      preparedAt: "2026-10-03T10:00:00.000002Z", decidedAt: "2026-10-03T10:00:00.000001Z",
      decidedByIdentityId: id(20), decidedByLabel: "Independent reviewer", decisionReason: "Source needs correction",
      canDecide: false, canApprove: false, canReject: false } };
    expect(() => verifyManagedFinanceDetail(decided, input)).toThrow("Invalid finance decision time");
    decided.calculation.decidedAt = "2026-10-03T10:00:00.000002Z";
    expect(verifyManagedFinanceDetail(decided, input).view).toBe("calculation");
    decided.calculation.decidedAt = "2026-10-03T10:00:00.0000021Z";
    expect(() => verifyManagedFinanceDetail(decided, input)).toThrow();
  });
  test("accepts a labeled empty register without invented approved terms", () => {
    expect(verifyManagedFinancePage({ ...page, items: [] }, request).items).toEqual([]);
    expect(verifyManagedFinancePage(page, request).items).toEqual([item]);
  });
  test.each(["organizationId", "correlationId"])("rejects a foreign %s before rendering", field => {
    expect(() => verifyManagedFinancePage({ ...page, [field]: id(99) }, request)).toThrow("Invalid finance page binding");
  });
  test("rejects duplicate, backward, and cursor-crossing rows", () => {
    for (const items of [[item, item], [{ ...item, agreementId: id(5) }, item]]) {
      expect(() => verifyManagedFinancePage({ ...page, items }, request)).toThrow("Invalid finance page order");
    }
    expect(() => verifyManagedFinancePage(page, { ...request, afterId: id(3) })).toThrow("Invalid finance page order");
  });
  test("requires a full bounded page and its exact last row for a cursor", () => {
    expect(() => verifyManagedFinancePage({ ...page, nextCursor: id(3) }, request)).toThrow("Invalid finance page cursor");
    const items = Array.from({ length: 25 }, (_, index) => ({ ...item, agreementId: id(index + 3) }));
    expect(verifyManagedFinancePage({ ...page, items, nextCursor: id(27) }, request).nextCursor).toBe(id(27));
    expect(() => verifyManagedFinancePage({ ...page, items, nextCursor: id(26) }, request)).toThrow("Invalid finance page cursor");
  });
  test("preserves unknown pending commission money and exact known zero", () => {
    const calculation = { calculationId: id(8), commissionEventId: id(9), contractId: id(10), dealLabel: "Synthetic customer case",
      vendorLabel: "Synthetic vendor", state: "pending", revision: 1, calculationRevision: 1, amountMinorUnits: null,
      currency: null, blockerCodes: ["contract_value_missing"], preparedByLabel: "Synthetic staff", preparedAt: "2026-10-03T10:00:00Z" };
    const pending = { ...origin, view: "calculations", items: [calculation], nextCursor: null };
    expect(managedFinancePageSchema.parse(pending).items[0]).toMatchObject({ amountMinorUnits: null, currency: null });
    expect(managedFinancePageSchema.safeParse({ ...pending, items: [{ ...calculation, state: "approved" }] }).success).toBe(false);
    expect(managedFinancePageSchema.safeParse({ ...pending, items: [{ ...calculation, amountMinorUnits: 0 }] }).success).toBe(false);
    const approved = { ...calculation, state: "approved", amountMinorUnits: 0, currency: "USD", blockerCodes: [] };
    expect(managedFinancePageSchema.parse({ ...pending, items: [approved] }).items[0]).toMatchObject({ amountMinorUnits: 0 });
  });
  test("rejects an unbound commission status or event in a signed contract list", () => {
    const contract = { contractId: id(10), handoffId: id(11), dealId: id(12), dealLabel: "Synthetic contract",
      vendorOrganizationId: id(4), vendorLabel: "Synthetic vendor", signedAt: "2026-10-03T10:00:00Z",
      approvedFactsVersionId: null, commissionEventId: null, commissionState: null };
    const contracts = { ...origin, view: "contracts", items: [contract], nextCursor: null };
    expect(managedFinancePageSchema.parse(contracts).items).toEqual([contract]);
    for (const changed of [{ commissionEventId: id(9) }, { commissionState: "approved" }]) {
      expect(managedFinancePageSchema.safeParse({ ...contracts, items: [{ ...contract, ...changed }] }).success).toBe(false);
    }
  });
  test("rejects a detail whose nested target differs from its envelope", () => {
    const detail = { ...origin, currentActorIdentityId: id(20), entityId: id(3), view: "agreement", agreement: item, versions: [], nextVersion: null };
    const input = { ...origin, entityId: id(3), view: "agreement" };
    expect(verifyManagedFinanceDetail(detail, input)).toEqual(detail);
    expect(() => verifyManagedFinanceDetail({ ...detail, agreement: { ...item, agreementId: id(99) } }, input))
      .toThrow("Invalid finance detail binding");
  });
  test.each(["\nSynthetic vendor", "Synthetic\u0000vendor", "x".repeat(501)])("validates bounded vendor labels", vendorLabel => {
    // Leading whitespace normalizes safely; embedded controls do not.
    const expected = vendorLabel === "\nSynthetic vendor";
    expect(managedFinancePageSchema.safeParse({ ...page, items: [{ ...item, vendorLabel }] }).success).toBe(expected);
  });
  test("binds source versions and separate decisions before rendering their original references", () => {
    const input = { ...origin, entityId: id(3), view: "agreement" };
    const original = { organizationId: id(1), documentId: id(6), versionId: id(7), sha256: "a".repeat(64),
      fileName: "Synthetic agreement.pdf", currentDocumentVersion: 1, originalVersion: 1,
      document: {...originalDocument,fileName:"Synthetic agreement.pdf"} };
    const version = { versionId: id(8), version: 1, predecessorVersionId: null, expectedSeriesRevision: 0, original, sourceDigest: "b".repeat(64),
      effectiveFrom: "2026-10-03T10:00:00Z", statedEffectiveEnd: null, rule: { kind: "flat_amount", amountMinorUnits: 0, currency: "USD" },
      conditionReferences: [], state: "pending", revision: 1, preparedByIdentityId: id(21), preparedByLabel: "Synthetic preparer",
      preparedAt: "2026-10-03T10:00:00Z", decidedByIdentityId: null, decidedByLabel: null, decidedAt: null, decisionReason: null,
      canDecide: true, canApprove: true, canReject: true };
    const detail = { ...origin, currentActorIdentityId: id(20), entityId: id(3), view: "agreement", agreement: item,
      versions: [version], nextVersion: null };
    expect(verifyManagedFinanceDetail(detail, input)).toEqual(detail);
    for (const changed of [{ original: { ...original, organizationId: id(99) } }, { revision: 2 },
      { preparedByIdentityId: id(20) }, { decidedByIdentityId: id(20) }, { state: "approved" }]) {
      expect(() => verifyManagedFinanceDetail({ ...detail, versions: [{ ...version, ...changed }] }, input)).toThrow();
    }
    expect(() => verifyManagedFinanceDetail({ ...detail, versions: [version, version] }, input)).toThrow();
    expect(() => verifyManagedFinanceDetail({ ...detail, nextVersion: 1 }, input)).toThrow();
    expect(() => verifyManagedFinanceDetail(detail, { ...input, beforeVersion: 1 })).toThrow();
  });
});
