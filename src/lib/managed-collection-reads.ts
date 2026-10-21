import { z } from "zod";
import { compareManagedFinanceInstants, contractValueFactSchema, financeSourceReferenceSchema, managedFinanceInstantSchema } from "@/lib/managed-finance-workflow";
import { workspaceDocumentRowSchema } from "@/lib/workspace-documents";
import { collectionReceiptSourceSchema } from "./managed-collection-source";
import { assertDistinctCollectionFunds, collectionReportedIdentitySchema, collectionAllocationSchema, collectionBalanceSchema, collectionCounterSchema, collectionCurrencySchema,
  collectionHashSchema, collectionMoneySchema, collectionPositiveMoneySchema, collectionRevisionSchema,
  collectionScope, collectionTextSchema, collectionUuidSchema } from "./managed-collection-ledger";

const envelope = { organizationId: collectionUuidSchema, correlationId: collectionUuidSchema };
const exactScope = { ...collectionScope, ...envelope };
export const managedCollectionPageRequestSchema = z.strictObject({ ...envelope, afterInvoiceId: collectionUuidSchema.optional() });
export const managedCollectionDetailRequestSchema = z.strictObject({ ...envelope,
  commissionEventId: collectionUuidSchema, invoiceId: collectionUuidSchema });
export const managedCollectionHistoryRequestSchema = z.strictObject({ ...exactScope,
  view: z.enum(["receipts", "allocations", "reconciliations"]), afterId: collectionUuidSchema.optional() });
const original = financeSourceReferenceSchema.extend({ originalVersion: collectionRevisionSchema,
  currentDocumentVersion: collectionRevisionSchema,
  document: workspaceDocumentRowSchema.safeExtend({ state: z.enum(["approved", "superseded"]), failureCode: z.null() }),
}).refine(value => value.document.documentId === value.documentId && value.document.versionId === value.versionId
  && value.document.version === value.originalVersion && value.currentDocumentVersion >= value.originalVersion
  && value.document.isCurrent === (value.currentDocumentVersion === value.originalVersion), "Invalid collection original metadata");
const receiptOriginal = original.safeExtend({ sourceBinding: collectionReceiptSourceSchema });
const liveSource = { liveSourceDigest: collectionHashSchema.nullable(), sourceCurrent: z.boolean() };
const basis = z.strictObject({ organizationId: collectionUuidSchema, commissionEventId: collectionUuidSchema,
  invoiceId: collectionUuidSchema, preparationId: collectionUuidSchema, calculationId: collectionUuidSchema,
  internalOrganizationId: collectionUuidSchema, vendorOrganizationId: collectionUuidSchema,
  contractId: collectionUuidSchema, handoffId: collectionUuidSchema, dealId: collectionUuidSchema,
  invoiceRevision: collectionRevisionSchema, eventRevision: collectionRevisionSchema, calculationRevision: collectionRevisionSchema,
  invoiceNumber: collectionTextSchema, amountMinorUnits: collectionMoneySchema, currency: collectionCurrencySchema,
  issueDate: managedFinanceInstantSchema, dueDate: managedFinanceInstantSchema, issuedAt: managedFinanceInstantSchema,
  collectionTerms: collectionTextSchema, contractValue: contractValueFactSchema,
  sourceDigest: collectionHashSchema, issuedSourceDigest: collectionHashSchema, supportingOriginals: z.array(original).min(2).max(10),
}).superRefine((value, context) => {
  if (![value.issueDate, value.dueDate, value.issuedAt].every(time => managedFinanceInstantSchema.safeParse(time).success)) return;
  const keys = value.supportingOriginals.map(row => `${row.organizationId}/${row.documentId}/${row.versionId}`);
  if (value.organizationId === value.internalOrganizationId || value.vendorOrganizationId === value.internalOrganizationId
    || value.vendorOrganizationId === value.organizationId || new Set(keys).size !== keys.length
    || value.supportingOriginals.some(row => ![value.organizationId, value.internalOrganizationId].includes(row.organizationId))
    || !value.supportingOriginals.some(row => row.organizationId === value.organizationId)
    || !value.supportingOriginals.some(row => row.organizationId === value.internalOrganizationId)
    || compareManagedFinanceInstants(value.dueDate, value.issueDate) < 0
    || compareManagedFinanceInstants(value.issuedAt, value.issueDate) < 0) {
    context.addIssue({ code: "custom", message: "Invalid issued collection source binding" });
  }
});
const receiptBlocker = z.enum(["unsupported_transaction_identity", "stale_source", "revoked_preparer",
  "duplicate_transaction_identity", "insufficient_balance"]);
export const managedCollectionReceiptSchema = z.strictObject({ ...collectionScope,
  receiptId: collectionUuidSchema, receiptRevision: z.union([z.literal(1), z.literal(2)]), state: z.enum(["pending", "approved", "rejected"]),
  receiptDigest: collectionHashSchema, sourceDigest: collectionHashSchema,
  amountMinorUnits: collectionPositiveMoneySchema, currency: collectionCurrencySchema,
  receivedAt: managedFinanceInstantSchema, ...collectionReportedIdentitySchema.shape, evidenceLocator: collectionTextSchema, original: receiptOriginal,
  reportedByIdentityId: collectionUuidSchema, reportedByLabel: collectionTextSchema, reportedAt: managedFinanceInstantSchema,
  decidedByIdentityId: collectionUuidSchema.nullable(), decidedByLabel: collectionTextSchema.nullable(), decidedAt: managedFinanceInstantSchema.nullable(),
  allocationId: collectionUuidSchema.nullable(), sourceCurrent: z.boolean(), preparerCurrent: z.boolean(),
  blockerCodes: z.array(receiptBlocker).max(5), canApprove: z.boolean(), canReject: z.boolean(),
}).superRefine((value, context) => {
  const times = [value.receivedAt, value.reportedAt, ...(value.decidedAt === null ? [] : [value.decidedAt])];
  if (!times.every(time => managedFinanceInstantSchema.safeParse(time).success)) return;
  const pending = value.state === "pending";
  if (new Set(value.blockerCodes).size !== value.blockerCodes.length
    || pending && value.referenceUniqueness === "unverified" && !value.blockerCodes.includes("unsupported_transaction_identity")
    || (value.referenceUniqueness === "issuer_account_guaranteed") !== (value.uniquenessEvidenceReference !== null)
    || value.referenceUniqueness === "issuer_account_guaranteed"
      && (value.issuerNamespace === null || value.accountNamespace === null || value.transactionReference === null)
    || value.state === "approved" && value.referenceUniqueness !== "issuer_account_guaranteed"
    || value.receiptRevision !== (pending ? 1 : 2)
    || pending && (value.decidedByIdentityId !== null || value.decidedByLabel !== null || value.decidedAt !== null)
    || !pending && (value.decidedByIdentityId === null || value.decidedByLabel === null || value.decidedAt === null
      || value.decidedByIdentityId === value.reportedByIdentityId)
    || (value.state === "approved") !== (value.allocationId !== null)
    || compareManagedFinanceInstants(value.receivedAt, value.reportedAt) > 0
    || value.decidedAt !== null && compareManagedFinanceInstants(value.decidedAt, value.reportedAt) < 0
    || (value.canApprove || value.canReject) && !pending
    || value.canApprove && (!value.canReject || !value.sourceCurrent || !value.preparerCurrent
      || value.referenceUniqueness !== "issuer_account_guaranteed" || value.blockerCodes.length > 0)) {
    context.addIssue({ code: "custom", message: "Invalid independent collection receipt decision" });
  }
});
const expectation = z.strictObject({ expectationId: collectionUuidSchema, revision: z.literal(1),
  confirmedByIdentityId: collectionUuidSchema, confirmedByLabel: collectionTextSchema, confirmedAt: managedFinanceInstantSchema,
  confirmationReference: collectionTextSchema, ledgerRevision: collectionCounterSchema, ledgerDigest: collectionHashSchema,
  sourceDigest: collectionHashSchema, issuedSourceDigest: collectionHashSchema, balance: collectionBalanceSchema });
const blocker = z.enum(["unsupported_schedule", "stale_source", "unsafe_original", "inactive_vendor", "revoked_invoice_owner",
  "revoked_invoice_reviewer", "revoked_preparer", "zero_terminal_approval_required", "unsupported_transaction_identity"]);
export const managedCollectionDetailSchema = z.strictObject({ ...envelope, currentActorIdentityId: collectionUuidSchema,
  observedAt: managedFinanceInstantSchema, basis, expectation: expectation.nullable(), ...liveSource,
  invoiceOwnerCurrent: z.boolean(), invoiceReviewerCurrent: z.boolean(), blockerCodes: z.array(blocker).max(9),
  canConfirmExpectedPayment: z.boolean(), canReportReceipt: z.boolean(), canReconcile: z.boolean(), overdue: z.boolean(),
  scheduleSupport: z.literal("single_full_balance_only"), financialClosureApproved: z.literal(false) });
export function verifyManagedCollectionDetail(value: unknown, request: unknown, expectedActorIdentityId: string) {
  const input = managedCollectionDetailRequestSchema.parse(request), output = managedCollectionDetailSchema.parse(value);
  if (output.organizationId !== input.organizationId || output.correlationId !== input.correlationId
    || output.currentActorIdentityId !== collectionUuidSchema.parse(expectedActorIdentityId)
    || output.basis.organizationId !== input.organizationId || output.basis.invoiceId !== input.invoiceId
    || output.basis.commissionEventId !== input.commissionEventId
    || new Set(output.blockerCodes).size !== output.blockerCodes.length) throw new Error("Invalid collection detail binding");
  if (output.sourceCurrent && output.liveSourceDigest === null) throw new Error("Missing current collection source observation");
  if (compareManagedFinanceInstants(output.observedAt, output.basis.issuedAt) < 0) throw new Error("Collection read predates issuance");
  const current = output.expectation;
  if (current !== null && (compareManagedFinanceInstants(current.confirmedAt, output.basis.issuedAt) < 0
    || compareManagedFinanceInstants(current.confirmedAt, output.observedAt) > 0)) throw new Error("Invalid expectation confirmation chronology");
  if (current !== null && (current.balance.expectedMinorUnits !== output.basis.amountMinorUnits || current.balance.currency !== output.basis.currency
    || current.sourceDigest !== output.basis.sourceDigest || current.issuedSourceDigest !== output.basis.issuedSourceDigest
    || current.ledgerRevision === 0 && current.balance.approvedReceivedMinorUnits !== 0
    || current.ledgerRevision > 0 && current.balance.approvedReceivedMinorUnits === 0)) throw new Error("Invalid collection balance source");
  const ready = output.sourceCurrent && output.invoiceOwnerCurrent && output.invoiceReviewerCurrent;
  if (output.canConfirmExpectedPayment && (current !== null || !ready || output.blockerCodes.some(code => code !== "zero_terminal_approval_required"))
    || output.canReportReceipt && (current === null || !ready || output.blockerCodes.length > 0 || current.balance.outstandingMinorUnits === 0)
    || output.canReconcile && (current === null || !ready || output.blockerCodes.some(code => code !== "zero_terminal_approval_required"))) {
    throw new Error("Invalid collection action availability");
  }
  const outstanding = current?.balance.outstandingMinorUnits ?? output.basis.amountMinorUnits;
  if (output.overdue !== (outstanding > 0 && compareManagedFinanceInstants(output.observedAt, output.basis.dueDate) > 0)) {
    throw new Error("Invalid exact collection overdue indicator");
  }
  return output;
}
const queueRow = z.strictObject({ invoiceId: collectionUuidSchema, commissionEventId: collectionUuidSchema,
  vendorOrganizationId: collectionUuidSchema, vendorLabel: collectionTextSchema, invoiceNumber: collectionTextSchema,
  amountMinorUnits: collectionMoneySchema, currency: collectionCurrencySchema, dueDate: managedFinanceInstantSchema,
  contractValue: contractValueFactSchema, expectationId: collectionUuidSchema.nullable(), balance: collectionBalanceSchema.nullable(),
  ...liveSource, blockerCodes: z.array(blocker).max(9) }).refine(value =>
  new Set(value.blockerCodes).size === value.blockerCodes.length
  && (!value.sourceCurrent || value.liveSourceDigest !== null)
  && (value.expectationId === null) === (value.balance === null) && (value.balance === null
    || value.balance.expectedMinorUnits === value.amountMinorUnits && value.balance.currency === value.currency), "Invalid collection queue balance");
export const managedCollectionPageSchema = z.strictObject({ ...envelope, currentActorIdentityId: collectionUuidSchema,
  items: z.array(queueRow).max(25), nextCursor: collectionUuidSchema.nullable(), scheduleSupport: z.literal("single_full_balance_only") });
function orderedPage(ids: string[], after: string | undefined, cursor: string | null) {
  return ids.every((id, index) => id > (index === 0 ? after ?? "" : ids[index - 1]))
    && (cursor === null || ids.length === 25 && cursor === ids[24]);
}
export function verifyManagedCollectionPage(value: unknown, request: unknown, actor: string) {
  const input = managedCollectionPageRequestSchema.parse(request), output = managedCollectionPageSchema.parse(value);
  if (input.organizationId !== output.organizationId || input.correlationId !== output.correlationId
    || collectionUuidSchema.parse(actor) !== output.currentActorIdentityId
    || !orderedPage(output.items.map(row => row.invoiceId), input.afterInvoiceId, output.nextCursor)) throw new Error("Invalid collection queue page");
  return output;
}
const reconciliation = z.strictObject({ ...collectionScope, reconciliationId: collectionUuidSchema, revision: z.literal(1),
  sourceDigest: collectionHashSchema, ledgerDigest: collectionHashSchema, ledgerRevision: collectionCounterSchema,
  recordedAt: managedFinanceInstantSchema, recordedByIdentityId: collectionUuidSchema, recordedByLabel: collectionTextSchema,
  allocationCount: collectionCounterSchema, balance: collectionBalanceSchema }).refine(value =>
  value.ledgerRevision === value.allocationCount
  && (value.ledgerRevision === 0) === (value.balance.approvedReceivedMinorUnits === 0),
  "Reconciliation must bind every positive immutable allocation");
const historyEnvelope = { ...exactScope, currentActorIdentityId: collectionUuidSchema, nextCursor: collectionUuidSchema.nullable(),
  internalOrganizationId: collectionUuidSchema, vendorOrganizationId: collectionUuidSchema,
  sourceDigest: collectionHashSchema, issuedSource: collectionReceiptSourceSchema, ledgerRevision: collectionCounterSchema, ledgerDigest: collectionHashSchema,
  balance: collectionBalanceSchema, ...liveSource, invoiceOwnerCurrent: z.boolean(), invoiceReviewerCurrent: z.boolean() };
export const managedCollectionHistorySchema = z.discriminatedUnion("view", [
  z.strictObject({ ...historyEnvelope, view: z.literal("receipts"), items: z.array(managedCollectionReceiptSchema).max(25) }),
  z.strictObject({ ...historyEnvelope, view: z.literal("allocations"), items: z.array(collectionAllocationSchema).max(25) }),
  z.strictObject({ ...historyEnvelope, view: z.literal("reconciliations"), items: z.array(reconciliation).max(25) }),
]);
export function verifyManagedCollectionHistory(value: unknown, request: unknown, actor: string) {
  const input = managedCollectionHistoryRequestSchema.parse(request), output = managedCollectionHistorySchema.parse(value);
  for (const key of ["organizationId", "commissionEventId", "invoiceId", "expectationId", "correlationId", "view"] as const) {
    if (input[key] !== output[key]) throw new Error("Invalid collection history binding");
  }
  if (output.internalOrganizationId === input.organizationId || output.internalOrganizationId === output.vendorOrganizationId
    || output.issuedSource.customerOrganizationId !== input.organizationId
    || output.issuedSource.commissionEventId !== input.commissionEventId || output.issuedSource.invoiceId !== input.invoiceId
    || output.issuedSource.vendorOrganizationId !== output.vendorOrganizationId
    || output.sourceCurrent && output.liveSourceDigest === null) throw new Error("Invalid historical issued source or live observation");
  if (output.currentActorIdentityId !== collectionUuidSchema.parse(actor)) throw new Error("Invalid collection history actor");
  if ((output.ledgerRevision === 0) !== (output.balance.approvedReceivedMinorUnits === 0)) {
    throw new Error("Invalid current history ledger balance");
  }
  if (output.view === "allocations") {
    assertDistinctCollectionFunds(output.items);
    if (new Set(output.items.map(row => row.ledgerRevision)).size !== output.items.length
      || new Set(output.items.map(row => row.receiptId)).size !== output.items.length) {
      throw new Error("Duplicate immutable allocation history evidence");
    }
  }
  const ids = output.items.map(row => "receiptRevision" in row ? row.receiptId : "allocationId" in row ? row.allocationId : row.reconciliationId);
  if (!orderedPage(ids, input.afterId, output.nextCursor)) throw new Error("Invalid collection history cursor");
  for (const row of output.items) {
    for (const key of ["organizationId", "commissionEventId", "invoiceId", "expectationId"] as const) {
      if (row[key] !== input[key]) throw new Error("Invalid collection history row scope");
    }
    if ("reportedByIdentityId" in row && (row.canApprove || row.canReject) && row.reportedByIdentityId === output.currentActorIdentityId) {
      throw new Error("Collection receipt review must be independent");
    }
    if ("reportedByIdentityId" in row && (row.original.organizationId !== output.internalOrganizationId
      || JSON.stringify(row.original.sourceBinding) !== JSON.stringify(output.issuedSource)
      || row.currency !== output.balance.currency || row.sourceDigest !== output.sourceDigest
      || row.canApprove && (!output.sourceCurrent || !output.invoiceOwnerCurrent || !output.invoiceReviewerCurrent
        || row.amountMinorUnits > output.balance.outstandingMinorUnits))) throw new Error("Invalid receipt original or approval availability");
    if ("ledgerRevision" in row && "allocationId" in row && (row.internalOrganizationId !== output.internalOrganizationId
      || row.vendorOrganizationId !== output.vendorOrganizationId || row.currency !== output.balance.currency
      || row.sourceDigest !== output.sourceDigest || row.ledgerRevision > output.ledgerRevision
      || row.amountMinorUnits > output.balance.approvedReceivedMinorUnits)) throw new Error("Invalid collection allocation history");
    if ("allocationCount" in row && (row.sourceDigest !== output.sourceDigest || row.balance.currency !== output.balance.currency
      || row.balance.expectedMinorUnits !== output.balance.expectedMinorUnits || row.ledgerRevision > output.ledgerRevision
      || row.balance.approvedReceivedMinorUnits > output.balance.approvedReceivedMinorUnits
      || row.ledgerRevision < output.ledgerRevision && row.balance.approvedReceivedMinorUnits >= output.balance.approvedReceivedMinorUnits
      || row.ledgerRevision === output.ledgerRevision && (row.ledgerDigest !== output.ledgerDigest
        || JSON.stringify(row.balance) !== JSON.stringify(output.balance)))) {
      throw new Error("Invalid original reconciliation history");
    }
  }
  return output;
}
