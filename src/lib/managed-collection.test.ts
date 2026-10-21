import { describe, expect, test } from "vitest";
import { managedCollectionCommandSchema, verifyManagedCollectionResult } from "./managed-collection";
import { calculateCollectionLedger } from "./managed-collection-ledger";
import { managedCollectionDetailSchema, managedCollectionReceiptSchema, verifyManagedCollectionDetail,
  verifyManagedCollectionHistory, verifyManagedCollectionPage } from "./managed-collection-reads";

const id = (value: number) => `00000000-0000-4000-8000-${value.toString(16).padStart(12, "0")}`;
const hash = "a".repeat(64), ledgerHash = "b".repeat(64), receiptHash = "c".repeat(64);
const scope = { organizationId: id(1), commissionEventId: id(2), invoiceId: id(3), expectationId: id(4) };
const business = { ...scope, correlationId: id(7), idempotencyKey: id(8), reason: "Verify synthetic receipt" };
const identity = { referenceRule: "exact_issuer_account_reference_v1", issuerNamespace: "Recorded issuer",
  accountNamespace: "Recorded account", referenceUniqueness: "issuer_account_guaranteed",
  uniquenessEvidenceReference: "Exact issuer account specification", evidenceLocator: "Page 1 transaction 1" };
const sourceBinding = { sourceClass: "collection_receipt", vendorOrganizationId: id(5), customerOrganizationId: id(1),
  commissionEventId: id(2), invoiceId: id(3), preparationId: id(91), calculationId: id(92), issuedSourceDigest: "e".repeat(64) };
const original = { organizationId: id(6), documentId: id(9), versionId: id(10), sha256: hash };
const allocation = (revision: number, amount: number) => ({ ...scope, vendorOrganizationId: id(5), internalOrganizationId: id(6),
  allocationId: id(20 + revision), receiptId: id(40 + revision), amountMinorUnits: amount, currency: "USD",
  ...identity, sourceDigest: hash, receivedAt: "2026-10-03T10:00:00.000001Z", approvedAt: "2026-10-03T10:00:00.000002Z", transactionReference: `Receipt-${revision}`, ledgerRevision: revision });
const balance = (rows: unknown[] = [], expected = 10000) => calculateCollectionLedger({ ...scope, vendorOrganizationId: id(5),
  internalOrganizationId: id(6), expectedMinorUnits: expected, currency: "USD", sourceDigest: hash, allocations: rows });
const confirm = { ...business, action: "confirm_expected_payment", expectedInvoiceRevision: 3, expectedEventRevision: 3,
  expectedSourceDigest: hash, expectedLiveSourceDigest: "f".repeat(64), fullBalanceTermsConfirmed: true, confirmationReference: "Approved full balance due" };
const report = { ...business, action: "report_received_payment", expectedExpectationRevision: 1, expectedLedgerRevision: 0,
  expectedSourceDigest: hash, expectedLiveSourceDigest: "f".repeat(64), expectedLedgerDigest: ledgerHash, receiptId: id(41), amountMinorUnits: 4000, currency: "USD",
  ...identity, receivedAt: "2026-10-03T10:00:00.000001Z", transactionReference: "Receipt-1", source: original, sourceBinding };
const approve = { ...business, action: "approve_received_payment", expectedExpectationRevision: 1, expectedLedgerRevision: 0,
  expectedSourceDigest: hash, expectedLiveSourceDigest: "f".repeat(64), expectedLedgerDigest: ledgerHash, receiptId: id(41), expectedReceiptRevision: 1,
  expectedReceiptDigest: receiptHash, expectedEventRevision: 3, contentsReviewed: true, reviewedAccessId: id(80), reviewReference: "Read exact receipt", referenceIdentityConfirmed: true, referenceUniquenessReviewed: true };
const reject = { ...business, action: "reject_received_payment", receiptId: id(41), expectedReceiptRevision: 1, expectedReceiptDigest: receiptHash };
const reconcile = { ...business, action: "record_reconciliation", reconciliationId: id(81), expectedExpectationRevision: 1,
  expectedLedgerRevision: 0, expectedLedgerDigest: ledgerHash, expectedSourceDigest: hash, expectedLiveSourceDigest: "f".repeat(64), expectedEventRevision: 3 };
const commonResult = { ...scope, correlationId: business.correlationId, expectationRevision: 1,
  invoiceRevision: 3, eventRevision: 3, ledgerRevision: 0, sourceDigest: hash, ledgerDigest: ledgerHash, balance: balance(), requestDigest: "9".repeat(64), observedSourceDigest: "f".repeat(64), outcomeCode: "recorded" };
const approvalResult = { ...commonResult, originalRequest: approve, action: "approve_received_payment", receiptId: id(41), receiptDigest: receiptHash,
  receiptRevision: 2, receiptState: "approved", allocationId: id(21), balanceBefore: balance(),
  balance: balance([allocation(1, 4000)]), allocatedMinorUnits: 4000, ledgerRevision: 1, ledgerDigest: "d".repeat(64), eventRevision: 4 };

describe("managed collection contract boundaries", () => {
  test.each([confirm, report, approve, reject, reconcile])("accepts the explicit %s action", request => {
    expect(managedCollectionCommandSchema.parse(request).action).toBe(request.action);
  });
  test.each(["actorIdentityId", "approvedByIdentityId", "decidedAt", "receivedTotal", "outstandingMinorUnits", "reportRows", "eventState"])(
    "rejects caller financial authority %s", key => expect(managedCollectionCommandSchema.safeParse({ ...approve, [key]: id(90) }).success).toBe(false));
  test.each(["reverse_payment", "adjust_payment", "void_payment", "write_off", "close_deal", "schedule_installments"])(
    "rejects unsupported phase5 or schedule action %s", action => expect(managedCollectionCommandSchema.safeParse({ ...reject, action }).success).toBe(false));
  test("rejects omitted approval acknowledgment or reviewed access", () => {
    expect(managedCollectionCommandSchema.safeParse({ ...approve, contentsReviewed: false }).success).toBe(false);
    expect(managedCollectionCommandSchema.safeParse({ ...approve, reviewedAccessId: undefined }).success).toBe(false);
  });
  test("permits stale receipt rejection without accepting fresh source authority", () => {
    expect(managedCollectionCommandSchema.parse(reject).action).toBe("reject_received_payment");
    expect(managedCollectionCommandSchema.safeParse({ ...reject, expectedSourceDigest: hash }).success).toBe(false);
  });
  test("verifies each complete immutable action result", () => {
    expect(verifyManagedCollectionResult({ ...commonResult, originalRequest: confirm, action: confirm.action }, confirm).ledgerRevision).toBe(0);
    expect(verifyManagedCollectionResult({ ...commonResult, originalRequest: report, action: report.action, receiptId: id(41), receiptDigest: receiptHash,
      receiptRevision: 1, receiptState: "pending", balanceBefore: balance(), eventRevisionBefore: 3 }, report)).toMatchObject({ receiptState: "pending" });
    expect(verifyManagedCollectionResult(approvalResult, approve)).toMatchObject({ ledgerRevision: 1, eventRevision: 4 });
    expect(verifyManagedCollectionResult({ ...commonResult, originalRequest: reject, observedSourceDigest: null, action: reject.action, receiptId: id(41), receiptDigest: receiptHash,
      receiptRevision: 2, receiptState: "rejected", balanceBefore: balance(), ledgerRevisionBefore: 0,
      ledgerDigestBefore: ledgerHash, eventRevisionBefore: 3 }, reject)).toMatchObject({ ledgerRevision: 0 });
    expect(verifyManagedCollectionResult({ ...commonResult, originalRequest: reconcile, action: reconcile.action, reconciliationId: id(81), reconciliationRevision: 1 }, reconcile))
      .toMatchObject({ eventRevision: 3 });
  });
  test("keeps an original partial result after a later full receipt", () => {
    const fullCurrent = balance([allocation(1, 4000), allocation(2, 6000)]);
    expect(fullCurrent.eventState).toBe("paid");
    expect(verifyManagedCollectionResult({ ...approvalResult, outcomeCode: "replayed" }, approve).balance.outstandingMinorUnits).toBe(6000);
    expect(() => verifyManagedCollectionResult({ ...approvalResult, balance: fullCurrent }, approve)).toThrow();
  });
  test("a second partial allocation keeps event revision while the ledger advances", () => {
    const request = { ...approve, expectedLedgerRevision: 1, expectedEventRevision: 4 };
    expect(verifyManagedCollectionResult({ ...approvalResult, originalRequest: request, balanceBefore: balance([allocation(1, 4000)]),
      balance: balance([allocation(1, 4000), allocation(2, 1000)]), allocatedMinorUnits: 1000, ledgerRevision: 2 }, request).eventRevision).toBe(4);
  });
  test.each([{ organizationId: id(99) }, { correlationId: id(99) }, { receiptId: id(99) }, { sourceDigest: "e".repeat(64) },
    { receiptDigest: "e".repeat(64) }, { ledgerRevision: 2 }, { eventRevision: 3 }, { allocatedMinorUnits: 3999 }])(
    "rejects forged original approval output %j", fields => expect(() => verifyManagedCollectionResult({ ...approvalResult, ...fields }, approve)).toThrow());
  test("accepts the largest stored counters while rejecting write overflow", () => {
    const max = 2_147_483_646;
    expect(verifyManagedCollectionResult({ ...approvalResult, originalRequest: { ...approve, expectedLedgerRevision: max, expectedEventRevision: max }, ledgerRevision: max + 1, eventRevision: max + 1 },
      { ...approve, expectedLedgerRevision: max, expectedEventRevision: max }).eventRevision).toBe(2_147_483_647);
    expect(managedCollectionCommandSchema.safeParse({ ...approve, expectedLedgerRevision: max + 1 }).success).toBe(false);
    expect(managedCollectionCommandSchema.safeParse({ ...confirm, expectedEventRevision: max + 1 }).success).toBe(false);
  });
});

const originalMetadata = { ...original, originalVersion: 1, currentDocumentVersion: 1,
  document: { documentId: original.documentId, versionId: original.versionId, version: 1, isCurrent: true,
    fileName: "Synthetic source.pdf", contentType: "application/pdf", byteSize: 12, state: "approved", revision: 2,
    failureCode: null, createdAt: "2026-10-03T09:00:00Z", updatedAt: "2026-10-03T09:01:00Z" } };
const detailRequest = { organizationId: scope.organizationId, correlationId: business.correlationId,
  commissionEventId: scope.commissionEventId, invoiceId: scope.invoiceId };
const detail = { organizationId: scope.organizationId, correlationId: business.correlationId, currentActorIdentityId: id(90),
  observedAt: "2026-10-03T11:00:00.000001Z", basis: { organizationId: scope.organizationId, commissionEventId: scope.commissionEventId, invoiceId: scope.invoiceId,
    preparationId: id(91), calculationId: id(92), internalOrganizationId: id(6), vendorOrganizationId: id(5),
    contractId: id(93), handoffId: id(94), dealId: id(95), invoiceRevision: 3, eventRevision: 3, calculationRevision: 1,
    invoiceNumber: "Synthetic-1", amountMinorUnits: 10000, currency: "USD", issueDate: "2026-10-03T09:00:00Z",
    dueDate: "2026-10-03T11:00:00.000001Z", issuedAt: "2026-10-03T09:00:00.000001Z", collectionTerms: "Full balance due",
    contractValue: { amountMinorUnits: null, currency: null }, sourceDigest: hash, issuedSourceDigest: sourceBinding.issuedSourceDigest,
    supportingOriginals: [originalMetadata, { ...originalMetadata, organizationId: scope.organizationId, documentId: id(96), versionId: id(97),
      document: { ...originalMetadata.document, documentId: id(96), versionId: id(97) } }] },
  expectation: null, liveSourceDigest: "f".repeat(64), sourceCurrent: true, invoiceOwnerCurrent: true, invoiceReviewerCurrent: true, blockerCodes: [],
  canConfirmExpectedPayment: true, canReportReceipt: false, canReconcile: false, overdue: false,
  scheduleSupport: "single_full_balance_only", financialClosureApproved: false };

describe("scoped managed collection reads", () => {
  test("retains unknown flat contract total and exact due-time boundary", () => {
    expect(verifyManagedCollectionDetail(detail, detailRequest, id(90)).basis.contractValue.amountMinorUnits).toBeNull();
    expect(() => verifyManagedCollectionDetail({ ...detail, observedAt: "2026-10-03T11:00:00.000002Z" }, detailRequest, id(90))).toThrow();
    expect(verifyManagedCollectionDetail({ ...detail, observedAt: "2026-10-03T11:00:00.000002Z", overdue: true }, detailRequest, id(90)).overdue).toBe(true);
  });
  test("binds expectation confirmation times to issuance and the observed read", () => {
    const expectation = { expectationId: scope.expectationId, revision: 1, confirmedByIdentityId: id(91),
      confirmedByLabel: "Stored confirming staff", confirmedAt: "2026-10-03T09:30:00.000001Z", confirmationReference: "Full invoice balance",
      sourceDigest: hash, issuedSourceDigest: sourceBinding.issuedSourceDigest, ledgerRevision: 0, ledgerDigest: ledgerHash, balance: balance() };
    const current = { ...detail, expectation, canConfirmExpectedPayment: false, canReportReceipt: true, canReconcile: true };
    expect(verifyManagedCollectionDetail(current, detailRequest, id(90)).expectation?.expectationId).toBe(scope.expectationId);
    expect(current.expectation.sourceDigest).not.toBe(current.expectation.issuedSourceDigest);
    for (const confirmedAt of ["2026-10-03T09:00:00.000000Z", "2026-10-03T11:00:00.000002Z"]) {
      expect(() => verifyManagedCollectionDetail({ ...current, expectation: { ...expectation, confirmedAt } }, detailRequest, id(90))).toThrow();
    }
    expect(() => verifyManagedCollectionDetail({ ...detail, observedAt: "2026-10-03T09:00:00.000000Z" }, detailRequest, id(90))).toThrow();
    expect(() => verifyManagedCollectionDetail({ ...current, expectation: { ...expectation, sourceDigest: sourceBinding.issuedSourceDigest } }, detailRequest, id(90))).toThrow();
  });
  test.each([{ currentActorIdentityId: id(91) }, { canReportReceipt: true }, { canReconcile: true },
    { sourceCurrent: false }, { invoiceOwnerCurrent: false }, { financialClosureApproved: true }, { scheduleSupport: "installments" }])(
    "rejects forged detail availability or scope %j", fields => expect(() => verifyManagedCollectionDetail({ ...detail, ...fields }, detailRequest, id(90))).toThrow());
  test("rejects changed approved original metadata", () => {
    const changed = { ...detail, basis: { ...detail.basis, supportingOriginals: [
      { ...originalMetadata, document: { ...originalMetadata.document, versionId: id(99) } }, detail.basis.supportingOriginals[1]] } };
    expect(() => verifyManagedCollectionDetail(changed, detailRequest, id(90))).toThrow();
  });
  test.each(["issueDate", "dueDate", "issuedAt"])("returns the invalid basis %s field without throwing", field => {
    const result = managedCollectionDetailSchema.safeParse({ ...detail,
      basis: { ...detail.basis, [field]: "2026-10-03T10:00:00.0000001Z" } });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: ["basis", field] }),
    ]));
  });
  test("checks full25 cursor, order, duplicates and request actor", () => {
    const items = Array.from({ length: 25 }, (_, index) => ({ invoiceId: id(100 + index), commissionEventId: id(200 + index),
      vendorOrganizationId: id(5), vendorLabel: "Stored vendor", invoiceNumber: `Synthetic-${index}`, amountMinorUnits: 10000,
      currency: "USD", dueDate: "2026-10-03T11:00:00Z", contractValue: { amountMinorUnits: null, currency: null },
      expectationId: null, balance: null, liveSourceDigest: "f".repeat(64), sourceCurrent: true, blockerCodes: [] }));
    const request = { organizationId: scope.organizationId, correlationId: business.correlationId, afterInvoiceId: id(99) };
    const page = { organizationId: request.organizationId, correlationId: request.correlationId,
      currentActorIdentityId: id(90), items, nextCursor: id(124), scheduleSupport: "single_full_balance_only" };
    expect(verifyManagedCollectionPage(page, request, id(90)).items).toHaveLength(25);
    for (const changed of [{ ...page, items: items.slice(1) }, { ...page, nextCursor: id(123) },
      { ...page, items: [...items].reverse() }, { ...page, items: [items[0], ...items.slice(0, 24)] }]) {
      expect(() => verifyManagedCollectionPage(changed, request, id(90))).toThrow();
    }
    expect(() => verifyManagedCollectionPage(page, request, id(91))).toThrow();
    expect(() => verifyManagedCollectionPage({ ...page, items: [{ ...items[0], blockerCodes: ["stale_source", "stale_source"] }] },
      request, id(90))).toThrow();
  });
  test("empty allocation history retains scoped current balance and hides secrets", () => {
    const request = { ...scope, correlationId: business.correlationId, view: "allocations" };
    const page = { ...request, currentActorIdentityId: id(90), nextCursor: null, items: [], internalOrganizationId: id(6),
      vendorOrganizationId: id(5), issuedSource: sourceBinding, liveSourceDigest: "f".repeat(64), sourceDigest: hash, ledgerRevision: 0, ledgerDigest: ledgerHash, balance: balance(),
      sourceCurrent: true, invoiceOwnerCurrent: true, invoiceReviewerCurrent: true };
    expect(verifyManagedCollectionHistory(page, request, id(90)).items).toEqual([]);
    expect(() => verifyManagedCollectionHistory({ ...page, token: "synthetic" }, request, id(90))).toThrow();
    expect(() => verifyManagedCollectionHistory({ ...page, organizationId: id(99) }, request, id(90))).toThrow();
  });
  test("stale receipt can be rejected independently but cannot be approved", () => {
    const request = { ...scope, correlationId: business.correlationId, view: "receipts" };
    const row = { ...scope, receiptId: id(41), receiptRevision: 1, state: "pending", receiptDigest: receiptHash, sourceDigest: hash,
      ...identity, amountMinorUnits: 4000, currency: "USD", receivedAt: "2026-10-03T10:00:00.000001Z", transactionReference: "Receipt-1",
      original: { ...originalMetadata, sourceBinding }, reportedByIdentityId: id(91), reportedByLabel: "Stored preparer", reportedAt: "2026-10-03T10:00:00.000002Z",
      decidedByIdentityId: null, decidedByLabel: null, decidedAt: null, allocationId: null,
      sourceCurrent: false, preparerCurrent: false, blockerCodes: ["stale_source", "revoked_preparer"], canApprove: false, canReject: true };
    const page = { ...request, currentActorIdentityId: id(90), nextCursor: null, items: [row], internalOrganizationId: id(6),
      vendorOrganizationId: id(5), issuedSource: sourceBinding, liveSourceDigest: "f".repeat(64), sourceDigest: hash, ledgerRevision: 0, ledgerDigest: ledgerHash, balance: balance(),
      sourceCurrent: false, invoiceOwnerCurrent: false, invoiceReviewerCurrent: false };
    expect(verifyManagedCollectionHistory(page, request, id(90)).items).toHaveLength(1);
    for (const field of ["receivedAt", "reportedAt", "decidedAt"]) {
      const result = managedCollectionReceiptSchema.safeParse({ ...row, [field]: "2026-10-03T10:00:00.0000001Z" });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ path: [field] }),
      ]));
    }
    for (const changed of [{ ...row, canApprove: true }, { ...row, reportedByIdentityId: id(90) },
      { ...row, original: { ...originalMetadata, sourceBinding, organizationId: id(99) } }, { ...row, currency: "JPY" }]) {
      expect(() => verifyManagedCollectionHistory({ ...page, items: [changed] }, request, id(90))).toThrow();
    }
  });
  test("retains approved original history after full collection and a changed live source", () => {
    const request = { ...scope, correlationId: business.correlationId, view: "receipts" };
    const historicalOriginal = { ...originalMetadata, sourceBinding, currentDocumentVersion: 2,
      document: { ...originalMetadata.document, isCurrent: false, state: "superseded" } };
    const row = { ...scope, ...identity, receiptId: id(41), receiptRevision: 2, state: "approved",
      receiptDigest: receiptHash, sourceDigest: hash, amountMinorUnits: 4000, currency: "USD",
      receivedAt: "2026-10-03T10:00:00.000001Z", transactionReference: "Receipt-1", original: historicalOriginal,
      reportedByIdentityId: id(91), reportedByLabel: "Stored preparer", reportedAt: "2026-10-03T10:00:00.000002Z",
      decidedByIdentityId: id(92), decidedByLabel: "Stored reviewer", decidedAt: "2026-10-03T10:00:00.000003Z",
      allocationId: id(21), sourceCurrent: false, preparerCurrent: false, blockerCodes: [], canApprove: false, canReject: false };
    const page = { ...request, currentActorIdentityId: id(90), nextCursor: null, items: [row], internalOrganizationId: id(6),
      vendorOrganizationId: id(5), issuedSource: sourceBinding, sourceDigest: hash, liveSourceDigest: "8".repeat(64),
      ledgerRevision: 2, ledgerDigest: "7".repeat(64), balance: balance([allocation(1, 4000), allocation(2, 6000)]),
      sourceCurrent: false, invoiceOwnerCurrent: false, invoiceReviewerCurrent: false };
    const retained = verifyManagedCollectionHistory(page, request, id(90));
    expect(retained.balance.eventState).toBe("paid");
    expect(retained.sourceDigest).toBe(hash);
    expect(retained.liveSourceDigest).not.toBe(retained.sourceDigest);
    expect(() => verifyManagedCollectionHistory({ ...page, sourceDigest: page.liveSourceDigest }, request, id(90))).toThrow();
  });
  test("unverified receipt remains visible and rejectable with allocation blocked", () => {
    const request = { ...scope, correlationId: business.correlationId, view: "receipts" };
    const row = { ...scope, ...identity, referenceUniqueness: "unverified", uniquenessEvidenceReference: null,
      receiptId: id(41), receiptRevision: 1, state: "pending", receiptDigest: receiptHash, sourceDigest: hash,
      amountMinorUnits: 4000, currency: "USD", receivedAt: "2026-10-03T10:00:00.000001Z", transactionReference: "Memo only",
      original: { ...originalMetadata, sourceBinding }, reportedByIdentityId: id(91), reportedByLabel: "Stored preparer",
      reportedAt: "2026-10-03T10:00:00.000002Z", decidedByIdentityId: null, decidedByLabel: null, decidedAt: null,
      allocationId: null, sourceCurrent: true, preparerCurrent: true, blockerCodes: ["unsupported_transaction_identity"], canApprove: false, canReject: true };
    const page = { ...request, currentActorIdentityId: id(90), nextCursor: null, items: [row], internalOrganizationId: id(6),
      vendorOrganizationId: id(5), issuedSource: sourceBinding, sourceDigest: hash, liveSourceDigest: "f".repeat(64),
      ledgerRevision: 0, ledgerDigest: ledgerHash, balance: balance(), sourceCurrent: true,
      invoiceOwnerCurrent: true, invoiceReviewerCurrent: true };
    expect(verifyManagedCollectionHistory(page, request, id(90)).items).toHaveLength(1);
    expect(() => verifyManagedCollectionHistory({ ...page, items: [{ ...row, canApprove: true }] }, request, id(90))).toThrow();
    expect(() => verifyManagedCollectionHistory({ ...page, items: [{ ...row, reportedAt: "2026-10-03T10:00:00.000000Z" }] }, request, id(90))).toThrow();
    expect(() => verifyManagedCollectionHistory({ ...page, issuedSource: { ...sourceBinding, vendorOrganizationId: id(6) } }, request, id(90))).toThrow();
    expect(() => verifyManagedCollectionHistory({ ...page, items: [{ ...row, original: { ...row.original,
      sourceBinding: { ...sourceBinding, preparationId: id(99) } } }] }, request, id(90))).toThrow();
  });
  test("checks current allocation history without treating a page as the full ledger", () => {
    const request = { ...scope, correlationId: business.correlationId, view: "allocations" };
    const rows = [allocation(1, 4000), allocation(2, 6000)];
    const page = { ...request, currentActorIdentityId: id(90), nextCursor: null, items: [rows[1]],
      internalOrganizationId: id(6), vendorOrganizationId: id(5), issuedSource: sourceBinding, sourceDigest: hash,
      liveSourceDigest: "f".repeat(64), ledgerRevision: 2, ledgerDigest: ledgerHash, balance: balance(rows),
      sourceCurrent: true, invoiceOwnerCurrent: true, invoiceReviewerCurrent: true };
    expect(verifyManagedCollectionHistory(page, request, id(90)).items).toHaveLength(1);
    for (const items of [[{ ...rows[1], amountMinorUnits: 10001 }], [{ ...rows[1], sourceDigest: "f".repeat(64) }],
      [rows[0], { ...rows[1], ledgerRevision: 1 }], [rows[0], { ...rows[1], receiptId: rows[0].receiptId }],
      [rows[0], { ...rows[1], transactionReference: rows[0].transactionReference }]]) {
      expect(() => verifyManagedCollectionHistory({ ...page, items }, request, id(90))).toThrow();
    }
    expect(() => verifyManagedCollectionHistory({ ...page, ledgerRevision: 0 }, request, id(90))).toThrow();
  });
  test("retains older reconciliation results and verifies the exact current ledger result", () => {
    const request = { ...scope, correlationId: business.correlationId, view: "reconciliations" };
    const row = { ...scope, reconciliationId: id(81), revision: 1, sourceDigest: hash, ledgerDigest: ledgerHash, ledgerRevision: 2,
      recordedAt: "2026-10-03T10:01:00Z", recordedByIdentityId: id(90), recordedByLabel: "Stored reconciliation staff",
      allocationCount: 2, balance: balance([allocation(1, 4000), allocation(2, 6000)]) };
    const page = { ...request, currentActorIdentityId: id(90), nextCursor: null, items: [row], internalOrganizationId: id(6),
      vendorOrganizationId: id(5), issuedSource: sourceBinding, sourceDigest: hash, liveSourceDigest: "8".repeat(64),
      ledgerRevision: 2, ledgerDigest: ledgerHash, balance: row.balance, sourceCurrent: false,
      invoiceOwnerCurrent: false, invoiceReviewerCurrent: false };
    expect(verifyManagedCollectionHistory(page, request, id(90)).items).toHaveLength(1);
    expect(verifyManagedCollectionHistory({ ...page, items: [{ ...row, ledgerRevision: 1, allocationCount: 1,
      ledgerDigest: "7".repeat(64), balance: balance([allocation(1, 4000)]) }] }, request, id(90)).items).toHaveLength(1);
    for (const fields of [{ allocationCount: 1 }, { ledgerRevision: 0, allocationCount: 0 },
      { ledgerDigest: "7".repeat(64) }, { ledgerRevision: 1, allocationCount: 1 }, { sourceDigest: page.liveSourceDigest },
      { ledgerRevision: 3, allocationCount: 3 }, { balance: { ...row.balance, currency: "JPY" } }]) {
      expect(() => verifyManagedCollectionHistory({ ...page, items: [{ ...row, ...fields }] }, request, id(90))).toThrow();
    }
  });
});
