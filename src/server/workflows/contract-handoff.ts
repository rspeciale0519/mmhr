import { z } from "zod";

/**
 * Contract handoff states. MMHR tracks these states but does not negotiate
 * legal terms for either party.
 */
export const contractHandoffStatuses = [
  "introduction_pending",
  "introduced",
  "negotiating",
  "stalled",
  "signed",
  "not_signed",
  "cancelled",
] as const;

export type ContractHandoffStatus = (typeof contractHandoffStatuses)[number];

const uuidSchema = z.uuid().transform((value) => value.toLowerCase());
const requiredText = z.string().trim().min(1);
const timestampSchema = z.string().datetime({ offset: true });

function rejectDuplicateIds(
  values: readonly string[],
  path: PropertyKey[],
  message: string,
  context: z.RefinementCtx,
) {
  if (new Set(values).size !== values.length) {
    context.addIssue({ code: "custom", path, message });
  }
}

/**
 * Records the approved selection that starts a contract handoff.
 * It excludes pricing, legal terms, and negotiation instructions.
 */
export const contractHandoffSelectionSchema = z
  .strictObject({
    handoffId: uuidSchema,
    customerOrganizationId: uuidSchema,
    selectedVendorOrganizationId: uuidSchema,
    selectionReasons: z.array(requiredText.max(500)).min(1).max(10),
    remainingRisks: z.array(requiredText.max(500)).max(20),
    approvedByIdentityIds: z.array(uuidSchema).min(1).max(10),
    approvedAt: timestampSchema,
    correlationId: uuidSchema,
  })
  .superRefine((selection, context) => {
    if (selection.customerOrganizationId === selection.selectedVendorOrganizationId) {
      context.addIssue({
        code: "custom",
        path: ["selectedVendorOrganizationId"],
        message: "customer and selected vendor must be different organizations",
      });
    }
    rejectDuplicateIds(
      selection.approvedByIdentityIds,
      ["approvedByIdentityIds"],
      "approval identities must be unique",
      context,
    );
  });

export type ContractHandoffSelection = z.output<typeof contractHandoffSelectionSchema>;

/**
 * A transition carries its actor, reason, timestamp, and correlation ID.
 * Strict parsing rejects legal terms or provider-specific negotiation data.
 */
export const contractHandoffTransitionSchema = z.strictObject({
  handoffId: uuidSchema,
  fromStatus: z.enum(contractHandoffStatuses),
  toStatus: z.enum(contractHandoffStatuses),
  actorIdentityId: uuidSchema,
  reason: requiredText.max(1_000),
  occurredAt: timestampSchema,
  correlationId: uuidSchema,
});

export type ContractHandoffTransition = z.output<typeof contractHandoffTransitionSchema>;

export type ContractHandoffRecord = Readonly<{
  handoffId: string;
  customerOrganizationId: string;
  selectedVendorOrganizationId: string;
  selection: ContractHandoffSelection;
  status: ContractHandoffStatus;
  transitions: readonly ContractHandoffTransition[];
}>;

const allowedTransitions: Readonly<Record<ContractHandoffStatus, readonly ContractHandoffStatus[]>> = {
  introduction_pending: ["introduced", "stalled", "cancelled"],
  introduced: ["negotiating", "stalled", "cancelled"],
  negotiating: ["signed", "not_signed", "stalled", "cancelled"],
  stalled: ["introduced", "negotiating", "cancelled"],
  signed: [],
  not_signed: [],
  cancelled: [],
};

/** Creates an immutable handoff record after an approved vendor selection. */
export function createContractHandoff(input: unknown): ContractHandoffRecord {
  const result = contractHandoffSelectionSchema.safeParse(input);
  if (!result.success) throw new Error("Invalid contract handoff selection");
  const selection = result.data;
  return {
    handoffId: selection.handoffId,
    customerOrganizationId: selection.customerOrganizationId,
    selectedVendorOrganizationId: selection.selectedVendorOrganizationId,
    selection,
    status: "introduction_pending",
    transitions: [],
  };
}

/**
 * Applies one operational status transition and preserves its complete history.
 * Terminal outcomes cannot be changed or overwritten.
 */
export function transitionContractHandoff(
  record: ContractHandoffRecord,
  input: unknown,
): ContractHandoffRecord {
  const result = contractHandoffTransitionSchema.safeParse(input);
  if (!result.success) throw new Error("Invalid contract handoff transition");
  const transition = result.data;

  if (transition.handoffId !== record.handoffId) {
    throw new Error("Contract handoff ID does not match");
  }
  if (transition.fromStatus !== record.status) {
    throw new Error("Contract handoff transition is stale");
  }
  if (!allowedTransitions[record.status].includes(transition.toStatus)) {
    throw new Error("Contract handoff transition is not allowed");
  }

  return {
    ...record,
    status: transition.toStatus,
    transitions: [...record.transitions, transition],
  };
}

export function canTransitionContractHandoff(
  from: ContractHandoffStatus,
  to: ContractHandoffStatus,
): boolean {
  return allowedTransitions[from]?.includes(to) ?? false;
}
