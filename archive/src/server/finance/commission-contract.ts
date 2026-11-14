import "server-only";

import { z } from "zod";

/**
 * Provider-neutral finance values. All money uses integer minor units and an
 * explicit currency, so payment providers cannot change calculation rules.
 */
const uuid = z.string().uuid();
const timestamp = z.string().datetime({ offset: true });
const currency = z.string().regex(/^[A-Z]{3}$/);
const minorUnits = z.number().int().nonnegative().max(9_007_199_254_740_991);
const identifier = z.string().trim().min(1).max(500).regex(
  /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,499}$/,
  "Identifier contains unsupported characters",
);

export const commissionStructureSchema = z
  .object({
    structureId: uuid,
    vendorOrganizationId: uuid,
    effectiveFrom: timestamp,
    effectiveTo: timestamp.optional(),
    calculationType: z.enum(["contract_value_rate", "flat_amount"]),
    rateBasisPoints: z.number().int().min(0).max(10_000).optional(),
    flatAmountMinorUnits: minorUnits.optional(),
    currency,
    sourceAgreementId: uuid,
    revision: z.number().int().positive(),
  })
  .strict()
  .superRefine((structure, context) => {
    if (structure.effectiveTo && Date.parse(structure.effectiveTo) < Date.parse(structure.effectiveFrom)) {
      context.addIssue({ code: "custom", path: ["effectiveTo"], message: "effectiveTo must not precede effectiveFrom" });
    }

    const hasRate = structure.rateBasisPoints !== undefined;
    const hasFlatAmount = structure.flatAmountMinorUnits !== undefined;
    if (structure.calculationType === "contract_value_rate" && (!hasRate || hasFlatAmount)) {
      context.addIssue({ code: "custom", path: ["rateBasisPoints"], message: "rate structures require only rateBasisPoints" });
    }
    if (structure.calculationType === "flat_amount" && (hasRate || !hasFlatAmount)) {
      context.addIssue({ code: "custom", path: ["flatAmountMinorUnits"], message: "flat structures require only flatAmountMinorUnits" });
    }
  });

export type CommissionStructure = z.infer<typeof commissionStructureSchema>;

export const commissionEventSchema = z
  .object({
    eventId: uuid,
    idempotencyKey: uuid,
    contractId: uuid,
    dealId: uuid,
    vendorOrganizationId: uuid,
    structureId: uuid,
    signedAt: timestamp,
    currency,
    contractValueMinorUnits: minorUnits,
    commissionAmountMinorUnits: minorUnits,
    calculationRevision: z.number().int().positive(),
    state: z.enum(["pending_review", "approved", "invoiced", "partially_paid", "paid", "disputed", "adjusted", "voided", "written_off"]),
  })
  .strict();

export type CommissionEvent = z.infer<typeof commissionEventSchema>;

export const commissionStateTransitionSchema = z.strictObject({
  eventId: uuid,
  fromState: z.enum(["pending_review", "approved", "invoiced", "partially_paid", "paid", "disputed", "adjusted", "voided", "written_off"]),
  toState: z.enum(["pending_review", "approved", "invoiced", "partially_paid", "paid", "disputed", "adjusted", "voided", "written_off"]),
  actorIdentityId: uuid,
  occurredAt: timestamp,
  reason: z.string().trim().min(1).max(2_000),
  correlationId: uuid,
});

export type CommissionStateTransition = z.infer<typeof commissionStateTransitionSchema>;

export const commissionPaymentSchema = z
  .object({
    paymentId: uuid,
    commissionEventId: uuid,
    amountMinorUnits: z.number().int().positive().max(9_007_199_254_740_991),
    receivedAt: timestamp,
    state: z.enum(["received", "reversed"]),
  })
  .strict();

export type CommissionPayment = z.infer<typeof commissionPaymentSchema>;

export const invoiceStatuses = ["draft", "ready", "issued", "voided"] as const;
export type InvoiceStatus = (typeof invoiceStatuses)[number];

export const invoiceSchema = z
  .object({
    invoiceId: uuid,
    commissionEventId: uuid,
    vendorOrganizationId: uuid,
    ownerIdentityId: uuid,
    currency,
    amountMinorUnits: minorUnits,
    status: z.enum(invoiceStatuses),
    invoiceNumber: identifier.nullable(),
    issueDate: timestamp.nullable(),
    dueDate: timestamp.nullable(),
    supportingDocumentReferences: z.array(identifier).max(50),
  })
  .strict()
  .superRefine((invoice, context) => {
    if (invoice.status === "issued" && (invoice.invoiceNumber === null || invoice.issueDate === null || invoice.dueDate === null)) {
      context.addIssue({ code: "custom", path: ["status"], message: "Issued invoices require number, issue date, and due date" });
    }
    if (invoice.issueDate !== null && invoice.dueDate !== null && Date.parse(invoice.dueDate) < Date.parse(invoice.issueDate)) {
      context.addIssue({ code: "custom", path: ["dueDate"], message: "Due date cannot precede issue date" });
    }
  });

export type Invoice = z.infer<typeof invoiceSchema>;

export const invoiceIssueSchema = z
  .object({
    invoiceNumber: identifier,
    issueDate: timestamp,
    dueDate: timestamp,
  })
  .strict()
  .refine((issue) => Date.parse(issue.dueDate) >= Date.parse(issue.issueDate), {
    path: ["dueDate"],
    message: "Due date cannot precede issue date",
  });

export const disputeSchema = z
  .object({
    disputeId: uuid,
    commissionEventId: uuid,
    openedByIdentityId: uuid,
    openedAt: timestamp,
    reasonCode: z.enum(["amount", "eligibility", "duplicate", "payment", "other"]),
    reason: z.string().trim().min(1).max(2_000),
    status: z.enum(["open", "resolved", "rejected"]),
    resolvedByIdentityId: uuid.nullable(),
    resolvedAt: timestamp.nullable(),
    resolution: z.string().trim().max(2_000).nullable(),
  })
  .strict()
  .superRefine((dispute, context) => {
    const resolved = dispute.status !== "open";
    if (resolved && (dispute.resolvedByIdentityId === null || dispute.resolvedAt === null || dispute.resolution === null)) {
      context.addIssue({ code: "custom", path: ["status"], message: "Closed disputes require an approver, time, and resolution" });
    }
    if (!resolved && (dispute.resolvedByIdentityId !== null || dispute.resolvedAt !== null || dispute.resolution !== null)) {
      context.addIssue({ code: "custom", path: ["status"], message: "Open disputes cannot contain a resolution" });
    }
    if (dispute.resolvedAt !== null && Date.parse(dispute.resolvedAt) < Date.parse(dispute.openedAt)) {
      context.addIssue({ code: "custom", path: ["resolvedAt"], message: "Resolution cannot precede opening" });
    }
  });

export type CommissionDispute = z.infer<typeof disputeSchema>;

export const adjustmentSchema = z
  .object({
    adjustmentId: uuid,
    commissionEventId: uuid,
    direction: z.enum(["increase", "decrease"]),
    amountMinorUnits: z.number().int().positive().max(9_007_199_254_740_991),
    reason: z.string().trim().min(1).max(2_000),
    approvedByIdentityId: uuid,
    approvedAt: timestamp,
    createdAt: timestamp,
  })
  .strict()
  .refine((adjustment) => Date.parse(adjustment.approvedAt) >= Date.parse(adjustment.createdAt), {
    path: ["approvedAt"],
    message: "Adjustment approval cannot precede creation",
  });

export type CommissionAdjustment = z.infer<typeof adjustmentSchema>;

export const financeReportRowSchema = z
  .object({
    commissionEventId: uuid,
    currency,
    earnedMinorUnits: minorUnits,
    invoicedMinorUnits: minorUnits,
    receivedMinorUnits: minorUnits,
    balanceMinorUnits: z.number().int().max(9_007_199_254_740_991).min(-9_007_199_254_740_991),
  })
  .strict()
  .refine((row) => row.balanceMinorUnits === row.invoicedMinorUnits - row.receivedMinorUnits, {
    path: ["balanceMinorUnits"],
    message: "Balance must equal invoiced minus received",
  });

export type FinanceReportRow = z.infer<typeof financeReportRowSchema>;

export const financeHandoffSchema = z
  .object({
    handoffId: uuid,
    destinationReference: identifier,
    sourceEventIds: z.array(uuid).min(1).max(10_000),
    approvedByIdentityId: uuid,
    approvedAt: timestamp,
    reason: z.string().trim().min(1).max(2_000),
  })
  .strict();

export type FinanceHandoff = Readonly<z.infer<typeof financeHandoffSchema>>;

export type CommissionCalculation = Readonly<{
  currency: string;
  contractValueMinorUnits: number;
  commissionAmountMinorUnits: number;
  structureId: string;
  structureRevision: number;
}>;

export type PaymentReconciliation = Readonly<{
  expectedMinorUnits: number;
  receivedMinorUnits: number;
  balanceMinorUnits: number;
  state: "unpaid" | "partially_paid" | "paid" | "overpaid";
}>;

function parseStructure(value: unknown): CommissionStructure {
  const result = commissionStructureSchema.safeParse(value);
  if (!result.success) throw new Error("Invalid commission structure");
  return result.data;
}

/** Calculates a commission with integer arithmetic and a stable half-up round. */
export function calculateCommission(
  structureInput: unknown,
  contractValueMinorUnitsInput: number,
  signedAtInput: string | Date,
): CommissionCalculation {
  const structure = parseStructure(structureInput);
  const contractValueMinorUnits = minorUnits.parse(contractValueMinorUnitsInput);
  const signedAt = signedAtInput instanceof Date ? signedAtInput.toISOString() : signedAtInput;
  if (!timestamp.safeParse(signedAt).success) throw new Error("Invalid contract signed timestamp");

  const signedAtMs = Date.parse(signedAt);
  if (signedAtMs < Date.parse(structure.effectiveFrom) ||
      (structure.effectiveTo && signedAtMs > Date.parse(structure.effectiveTo))) {
    throw new Error("Commission structure is not effective for contract");
  }

  const commissionAmountMinorUnits = structure.calculationType === "contract_value_rate"
    ? Number(
        (BigInt(contractValueMinorUnits) * BigInt(structure.rateBasisPoints ?? 0) + BigInt(5_000)) /
          BigInt(10_000),
      )
    : structure.flatAmountMinorUnits ?? 0;

  return {
    currency: structure.currency,
    contractValueMinorUnits,
    commissionAmountMinorUnits,
    structureId: structure.structureId,
    structureRevision: structure.revision,
  };
}

/** Rejects duplicate contract events and returns a stable event list. */
export function assertOneEventPerContract(eventsInput: readonly unknown[]): readonly CommissionEvent[] {
  const events = eventsInput.map((value) => {
    const result = commissionEventSchema.safeParse(value);
    if (!result.success) throw new Error("Invalid commission event");
    return result.data;
  });
  const seenContracts = new Set<string>();
  const seenIdempotencyKeys = new Set<string>();
  for (const event of events) {
    if (seenContracts.has(event.contractId)) throw new Error(`Duplicate commission event for contract: ${event.contractId}`);
    if (seenIdempotencyKeys.has(event.idempotencyKey)) throw new Error(`Duplicate commission idempotency key: ${event.idempotencyKey}`);
    seenContracts.add(event.contractId);
    seenIdempotencyKeys.add(event.idempotencyKey);
  }
  return [...events].sort((left, right) => left.eventId.localeCompare(right.eventId));
}

const allowedCommissionTransitions: Readonly<Record<CommissionEvent["state"], readonly CommissionEvent["state"][]>> = {
  pending_review: ["approved", "voided"],
  approved: ["invoiced", "disputed", "voided"],
  invoiced: ["partially_paid", "paid", "disputed", "voided"],
  partially_paid: ["paid", "disputed", "adjusted"],
  paid: ["disputed", "adjusted", "written_off"],
  disputed: ["approved", "adjusted", "voided"],
  adjusted: ["approved", "invoiced", "disputed", "voided"],
  voided: [],
  written_off: [],
};

/** Applies one audited state change without mutating the source commission event. */
export function transitionCommissionEvent(
  eventInput: unknown,
  transitionInput: unknown,
): CommissionEvent {
  const event = commissionEventSchema.safeParse(eventInput);
  const transition = commissionStateTransitionSchema.safeParse(transitionInput);
  if (!event.success || !transition.success) throw new Error("Invalid commission state transition");
  if (transition.data.eventId !== event.data.eventId || transition.data.fromState !== event.data.state) {
    throw new Error("Commission state transition is stale");
  }
  if (!allowedCommissionTransitions[event.data.state].includes(transition.data.toState)) {
    throw new Error("Commission state transition is not allowed");
  }
  return Object.freeze({ ...event.data, state: transition.data.toState });
}

/** Reconciles immutable payment records without changing their source history. */
function sumReceivedMinorUnits(payments: readonly CommissionPayment[]): number {
  let total = BigInt(0);
  for (const payment of payments) {
    if (payment.state === "received") total += BigInt(payment.amountMinorUnits);
  }
  if (total > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Payment total exceeds the supported amount");
  return Number(total);
}

export function reconcilePayments(
  expectedMinorUnitsInput: number,
  paymentsInput: readonly unknown[],
): PaymentReconciliation {
  const expectedMinorUnits = minorUnits.parse(expectedMinorUnitsInput);
  const payments = paymentsInput.map((value) => {
    const result = commissionPaymentSchema.safeParse(value);
    if (!result.success) throw new Error("Invalid commission payment");
    return result.data;
  });
  const seenPayments = new Set<string>();
  for (const payment of payments) {
    if (seenPayments.has(payment.paymentId)) throw new Error(`Duplicate commission payment: ${payment.paymentId}`);
    seenPayments.add(payment.paymentId);
  }
  const receivedMinorUnits = sumReceivedMinorUnits(payments);
  const balanceMinorUnits = expectedMinorUnits - receivedMinorUnits;
  return {
    expectedMinorUnits,
    receivedMinorUnits,
    balanceMinorUnits,
    state: receivedMinorUnits === 0
      ? "unpaid"
      : receivedMinorUnits < expectedMinorUnits
        ? "partially_paid"
        : receivedMinorUnits === expectedMinorUnits ? "paid" : "overpaid",
  };
}

export function canFinanciallyCloseCommission(state: CommissionEvent["state"]): boolean {
  return state === "paid" || state === "voided" || state === "written_off";
}

/** An invoice may issue only after the commission calculation is approved. */
export function canIssueInvoice(eventInput: unknown, invoiceInput: unknown): boolean {
  const event = commissionEventSchema.safeParse(eventInput);
  const invoice = invoiceSchema.safeParse(invoiceInput);
  if (!event.success || !invoice.success) return false;
  return event.data.state === "approved"
    && invoice.data.status === "ready"
    && invoice.data.commissionEventId === event.data.eventId
    && invoice.data.vendorOrganizationId === event.data.vendorOrganizationId
    && invoice.data.currency === event.data.currency
    && invoice.data.amountMinorUnits === event.data.commissionAmountMinorUnits;
}

/** Issues a ready invoice as a new immutable snapshot. */
export function issueInvoice(invoiceInput: unknown, issueInput: unknown): Invoice {
  const invoice = invoiceSchema.safeParse(invoiceInput);
  const issue = invoiceIssueSchema.safeParse(issueInput);
  if (!invoice.success || !issue.success || invoice.data.status !== "ready") {
    throw new Error("Invoice is not ready to issue");
  }
  return Object.freeze({
    ...invoice.data,
    status: "issued" as const,
    invoiceNumber: issue.data.invoiceNumber,
    issueDate: issue.data.issueDate,
    dueDate: issue.data.dueDate,
    supportingDocumentReferences: [...invoice.data.supportingDocumentReferences],
  });
}

/** Reconciles a report only against immutable commission events and payments. */
export function reconcileFinancialReport(
  eventsInput: readonly unknown[],
  paymentsInput: readonly unknown[],
  reportInput: readonly unknown[],
): readonly FinanceReportRow[] {
  const events = eventsInput.map((value) => commissionEventSchema.parse(value));
  const payments = paymentsInput.map((value) => commissionPaymentSchema.parse(value));
  const reports = reportInput.map((value) => financeReportRowSchema.parse(value));
  const eventIds = new Set(events.map((event) => event.eventId));
  if (eventIds.size !== events.length) throw new Error("Duplicate finance source event");
  const paymentIds = new Set(payments.map((payment) => payment.paymentId));
  if (paymentIds.size !== payments.length) throw new Error("Duplicate finance payment");
  if (payments.some((payment) => !eventIds.has(payment.commissionEventId))) throw new Error("Finance payment references an unknown event");
  if (new Set(reports.map((row) => row.commissionEventId)).size !== reports.length) throw new Error("Duplicate finance report row");
  if (reports.some((row) => !eventIds.has(row.commissionEventId))) throw new Error("Finance report references an unknown event");
  const reconciled = events.map((event) => {
    const receivedMinorUnits = sumReceivedMinorUnits(payments
      .filter((payment) => payment.commissionEventId === event.eventId));
    const report = reports.find((row) => row.commissionEventId === event.eventId);
    if (!report || report.currency !== event.currency || report.earnedMinorUnits !== event.commissionAmountMinorUnits
      || report.invoicedMinorUnits !== event.commissionAmountMinorUnits
      || report.receivedMinorUnits !== receivedMinorUnits) {
      throw new Error("Finance report does not reconcile to source events");
    }
    return report;
  });
  return reconciled.sort((left, right) => left.commissionEventId.localeCompare(right.commissionEventId));
}

/** Creates an approved handoff descriptor without contacting an external system. */
export function prepareFinanceHandoff(input: unknown): FinanceHandoff {
  const result = financeHandoffSchema.safeParse(input);
  if (!result.success || new Set(result.data.sourceEventIds).size !== result.data.sourceEventIds.length) {
    throw new Error("Invalid finance handoff");
  }
  return Object.freeze({ ...result.data, sourceEventIds: [...result.data.sourceEventIds] });
}

/** Finance data stays internal until a later reviewed permission is implemented. */
export function canViewCommissionData(surface: "internal" | "customer" | "vendor"): boolean {
  return surface === "internal";
}

export { currency, minorUnits };
