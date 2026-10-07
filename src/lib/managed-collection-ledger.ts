import { z } from "zod";
import { proposalQuoteCurrencyCodes } from "@/lib/proposal-quote";
import { compareManagedFinanceInstants, managedFinanceInstantSchema } from "@/lib/managed-finance-workflow";

export const collectionUuidSchema = z.uuid().transform(value => value.toLowerCase());
export const collectionHashSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const collectionMoneySchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const collectionPositiveMoneySchema = collectionMoneySchema.refine(value => value > 0);
export const collectionCurrencySchema = z.enum(proposalQuoteCurrencyCodes);
export const collectionExpectedRevisionSchema = z.number().int().min(1).max(2_147_483_646);
export const collectionRevisionSchema = z.number().int().min(1).max(2_147_483_647);
export const collectionExpectedCounterSchema = z.number().int().min(0).max(2_147_483_646);
export const collectionCounterSchema = z.number().int().min(0).max(2_147_483_647);
export const collectionTextSchema = z.string().trim().min(1).max(500)
  .refine(value => !/[\x00-\x1f\x7f-\x9f]/.test(value), "Use bounded plain text");
// Identity text never uses the general trimmed prose schema.
// Unicode mode recognizes valid supplementary code points and rejects lone surrogates.
export const collectionIdentityTextSchema = z.string().min(1).max(500)
  .refine(value => value === value.trim(), "Outer identity whitespace is unsupported")
  .refine(value => !/[\x00-\x1f\x7f-\x9f]/.test(value), "Identity control characters are unsupported")
  .refine(value => !/[\uD800-\uDFFF]/u.test(value), "Malformed UTF-16 identity is unsupported")
  .refine(value => new TextEncoder().encode(value).length <= 255, "Use an exact identity field of at most 255 UTF-8 bytes");
export const collectionTransactionIdentitySchema = z.strictObject({
  referenceRule: z.literal("exact_issuer_account_reference_v1"), issuerNamespace: collectionIdentityTextSchema,
  accountNamespace: collectionIdentityTextSchema, transactionReference: collectionIdentityTextSchema,
});
export const collectionReportedIdentitySchema = z.strictObject({
  referenceRule: z.literal("exact_issuer_account_reference_v1"), issuerNamespace: collectionIdentityTextSchema.nullable(),
  accountNamespace: collectionIdentityTextSchema.nullable(), transactionReference: collectionIdentityTextSchema.nullable(),
  referenceUniqueness: z.enum(["unverified", "issuer_account_guaranteed"]),
  uniquenessEvidenceReference: collectionTextSchema.nullable(),
}).refine(value => (value.referenceUniqueness === "issuer_account_guaranteed") === (value.uniquenessEvidenceReference !== null)
  && (value.referenceUniqueness !== "issuer_account_guaranteed"
    || value.issuerNamespace !== null && value.accountNamespace !== null && value.transactionReference !== null),
  "Guaranteed account reference uniqueness requires its exact evidence reference");
export const collectionApprovedIdentitySchema = collectionTransactionIdentitySchema.safeExtend({
  referenceUniqueness: z.literal("issuer_account_guaranteed"), uniquenessEvidenceReference: collectionTextSchema,
});
export function collectionFundsIdentityKey(value: unknown) {
  const input = collectionTransactionIdentitySchema.safeExtend({ internalOrganizationId: collectionUuidSchema }).parse(value);
  return JSON.stringify([input.internalOrganizationId, input.issuerNamespace, input.accountNamespace, input.transactionReference]);
}
export const collectionScope = {
  organizationId: collectionUuidSchema, commissionEventId: collectionUuidSchema,
  invoiceId: collectionUuidSchema, expectationId: collectionUuidSchema,
};
export const collectionFinancialStateSchema = z.enum(["invoiced", "partially_paid", "paid"]);
export const collectionBalanceSchema = z.strictObject({
  expectedMinorUnits: collectionMoneySchema, approvedReceivedMinorUnits: collectionMoneySchema,
  outstandingMinorUnits: collectionMoneySchema, currency: collectionCurrencySchema,
  eventState: collectionFinancialStateSchema, collectionComplete: z.boolean(),
  zeroTerminalApprovalRequired: z.boolean(), financialClosureApproved: z.literal(false),
}).superRefine((value, context) => {
  if (BigInt(value.approvedReceivedMinorUnits) + BigInt(value.outstandingMinorUnits) !== BigInt(value.expectedMinorUnits)) {
    context.addIssue({ code: "custom", message: "Collection balance must equal its exact approved allocations" });
  }
  const zero = value.expectedMinorUnits === 0;
  const state = zero || value.approvedReceivedMinorUnits === 0 ? "invoiced"
    : value.outstandingMinorUnits === 0 ? "paid" : "partially_paid";
  if (value.eventState !== state || value.zeroTerminalApprovalRequired !== zero
    || value.collectionComplete !== (!zero && value.outstandingMinorUnits === 0)) {
    context.addIssue({ code: "custom", message: "Invalid collection state or unapproved terminal closure" });
  }
});
export const collectionAllocationSchema = z.strictObject({
  ...collectionScope, allocationId: collectionUuidSchema, receiptId: collectionUuidSchema,
  vendorOrganizationId: collectionUuidSchema, internalOrganizationId: collectionUuidSchema,
  amountMinorUnits: collectionPositiveMoneySchema, currency: collectionCurrencySchema,
  receivedAt: managedFinanceInstantSchema, approvedAt: managedFinanceInstantSchema,
  ...collectionApprovedIdentitySchema.shape, evidenceLocator: collectionTextSchema,
  sourceDigest: collectionHashSchema, ledgerRevision: collectionRevisionSchema,
}).refine(value => managedFinanceInstantSchema.safeParse(value.receivedAt).success
  && managedFinanceInstantSchema.safeParse(value.approvedAt).success
  && compareManagedFinanceInstants(value.receivedAt, value.approvedAt) <= 0,
  "A received payment cannot follow its approval time");
const ledgerInput = z.strictObject({
  ...collectionScope, vendorOrganizationId: collectionUuidSchema, internalOrganizationId: collectionUuidSchema,
  expectedMinorUnits: collectionMoneySchema, currency: collectionCurrencySchema, sourceDigest: collectionHashSchema,
  allocations: z.array(collectionAllocationSchema),
});
export type CollectionBalance = z.output<typeof collectionBalanceSchema>;
export type CollectionAllocation = z.output<typeof collectionAllocationSchema>;

// Vendor, currency, file hash and invoice are checked attributes, never uniqueness keys.
// This checks only supplied immutable allocation rows; SQL must prove global completeness.
export function assertDistinctCollectionFunds(value: unknown) {
  const rows = z.array(collectionAllocationSchema).parse(value), keys = new Set<string>();
  for (const row of rows) {
    const key = collectionFundsIdentityKey({ internalOrganizationId: row.internalOrganizationId,
      referenceRule: row.referenceRule, issuerNamespace: row.issuerNamespace,
      accountNamespace: row.accountNamespace, transactionReference: row.transactionReference });
    if (keys.has(key)) throw new Error("Collection funds already have an approved allocation");
    keys.add(key);
  }
  return rows;
}

// This computation checks supplied rows. It cannot prove stored completeness,
// source approval, actor authority, or a bank receipt.
export function calculateCollectionLedger(value: unknown): CollectionBalance {
  const input = ledgerInput.parse(value);
  assertDistinctCollectionFunds(input.allocations);
  const allocationIds = new Set<string>(), receiptIds = new Set<string>();
  let received = BigInt(0);
  for (const [index, row] of input.allocations.entries()) {
    for (const key of ["organizationId", "commissionEventId", "invoiceId", "expectationId", "vendorOrganizationId", "internalOrganizationId", "currency", "sourceDigest"] as const) {
      if (row[key] !== input[key]) throw new Error("Collection allocation scope or currency differs");
    }
    if (allocationIds.has(row.allocationId) || receiptIds.has(row.receiptId)
      || row.ledgerRevision !== index + 1) throw new Error("Collection allocations must be distinct and complete in ledger order");
    allocationIds.add(row.allocationId); receiptIds.add(row.receiptId);
    received += BigInt(row.amountMinorUnits);
    if (received > BigInt(input.expectedMinorUnits)) throw new Error("Collection allocation exceeds the issued invoice");
  }
  const outstanding = BigInt(input.expectedMinorUnits) - received;
  const zero = input.expectedMinorUnits === 0;
  return collectionBalanceSchema.parse({ expectedMinorUnits: input.expectedMinorUnits,
    approvedReceivedMinorUnits: Number(received), outstandingMinorUnits: Number(outstanding), currency: input.currency,
    eventState: zero || received === BigInt(0) ? "invoiced" : outstanding === BigInt(0) ? "paid" : "partially_paid",
    collectionComplete: !zero && outstanding === BigInt(0), zeroTerminalApprovalRequired: zero, financialClosureApproved: false });
}

export function checkCollectionReport(amount: unknown, currency: unknown, balance: unknown, receivedAt: unknown, checkedAt: unknown) {
  const parsedAmount = collectionPositiveMoneySchema.parse(amount), code = collectionCurrencySchema.parse(currency);
  const current = collectionBalanceSchema.parse(balance);
  if (code !== current.currency || parsedAmount > current.outstandingMinorUnits) throw new Error("Payment exceeds or differs from the issued invoice balance");
  if (compareManagedFinanceInstants(managedFinanceInstantSchema.parse(receivedAt), managedFinanceInstantSchema.parse(checkedAt)) > 0) {
    throw new Error("A received payment cannot be in the future");
  }
  return { amountMinorUnits: parsedAmount, currency: code };
}
