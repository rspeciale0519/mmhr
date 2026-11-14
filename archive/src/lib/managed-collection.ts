import { z } from "zod";
import { securityReasonSchema } from "@/lib/security-reason";
import { financeSourceReferenceSchema, managedFinanceInstantSchema } from "@/lib/managed-finance-workflow";
import { collectionReceiptSourceSchema } from "./managed-collection-source";
import { collectionReportedIdentitySchema, collectionBalanceSchema, collectionCounterSchema, collectionCurrencySchema, collectionExpectedCounterSchema,
  collectionExpectedRevisionSchema, collectionHashSchema, collectionPositiveMoneySchema, collectionRevisionSchema,
  collectionScope, collectionTextSchema, collectionUuidSchema } from "./managed-collection-ledger";

const metadata = { organizationId: collectionUuidSchema, correlationId: collectionUuidSchema,
  idempotencyKey: collectionUuidSchema, reason: securityReasonSchema };
const scope = { ...collectionScope, ...metadata };
const source = { expectedExpectationRevision: z.literal(1), expectedSourceDigest: collectionHashSchema,
  expectedLiveSourceDigest: collectionHashSchema };
const ledger = { expectedLedgerRevision: collectionExpectedCounterSchema, expectedLedgerDigest: collectionHashSchema };
const confirm = z.strictObject({ ...scope, action: z.literal("confirm_expected_payment"),
  expectedInvoiceRevision: collectionExpectedRevisionSchema, expectedEventRevision: collectionExpectedRevisionSchema,
  expectedSourceDigest: collectionHashSchema, expectedLiveSourceDigest: collectionHashSchema, fullBalanceTermsConfirmed: z.literal(true), confirmationReference: collectionTextSchema });
const report = z.strictObject({ ...scope, ...source, ...ledger, action: z.literal("report_received_payment"),
  receiptId: collectionUuidSchema, amountMinorUnits: collectionPositiveMoneySchema, currency: collectionCurrencySchema,
  receivedAt: managedFinanceInstantSchema, ...collectionReportedIdentitySchema.shape, evidenceLocator: collectionTextSchema,
  source: financeSourceReferenceSchema, sourceBinding: collectionReceiptSourceSchema,
}).superRefine((value, context) => {
  if (value.organizationId === value.source.organizationId || value.source.organizationId === value.sourceBinding.vendorOrganizationId
    || value.sourceBinding.customerOrganizationId !== value.organizationId
    || value.sourceBinding.commissionEventId !== value.commissionEventId || value.sourceBinding.invoiceId !== value.invoiceId
    || (value.referenceUniqueness === "issuer_account_guaranteed") !== (value.uniquenessEvidenceReference !== null)
    || value.referenceUniqueness === "issuer_account_guaranteed"
      && (value.issuerNamespace === null || value.accountNamespace === null || value.transactionReference === null)) {
    context.addIssue({ code: "custom", message: "Invalid collection receipt source or reference evidence" });
  }
});
const approve = z.strictObject({ ...scope, ...source, ...ledger, action: z.literal("approve_received_payment"),
  receiptId: collectionUuidSchema, expectedReceiptRevision: z.literal(1), expectedReceiptDigest: collectionHashSchema,
  expectedEventRevision: collectionExpectedRevisionSchema, contentsReviewed: z.literal(true),
  reviewedAccessId: collectionUuidSchema, reviewReference: collectionTextSchema,
  referenceIdentityConfirmed: z.literal(true), referenceUniquenessReviewed: z.literal(true) });
const reject = z.strictObject({ ...scope, action: z.literal("reject_received_payment"), receiptId: collectionUuidSchema,
  expectedReceiptRevision: z.literal(1), expectedReceiptDigest: collectionHashSchema });
const reconcile = z.strictObject({ ...scope, ...source, ...ledger, action: z.literal("record_reconciliation"),
  reconciliationId: collectionUuidSchema, expectedEventRevision: collectionExpectedRevisionSchema });

export const managedCollectionCommandSchema = z.discriminatedUnion("action", [confirm, report, approve, reject, reconcile]);
export type ManagedCollectionCommand = z.output<typeof managedCollectionCommandSchema>;
const result = { ...collectionScope, correlationId: collectionUuidSchema, expectationRevision: z.literal(1),
  invoiceRevision: collectionRevisionSchema, eventRevision: collectionRevisionSchema,
  ledgerRevision: collectionCounterSchema, sourceDigest: collectionHashSchema, ledgerDigest: collectionHashSchema,
  originalRequest: managedCollectionCommandSchema, requestDigest: collectionHashSchema,
  observedSourceDigest: collectionHashSchema.nullable(), balance: collectionBalanceSchema, outcomeCode: z.enum(["recorded", "replayed"]) };
const receiptResult = { ...result, receiptId: collectionUuidSchema, receiptDigest: collectionHashSchema };
export const managedCollectionResultSchema = z.discriminatedUnion("action", [
  z.strictObject({ ...result, action: z.literal("confirm_expected_payment") }),
  z.strictObject({ ...receiptResult, action: z.literal("report_received_payment"), receiptRevision: z.literal(1), receiptState: z.literal("pending"),
    balanceBefore: collectionBalanceSchema, eventRevisionBefore: collectionRevisionSchema }),
  z.strictObject({ ...receiptResult, action: z.literal("approve_received_payment"), receiptRevision: z.literal(2), receiptState: z.literal("approved"),
    allocationId: collectionUuidSchema, balanceBefore: collectionBalanceSchema, allocatedMinorUnits: collectionPositiveMoneySchema }),
  z.strictObject({ ...receiptResult, action: z.literal("reject_received_payment"), receiptRevision: z.literal(2), receiptState: z.literal("rejected"),
    balanceBefore: collectionBalanceSchema, ledgerRevisionBefore: collectionCounterSchema, ledgerDigestBefore: collectionHashSchema,
    eventRevisionBefore: collectionRevisionSchema }),
  z.strictObject({ ...result, action: z.literal("record_reconciliation"), reconciliationId: collectionUuidSchema, reconciliationRevision: z.literal(1) }),
]);
export type ManagedCollectionResult = z.output<typeof managedCollectionResultSchema>;
export function verifyManagedCollectionResult(value: unknown, request: unknown) {
  const input = managedCollectionCommandSchema.parse(request), output = managedCollectionResultSchema.parse(value);
  for (const key of ["organizationId", "commissionEventId", "invoiceId", "expectationId", "correlationId", "action"] as const) {
    if (input[key] !== output[key]) throw new Error("Invalid managed collection response binding");
  }
  if (JSON.stringify(output.originalRequest) !== JSON.stringify(input)
    || "expectedLiveSourceDigest" in input && output.observedSourceDigest !== input.expectedLiveSourceDigest
    || input.action === "reject_received_payment" && output.observedSourceDigest !== null) {
    throw new Error("Invalid complete immutable collection request or observed source");
  }
  if ("expectedSourceDigest" in input && output.sourceDigest !== input.expectedSourceDigest
    || "receiptId" in input && (!("receiptId" in output) || output.receiptId !== input.receiptId)
    || "reconciliationId" in input && (!("reconciliationId" in output) || output.reconciliationId !== input.reconciliationId)
    || "expectedReceiptDigest" in input && (!("receiptDigest" in output) || output.receiptDigest !== input.expectedReceiptDigest)) {
    throw new Error("Invalid managed collection original source or receipt");
  }
  if (input.action === "confirm_expected_payment" && (output.invoiceRevision !== input.expectedInvoiceRevision
    || output.eventRevision !== input.expectedEventRevision || output.ledgerRevision !== 0
    || output.balance.approvedReceivedMinorUnits !== 0 || output.balance.eventState !== "invoiced")) {
    throw new Error("Invalid expected payment creation result");
  }
  if ("expectedLedgerRevision" in input && output.ledgerRevision !== input.expectedLedgerRevision + (input.action === "approve_received_payment" ? 1 : 0)) {
    throw new Error("Invalid original collection ledger revision");
  }
  if ("expectedLedgerDigest" in input && input.action !== "approve_received_payment" && output.ledgerDigest !== input.expectedLedgerDigest) {
    throw new Error("Unexpected collection ledger mutation");
  }
  if (input.action === "report_received_payment" && output.action === input.action && (
    JSON.stringify(output.balanceBefore) !== JSON.stringify(output.balance) || output.eventRevision !== output.eventRevisionBefore)) {
    throw new Error("Reporting cannot allocate a receipt or mutate the event");
  }
  if (input.action === "approve_received_payment" && output.action === input.action) {
    const changesState = output.balance.eventState !== output.balanceBefore.eventState;
    if (output.balance.expectedMinorUnits === 0 || output.allocatedMinorUnits > output.balance.approvedReceivedMinorUnits
      || output.balanceBefore.currency !== output.balance.currency || output.balanceBefore.expectedMinorUnits !== output.balance.expectedMinorUnits
      || BigInt(output.balanceBefore.approvedReceivedMinorUnits) + BigInt(output.allocatedMinorUnits) !== BigInt(output.balance.approvedReceivedMinorUnits)
      || BigInt(output.balanceBefore.outstandingMinorUnits) - BigInt(output.allocatedMinorUnits) !== BigInt(output.balance.outstandingMinorUnits)
      || output.eventRevision !== input.expectedEventRevision + (changesState ? 1 : 0)) throw new Error("Invalid original approved allocation result");
  }
  if (input.action === "reject_received_payment" && output.action === input.action && (
    JSON.stringify(output.balanceBefore) !== JSON.stringify(output.balance) || output.ledgerRevision !== output.ledgerRevisionBefore
    || output.ledgerDigest !== output.ledgerDigestBefore || output.eventRevision !== output.eventRevisionBefore)) {
    throw new Error("Rejection cannot mutate the collection ledger or event");
  }
  if (input.action === "record_reconciliation" && output.eventRevision !== input.expectedEventRevision) {
    throw new Error("Reconciliation cannot mutate the event");
  }
  return output;
}
