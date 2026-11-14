import { managedInvoiceDetailSchema } from "@/lib/managed-invoice";
export const invoiceId = (value: number) => `10000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
export const invoiceRequest = { organizationId: invoiceId(1), commissionEventId: invoiceId(2), correlationId: invoiceId(3) };
export const invoiceActor = invoiceId(4);
const original = (value: number, organizationId = invoiceRequest.organizationId) => ({ organizationId, documentId: invoiceId(value), versionId: invoiceId(value + 1),
  sha256: "a".repeat(64), fileName: "Synthetic invoice source.pdf", currentDocumentVersion: 1, originalVersion: 1,
  document: { documentId: invoiceId(value), versionId: invoiceId(value + 1), version: 1, isCurrent: true, fileName: "Synthetic invoice source.pdf",
    contentType: "application/pdf", byteSize: 3, state: "approved", revision: 2, failureCode: null,
    createdAt: "2026-10-03T09:00:00Z", updatedAt: "2026-10-03T10:00:00Z" } });
export function invoiceDetail(state: "empty" | "pending" | "ready" | "issued" | "rejected" = "empty") {
  const originals = [original(10), original(12, invoiceId(20))];
  const sources = originals.map(({ organizationId, documentId, versionId, sha256 }) => ({ organizationId, documentId, versionId, sha256 }));
  const invoice = { invoiceId: invoiceId(5), commissionEventId: invoiceRequest.commissionEventId, vendorOrganizationId: invoiceId(6),
    invoiceRevision: state === "ready" ? 2 : state === "issued" ? 3 : 1, status: state === "ready" ? "ready" : state === "issued" ? "issued" : "draft",
    currentPreparationId: invoiceId(7), invoiceNumber: "INV-SYNTHETIC-1", issueDate: "2026-10-03T10:00:00Z", dueDate: "2026-10-04T10:00:00Z", amountMinorUnits: 0, currency: "USD" };
  const p = { preparationId: invoiceId(7), revision: state === "pending" ? 1 : 2, state: state === "pending" ? "pending" : state === "rejected" ? "rejected" : "approved",
    ownerIdentityId: invoiceId(8), ownerLabel: "Synthetic eligible owner", preparedByIdentityId: invoiceId(9), preparedByLabel: "Synthetic preparer",
    preparedAt: "2026-10-03T09:00:00Z", decidedByIdentityId: state === "pending" ? null : invoiceId(21),
    decidedByLabel: state === "pending" ? null : "Synthetic reviewer", decidedAt: state === "pending" ? null : "2026-10-03T10:00:00Z",
    collectionTerms: "Due on the stored due date", sourceDigest: "b".repeat(64), supportingOriginals: originals,
    sourceCurrent: state === "issued" ? null : true, ownerCurrent: true, reviewerCurrent: true,
    canApprove: state === "pending", canReject: state === "pending", canIssue: state === "ready" };
  return managedInvoiceDetailSchema.parse({ ...invoiceRequest, currentActorIdentityId: invoiceActor, eventRevision: state === "issued" ? 3 : 2,
    eventState: state === "issued" ? "invoiced" : "approved", calculationId: invoiceId(22), calculationRevision: 1, mandatorySources: sources,
    invoice: state === "empty" ? null : invoice, currentPreparation: state === "empty" ? null : p,
    preparations: state === "empty" ? [] : [{ preparationId: p.preparationId, revision: p.revision, state: p.state,
      preparedAt: p.preparedAt, preparedByLabel: p.preparedByLabel, invoiceRevisionAfterPrepare: 1 }], nextPreparationCursor: null });
}
