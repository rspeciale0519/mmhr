import { randomUUID } from "node:crypto";
import { describe, expect, test } from "vitest";
import { managedInvoiceCommandSchema, verifyManagedInvoiceResult, verifyManagedInvoiceOwners, verifyManagedInvoiceSource,
  verifyManagedInvoiceDetail } from "./managed-invoice";

const uuid = () => randomUUID();
const sources = [0, 1].map(() => ({ organizationId: uuid(), documentId: uuid(), versionId: uuid(), sha256: "a".repeat(64) }));
const base = { organizationId: uuid(), correlationId: uuid(), idempotencyKey: uuid(), reason: "Synthetic invoice preparation",
  invoiceId: uuid(), preparationId: uuid(), commissionEventId: uuid(), expectedEventRevision: 2, expectedInvoiceRevision: 0, expectedSourceDigest: "b".repeat(64) };
const prepare = { ...base, action: "prepare_invoice", calculationId: uuid(), ownerIdentityId: uuid(), invoiceNumber: "INV-SYNTHETIC-1",
  issueDate: "2026-10-03T09:00:00.000001Z", dueDate: "2026-10-03T09:00:00.000002Z", collectionTerms: "Due on the recorded due date", supportingSources: sources };
const decision = { ...base, expectedInvoiceRevision: 1, action: "approve_invoice", expectedPreparationRevision: 1,
  contentsReviewed: true, reviewReference: "Exact originals reviewed", reviewedSources: sources.map(source => ({ ...source, reviewedAccessId: uuid() })) };
const issue = { ...base, action: "issue_invoice", expectedInvoiceRevision: 2, expectedPreparationRevision: 2 };
function result(request: typeof base & { action: string }, outcomeCode = "recorded") {
  return { organizationId: request.organizationId, correlationId: request.correlationId, invoiceId: request.invoiceId,
    preparationId: request.preparationId, commissionEventId: request.commissionEventId, action: request.action,
    preparationRevision: request.action === "prepare_invoice" ? 1 : 2,
    invoiceRevision: request.expectedInvoiceRevision + (request.action === "reject_invoice" ? 0 : 1),
    eventRevision: request.expectedEventRevision + (request.action === "issue_invoice" ? 1 : 0),
    status: request.action === "approve_invoice" ? "ready" : request.action === "issue_invoice" ? "issued" : "draft", outcomeCode };
}
describe("managed invoice contract", () => {
  test.each([prepare, decision, { ...decision, action: "reject_invoice" }, issue])("accepts one exact action and immutable original result: $action", request => {
    expect(managedInvoiceCommandSchema.parse(request).action).toBe(request.action);
    expect(verifyManagedInvoiceResult(result(request), request).outcomeCode).toBe("recorded");
    expect(verifyManagedInvoiceResult(result(request, "replayed"), request).outcomeCode).toBe("replayed");
  });
  test.each(["actorIdentityId", "amountMinorUnits", "currency", "approvedByIdentityId", "state", "extra"])("rejects caller authority field %s", key => {
    expect(managedInvoiceCommandSchema.safeParse({ ...prepare, [key]: key === "amountMinorUnits" ? 0 : uuid() }).success).toBe(false);
  });
  test("uses microsecond due-date ordering", () => {
    expect(managedInvoiceCommandSchema.safeParse({ ...prepare, dueDate: "2026-10-03T09:00:00.000000Z" }).success).toBe(false);
    expect(managedInvoiceCommandSchema.safeParse({ ...prepare, dueDate: prepare.issueDate }).success).toBe(true);
  });
  test.each([[], [sources[0]], [sources[0], sources[0]], Array(11).fill(sources[0])])("rejects missing, repeated or unbounded sources", supportingSources => {
    expect(managedInvoiceCommandSchema.safeParse({ ...prepare, supportingSources }).success).toBe(false);
  });
  test("normalizes equivalent UUID spelling before duplicate detection", () => {
    expect(managedInvoiceCommandSchema.safeParse({ ...prepare, supportingSources: [sources[0], { ...sources[0], documentId: sources[0].documentId.toUpperCase() }] }).success).toBe(false);
    expect(managedInvoiceCommandSchema.parse({ ...prepare, invoiceId: prepare.invoiceId.toUpperCase() }).invoiceId).toBe(prepare.invoiceId);
  });
  test.each([{ contentsReviewed: false }, { expectedPreparationRevision: 2 }, { reviewedSources: [decision.reviewedSources[0], decision.reviewedSources[0]] }])("rejects incomplete independent review", fields => {
    expect(managedInvoiceCommandSchema.safeParse({ ...decision, ...fields }).success).toBe(false);
  });
  test.each(["organizationId", "correlationId", "invoiceId", "preparationId", "commissionEventId"])("rejects response target mismatch %s", key => {
    expect(() => verifyManagedInvoiceResult({ ...result(prepare), [key]: uuid() }, prepare)).toThrow();
  });
  test.each([{ status: "ready" }, { invoiceRevision: 3 }, { eventRevision: 3 }, { preparationRevision: 2 }, { extra: true }])("rejects changed original preparation result", fields => {
    expect(() => verifyManagedInvoiceResult({ ...result(prepare, "replayed"), ...fields }, prepare)).toThrow();
  });
  test("requires original issue result and increments only issue event revision", () => {
    expect(verifyManagedInvoiceResult(result(issue, "replayed"), issue).eventRevision).toBe(3);
    expect(() => verifyManagedInvoiceResult({ ...result(issue), status: "paid" }, issue)).toThrow();
    expect(() => verifyManagedInvoiceResult({ ...result(issue), eventRevision: 2 }, issue)).toThrow();
  });
  test("validates owner cursor after ordering and returns only exact selected event", () => {
    const request = { organizationId: base.organizationId, correlationId: uuid(), commissionEventId: base.commissionEventId };
    const owners = Array.from({ length: 25 }, () => ({ identityId: uuid(), label: "Synthetic staff" })).sort((a, b) => a.identityId.localeCompare(b.identityId));
    const page = { ...request, owners, nextCursor: owners[24].identityId };
    expect(verifyManagedInvoiceOwners(page, request).owners).toHaveLength(25);
    expect(() => verifyManagedInvoiceOwners({ ...page, owners: owners.slice(0, 24) }, request)).toThrow();
    expect(() => verifyManagedInvoiceOwners({ ...page, owners: [...owners].reverse() }, request)).toThrow();
    expect(() => verifyManagedInvoiceOwners({ ...page, commissionEventId: uuid() }, request)).toThrow();
  });
  test("retains known zero source amounts and rejects changed source output", () => {
    const request = { organizationId: base.organizationId, correlationId: uuid(), commissionEventId: base.commissionEventId,
      calculationId: prepare.calculationId, supportingSources: sources };
    const value = { ...request, eventRevision: 2, calculationRevision: 1, sourceDigest: base.expectedSourceDigest, amountMinorUnits: 0, currency: "USD" };
    expect(verifyManagedInvoiceSource(value, request).amountMinorUnits).toBe(0);
    for (const fields of [{ amountMinorUnits: null }, { currency: "ZZZ" }, { supportingSources: [...sources].reverse() }, { calculationId: uuid() }]) {
      expect(() => verifyManagedInvoiceSource({ ...value, ...fields }, request)).toThrow();
    }
  });
  test.each([prepare, decision, { ...decision, action: "reject_invoice" }, issue])("accepts largest valid expected revisions and their committed original result: $action", original => {
    const request = { ...original, expectedEventRevision: 2_147_483_646, expectedInvoiceRevision: 2_147_483_646 };
    expect(managedInvoiceCommandSchema.parse(request).expectedEventRevision).toBe(2_147_483_646);
    expect(verifyManagedInvoiceResult(result(request), request).invoiceRevision).toBe(request.action === "reject_invoice" ? 2_147_483_646 : 2_147_483_647);
    expect(verifyManagedInvoiceResult(result(request, "replayed"), request).eventRevision).toBe(request.action === "issue_invoice" ? 2_147_483_647 : 2_147_483_646);
    expect(managedInvoiceCommandSchema.safeParse({ ...request, expectedInvoiceRevision: 2_147_483_647 }).success).toBe(false);
    expect(managedInvoiceCommandSchema.safeParse({ ...request, expectedEventRevision: 2_147_483_647 }).success).toBe(false);
    expect(() => verifyManagedInvoiceResult({ ...result(request), invoiceRevision: 2_147_483_648 }, request)).toThrow();
    expect(() => verifyManagedInvoiceResult({ ...result(request), eventRevision: 2_147_483_648 }, request)).toThrow();
  });
  test("reads maximum persisted source event and calculation revisions without permitting overflow", () => {
    const request = { organizationId: base.organizationId, correlationId: uuid(), commissionEventId: base.commissionEventId,
      calculationId: prepare.calculationId, supportingSources: sources };
    const value = { ...request, eventRevision: 2_147_483_647, calculationRevision: 2_147_483_647, sourceDigest: base.expectedSourceDigest,
      amountMinorUnits: 0, currency: "USD" };
    expect(verifyManagedInvoiceSource(value, request).calculationRevision).toBe(2_147_483_647);
    expect(() => verifyManagedInvoiceSource({ ...value, eventRevision: 2_147_483_648 }, request)).toThrow();
    expect(() => verifyManagedInvoiceSource({ ...value, calculationRevision: 2_147_483_648 }, request)).toThrow();
  });
  test("reads maximum stored invoice and event revisions and rejects larger stored counters", () => {
    const request = { organizationId: base.organizationId, correlationId: uuid(), commissionEventId: base.commissionEventId, invoiceId: base.invoiceId };
    const originals = sources.map(source => ({ ...source, fileName: "synthetic.pdf", currentDocumentVersion: 1, originalVersion: 1,
      document: { documentId: source.documentId, versionId: source.versionId, version: 1, isCurrent: true, fileName: "synthetic.pdf",
        contentType: "application/pdf", byteSize: 1, state: "approved", revision: 2_147_483_647, failureCode: null,
        createdAt: prepare.issueDate, updatedAt: prepare.issueDate } }));
    const value = { organizationId: request.organizationId, correlationId: request.correlationId, commissionEventId: request.commissionEventId,
      currentActorIdentityId: uuid(), eventRevision: 2_147_483_647, eventState: "invoiced", calculationId: prepare.calculationId,
      calculationRevision: 2_147_483_647, mandatorySources: sources,
      invoice: { invoiceId: request.invoiceId, commissionEventId: request.commissionEventId, vendorOrganizationId: uuid(), invoiceRevision: 2_147_483_647,
        status: "issued", currentPreparationId: base.preparationId, invoiceNumber: prepare.invoiceNumber, issueDate: prepare.issueDate, dueDate: prepare.dueDate,
        amountMinorUnits: 0, currency: "USD" },
      currentPreparation: { preparationId: base.preparationId, revision: 2, state: "approved", ownerIdentityId: prepare.ownerIdentityId,
        ownerLabel: "Synthetic owner", preparedByIdentityId: uuid(), preparedByLabel: "Synthetic preparer", preparedAt: prepare.issueDate,
        decidedByIdentityId: uuid(), decidedByLabel: "Synthetic reviewer", decidedAt: prepare.dueDate, collectionTerms: prepare.collectionTerms,
        sourceDigest: base.expectedSourceDigest, supportingOriginals: originals, sourceCurrent: null, ownerCurrent: true, reviewerCurrent: true,
        canApprove: false, canReject: false, canIssue: false },
      preparations: [{ preparationId: base.preparationId, revision: 2, state: "approved", preparedAt: prepare.issueDate,
        preparedByLabel: "Synthetic preparer", invoiceRevisionAfterPrepare: 2_147_483_647 }], nextPreparationCursor: null };
    for (const fields of [{ eventState: "fabricated" }, { calculationId: null }, { calculationRevision: 0 }, { mandatorySources: [] },
      { mandatorySources: [sources[0], sources[0]] }, { preparations: [{ ...value.preparations[0], revision: 1 }] }]) {
      expect(() => verifyManagedInvoiceDetail({ ...value, ...fields }, request, value.currentActorIdentityId)).toThrow();
    }
    expect(() => verifyManagedInvoiceDetail(value, request, uuid())).toThrow("Invalid managed invoice detail");
    expect(() => verifyManagedInvoiceDetail({ ...value, calculationId: null, calculationRevision: 0, mandatorySources: [] },
      request, value.currentActorIdentityId)).toThrow("Invalid managed invoice detail");
    for (const missing of [{ ...sources[0], sha256: "c".repeat(64) }, { ...sources[0], versionId: uuid() }]) {
      expect(() => verifyManagedInvoiceDetail({ ...value, mandatorySources: [missing, sources[1]] },
        request, value.currentActorIdentityId)).toThrow("Invalid managed invoice mandatory originals");
    }
    for (const eventState of ["invoiced", "paid", "voided"]) {
      expect(() => verifyManagedInvoiceDetail({ ...value, eventState, invoice: { ...value.invoice, status: "ready" },
        currentPreparation: { ...value.currentPreparation, sourceCurrent: true, canIssue: true } }, request, value.currentActorIdentityId)).toThrow();
    }
    expect(verifyManagedInvoiceDetail({ ...value, eventState: "paid" }, request, value.currentActorIdentityId).invoice?.status).toBe("issued");
    const draft = { ...value, eventState: "approved", invoice: { ...value.invoice, status: "draft" },
      currentPreparation: { ...value.currentPreparation, state: "pending", revision: 1, decidedByIdentityId: null,
        decidedByLabel: null, decidedAt: null, sourceCurrent: true, canApprove: true, canReject: true },
      preparations: [{ ...value.preparations[0], state: "pending", revision: 1 }] };
    expect(verifyManagedInvoiceDetail(draft, request, value.currentActorIdentityId).currentPreparation?.canApprove).toBe(true);
    expect(() => verifyManagedInvoiceDetail({ ...draft, eventState: "pending_review" }, request, value.currentActorIdentityId)).toThrow();
    const rejected = { ...draft, currentPreparation: { ...value.currentPreparation, state: "rejected", canApprove: false,
      canReject: false }, preparations: [{ ...value.preparations[0], state: "rejected" }] };
    expect(verifyManagedInvoiceDetail(rejected, request, value.currentActorIdentityId).currentPreparation?.state).toBe("rejected");
    const unresolved = { ...value, calculationId: null, calculationRevision: 0, mandatorySources: [], invoice: null,
      currentPreparation: null, preparations: [], nextPreparationCursor: null };
    const unresolvedRequest = { organizationId: request.organizationId, correlationId: request.correlationId,
      commissionEventId: request.commissionEventId };
    expect(verifyManagedInvoiceDetail(unresolved, unresolvedRequest, value.currentActorIdentityId).calculationId).toBeNull();
    expect(() => verifyManagedInvoiceDetail({ ...unresolved, calculationRevision: 1 }, unresolvedRequest, value.currentActorIdentityId)).toThrow();
    expect(verifyManagedInvoiceDetail(value, request, value.currentActorIdentityId).invoice?.invoiceRevision).toBe(2_147_483_647);
    expect(() => verifyManagedInvoiceDetail({ ...value, invoice: { ...value.invoice, invoiceRevision: 2_147_483_648 } }, request, value.currentActorIdentityId)).toThrow();
    expect(() => verifyManagedInvoiceDetail({ ...value, eventRevision: 2_147_483_648 }, request, value.currentActorIdentityId)).toThrow();
    expect(() => verifyManagedInvoiceDetail({ ...value, calculationRevision: 2_147_483_648 }, request, value.currentActorIdentityId)).toThrow();
  });
});
