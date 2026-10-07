import { describe, expect, test } from "vitest";
import { assertDistinctCollectionFunds, calculateCollectionLedger, collectionFundsIdentityKey,
  collectionReportedIdentitySchema } from "./managed-collection-ledger";
import { managedCollectionCommandSchema, verifyManagedCollectionResult } from "./managed-collection";
import { collectionReceiptSourceSchema, collectionReceiptUploadPreparationSchema } from "./managed-collection-source";
import { financeDocumentSourceSchema } from "@/lib/finance-document-upload";

const id = (value: number) => `00000000-0000-4000-8000-${value.toString(16).padStart(12, "0")}`;
const digest = "a".repeat(64), liveDigest = "b".repeat(64), ledgerDigest = "c".repeat(64);
const scope = { organizationId: id(1), commissionEventId: id(2), invoiceId: id(3), expectationId: id(4) };
const identity = { referenceRule: "exact_issuer_account_reference_v1", issuerNamespace: "Observed issuer namespace",
  accountNamespace: "Observed account namespace", transactionReference: "Transaction-1" };
const confirmed = { ...identity, referenceUniqueness: "issuer_account_guaranteed", uniquenessEvidenceReference: "Original page 2 identifier rules" };
const allocation = (n: number, fields: Record<string, unknown> = {}) => ({ ...scope,
  allocationId: id(20 + n), receiptId: id(40 + n), vendorOrganizationId: id(5), internalOrganizationId: id(6),
  amountMinorUnits: 4000, currency: "USD", receivedAt: "2026-10-03T10:00:00.000001Z",
  approvedAt: "2026-10-03T10:00:00.000002Z", ...confirmed, evidenceLocator: `Page 1 transaction ${n}`,
  sourceDigest: digest, ledgerRevision: n, ...fields });
const binding = { sourceClass: "collection_receipt", vendorOrganizationId: id(5), customerOrganizationId: id(1),
  commissionEventId: id(2), invoiceId: id(3), preparationId: id(7), calculationId: id(8), issuedSourceDigest: "d".repeat(64) };
const report = { ...scope, correlationId: id(9), idempotencyKey: id(10), reason: "Record observed synthetic transaction",
  action: "report_received_payment", expectedExpectationRevision: 1, expectedSourceDigest: digest,
  expectedLiveSourceDigest: liveDigest, expectedLedgerRevision: 0, expectedLedgerDigest: ledgerDigest,
  receiptId: id(41), amountMinorUnits: 4000, currency: "USD", receivedAt: "2026-10-03T10:00:00.000001Z",
  ...confirmed, evidenceLocator: "Page 1 transaction 1", sourceBinding: binding,
  source: { organizationId: id(6), documentId: id(11), versionId: id(12), sha256: digest } };
const balance = calculateCollectionLedger({ ...scope, vendorOrganizationId: id(5), internalOrganizationId: id(6),
  expectedMinorUnits: 10000, currency: "USD", sourceDigest: digest, allocations: [] });
const reportResult = { ...scope, correlationId: report.correlationId, expectationRevision: 1, invoiceRevision: 3,
  eventRevision: 3, ledgerRevision: 0, sourceDigest: digest, ledgerDigest, balance, outcomeCode: "recorded",
  originalRequest: report, requestDigest: "e".repeat(64), observedSourceDigest: liveDigest, action: "report_received_payment",
  receiptId: id(41), receiptDigest: "f".repeat(64), receiptRevision: 1, receiptState: "pending", balanceBefore: balance, eventRevisionBefore: 3 };

describe("collection funds identity V3", () => {
  test.each([{ vendorOrganizationId: id(90) }, { currency: "JPY" },
    { vendorOrganizationId: id(90), currency: "JPY", invoiceId: id(91), organizationId: id(92), expectationId: id(93) }])(
    "denies the same funds with changed vendor, currency or invoice %j", fields => {
      expect(() => assertDistinctCollectionFunds([allocation(1), allocation(2, fields)])).toThrow("already have an approved allocation");
    });
  test.each([{ issuerNamespace: "Another proven issuer" }, { accountNamespace: "Another proven account" },
    { transactionReference: "Transaction-2" }])("permits distinct evidenced identities %j", fields => {
      expect(assertDistinctCollectionFunds([allocation(1), allocation(2, fields)])).toHaveLength(2);
    });
  test("one statement can support distinct exact transactions without a file-key collision", () => {
    const rows = [allocation(1), allocation(2, { transactionReference: "Transaction-2" })];
    expect(assertDistinctCollectionFunds(rows)).toHaveLength(2);
    expect(calculateCollectionLedger({ ...scope, vendorOrganizationId: id(5), internalOrganizationId: id(6),
      expectedMinorUnits: 10000, currency: "USD", sourceDigest: digest, allocations: rows }).outstandingMinorUnits).toBe(2000);
    expect(() => assertDistinctCollectionFunds([allocation(1), allocation(2, { evidenceLocator: "Copied statement page 9" })])).toThrow();
  });
  test("keys reject outer whitespace and preserve reference case", () => {
    const key = collectionFundsIdentityKey({ ...identity, internalOrganizationId: id(6) });
    expect(() => collectionFundsIdentityKey({ ...identity, internalOrganizationId: id(6), accountNamespace: ` ${identity.accountNamespace} ` })).toThrow();
    expect(collectionFundsIdentityKey({ ...identity, internalOrganizationId: id(6), transactionReference: "transaction-1" })).not.toBe(key);
    expect(() => collectionFundsIdentityKey({ ...identity, internalOrganizationId: id(6), vendorOrganizationId: id(90) })).toThrow();
  });
  test.each([" ", "\t", "\r", "\n", "\u00a0", "\ufeff"])("rejects outer whitespace %j without trimming", whitespace => {
    for (const field of ["issuerNamespace", "accountNamespace", "transactionReference"] as const) {
      for (const value of [`${whitespace}Exact`, `Exact${whitespace}`]) {
        expect(() => collectionFundsIdentityKey({ ...identity, internalOrganizationId: id(6), [field]: value })).toThrow();
      }
    }
  });
  test("preserves Unicode normalization forms and supplementary characters exactly", () => {
    const first = collectionFundsIdentityKey({ ...identity, internalOrganizationId: id(6), transactionReference: "\u00e9" });
    const second = collectionFundsIdentityKey({ ...identity, internalOrganizationId: id(6), transactionReference: "e\u0301" });
    expect(first).not.toBe(second);
    expect(collectionFundsIdentityKey({ ...identity, internalOrganizationId: id(6), transactionReference: "\ud83d\ude80" })).toContain("\ud83d\ude80");
    expect(() => collectionFundsIdentityKey({ ...identity, internalOrganizationId: id(6), transactionReference: "\ud83d\ude80".repeat(64) })).toThrow();
    expect(collectionFundsIdentityKey({ ...identity, internalOrganizationId: id(6), transactionReference: "\ud83d\ude80".repeat(63) })).toContain("\ud83d\ude80");
  });
  test.each(["\ud800", "\udfff", "A\ud800B", "A\udfffB", "\ud800\ud800", "\udfff\ud800"])(
    "rejects malformed UTF-16 identity %j", value => {
      expect(() => collectionFundsIdentityKey({ ...identity, internalOrganizationId: id(6), transactionReference: value })).toThrow();
    });
  test.each(["A\x00B", "A\x1fB", "A\x7fB", "A\x80B", "A\x9fB"])("rejects identity control characters %j", value => {
    expect(() => collectionFundsIdentityKey({ ...identity, internalOrganizationId: id(6), accountNamespace: value })).toThrow();
  });
  test("retains unverified memo evidence as pending input without allocation eligibility", () => {
    const pending = { ...report, referenceUniqueness: "unverified", uniquenessEvidenceReference: null, transactionReference: "Memo or check number" };
    expect(managedCollectionCommandSchema.parse(pending).action).toBe("report_received_payment");
    expect(() => assertDistinctCollectionFunds([allocation(1, { referenceUniqueness: "unverified", uniquenessEvidenceReference: null })])).toThrow();
    expect(collectionReportedIdentitySchema.safeParse({ ...identity, referenceUniqueness: "issuer_account_guaranteed", uniquenessEvidenceReference: null }).success).toBe(false);
    expect(managedCollectionCommandSchema.safeParse({ ...pending, issuerNamespace: "" }).success).toBe(false);
    expect(managedCollectionCommandSchema.parse({ ...pending, issuerNamespace: null, accountNamespace: null,
      transactionReference: null }).action).toBe("report_received_payment");
    expect(managedCollectionCommandSchema.safeParse({ ...report, accountNamespace: null }).success).toBe(false);
  });
  test("bounds exact identity bytes without truncation or case folding", () => {
    expect(collectionFundsIdentityKey({ ...identity, internalOrganizationId: id(6), transactionReference: "x".repeat(255) })).toContain("x".repeat(255));
    expect(() => collectionFundsIdentityKey({ ...identity, internalOrganizationId: id(6), transactionReference: "x".repeat(256) })).toThrow();
    expect(() => collectionFundsIdentityKey({ ...identity, internalOrganizationId: id(6), accountNamespace: "界".repeat(86) })).toThrow();
  });
});

describe("scoped receipt source and immutable request V3", () => {
  test("does not widen either existing commercial source class", () => {
    expect(financeDocumentSourceSchema.parse({ sourceClass: "agreement", vendorOrganizationId: id(5) }).sourceClass).toBe("agreement");
    expect(financeDocumentSourceSchema.parse({ sourceClass: "signed_contract", vendorOrganizationId: id(5), contractId: id(7), handoffId: id(8), dealId: id(9) }).sourceClass).toBe("signed_contract");
    expect(financeDocumentSourceSchema.safeParse(binding).success).toBe(false);
    expect(collectionReceiptSourceSchema.parse(binding).issuedSourceDigest).toBe(binding.issuedSourceDigest);
  });
  test.each([{ invoiceId: id(90) }, { customerOrganizationId: id(90) }, { commissionEventId: id(90) },
    { actorIdentityId: id(90) }, { issuedSourceDigest: null }, { issuedSourceDigest: "USD" }])("rejects crossed or malformed receipt binding %j", fields => {
    expect(managedCollectionCommandSchema.safeParse({ ...report, sourceBinding: { ...binding, ...fields } }).success).toBe(false);
  });
  test("does not accept customer/vendor workspace ownership for a receipt", () => {
    const upload = { organizationId: id(6), documentId: id(11), versionId: id(12), expectedVersion: 0,
      source: binding, correlationId: id(9), idempotencyKey: id(10), fileName: "Synthetic.pdf",
      declaredMimeType: "application/pdf", byteSize: 12, sha256: digest };
    expect(collectionReceiptUploadPreparationSchema.parse(upload).source).toEqual(binding);
    for (const organizationId of [id(1), id(5)]) {
      expect(managedCollectionCommandSchema.safeParse({ ...report, source: { ...report.source, organizationId } }).success).toBe(false);
      expect(collectionReceiptUploadPreparationSchema.safeParse({ ...upload, organizationId }).success).toBe(false);
    }
  });
  test.each([{ reason: "Changed reason" }, { idempotencyKey: id(90) }, { evidenceLocator: "Page 2 transaction 1" },
    { accountNamespace: "Changed account" }, { amountMinorUnits: 3999 }, { receivedAt: "2026-10-03T10:00:00.000002Z" },
    { sourceBinding: { ...binding, preparationId: id(90) } }, { expectedLiveSourceDigest: "1".repeat(64) }])(
    "rejects complete original result reuse with a changed immutable field %j", fields => {
      expect(() => verifyManagedCollectionResult({ ...reportResult, outcomeCode: "replayed" }, { ...report, ...fields })).toThrow();
    });
  test("keeps a historical observed digest separate from a newer live observation", () => {
    expect(verifyManagedCollectionResult({ ...reportResult, outcomeCode: "replayed" }, report).observedSourceDigest).toBe(liveDigest);
    expect(() => verifyManagedCollectionResult({ ...reportResult, observedSourceDigest: "1".repeat(64) }, report)).toThrow();
  });
  test.each(["reportRows", "allocations", "approvedReceivedMinorUnits", "balance", "financialClosureApproved"])(
    "rejects legacy caller-controlled reconciliation authority %s", key => {
      const request = { ...scope, correlationId: id(9), idempotencyKey: id(10), reason: "Record actual stored reconciliation",
        action: "record_reconciliation", reconciliationId: id(90), expectedExpectationRevision: 1,
        expectedSourceDigest: digest, expectedLiveSourceDigest: liveDigest, expectedLedgerRevision: 0,
        expectedLedgerDigest: ledgerDigest, expectedEventRevision: 3 };
      expect(managedCollectionCommandSchema.safeParse({ ...request, [key]: [] }).success).toBe(false);
    });
});
