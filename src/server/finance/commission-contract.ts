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
    ? Math.floor((contractValueMinorUnits * (structure.rateBasisPoints ?? 0) + 5000) / 10_000)
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

/** Reconciles immutable payment records without changing their source history. */
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
  let receivedMinorUnits = 0;
  for (const payment of payments) {
    if (seenPayments.has(payment.paymentId)) throw new Error(`Duplicate commission payment: ${payment.paymentId}`);
    seenPayments.add(payment.paymentId);
    if (payment.state === "received") receivedMinorUnits += payment.amountMinorUnits;
  }
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

export { currency, minorUnits };
