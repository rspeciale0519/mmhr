import { z } from "zod";

/**
 * Proposal data stays versioned and immutable. A new quote is a new version;
 * callers must not update an existing version in place.
 */
export const proposalStatuses = [
  "received",
  "under_review",
  "revision_requested",
  "approved_for_comparison",
  "superseded",
  "withdrawn",
] as const;

export type ProposalStatus = (typeof proposalStatuses)[number];

const uuid = z.uuid().transform((value) => value.toLowerCase());
const text = z.string().trim().min(1);
const timestamp = z.iso.datetime({ offset: true });
const minorUnits = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const sourceReference = text.max(500);

/** Keeps returned workflow snapshots immutable across all nested arrays. */
function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return value;
}

export const proposalPricingSchema = z.strictObject({
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
  implementationCostMinorUnits: minorUnits.nullable(),
  recurringCostMinorUnits: minorUnits.nullable(),
  optionalCostMinorUnits: minorUnits.nullable(),
  discountMinorUnits: minorUnits.nullable(),
  termMonths: z.number().int().positive().max(600).nullable(),
  termsAndAssumptions: z.array(text.max(1_000)).max(50),
  customerRequestedChanges: z.array(text.max(1_000)).max(50),
});

export type ProposalPricing = z.output<typeof proposalPricingSchema>;

export const proposalVersionInputSchema = z.strictObject({
  proposalVersionId: uuid,
  dealId: uuid,
  customerOrganizationId: uuid,
  vendorOrganizationId: uuid,
  versionNumber: z.number().int().positive().max(10_000),
  receivedAt: timestamp,
  sourceReferences: z.array(sourceReference).min(1).max(50),
  pricing: proposalPricingSchema,
});

export type ProposalVersionInput = z.output<typeof proposalVersionInputSchema>;

export const proposalTransitionSchema = z.strictObject({
  proposalVersionId: uuid,
  fromStatus: z.enum(proposalStatuses),
  toStatus: z.enum(proposalStatuses),
  actorIdentityId: uuid,
  reason: text.max(1_000),
  occurredAt: timestamp,
  correlationId: uuid,
});

export type ProposalTransition = z.output<typeof proposalTransitionSchema>;

export type ProposalVersion = Readonly<ProposalVersionInput & {
  status: ProposalStatus;
  transitions: readonly ProposalTransition[];
}>;

const proposalVersionSchema = proposalVersionInputSchema.extend({
  status: z.enum(proposalStatuses),
  transitions: z.array(proposalTransitionSchema),
});

const allowedProposalTransitions: Readonly<Record<ProposalStatus, readonly ProposalStatus[]>> = {
  received: ["under_review", "withdrawn"],
  under_review: ["revision_requested", "approved_for_comparison", "withdrawn"],
  revision_requested: ["withdrawn"],
  approved_for_comparison: ["superseded", "withdrawn"],
  superseded: [],
  withdrawn: [],
};

function parseProposalVersion(input: unknown): ProposalVersionInput {
  const result = proposalVersionInputSchema.safeParse(input);
  if (!result.success) throw new Error("Invalid proposal version");
  return result.data;
}

/** Creates the first immutable snapshot for one proposal version. */
export function createProposalVersion(input: unknown): ProposalVersion {
  const parsed = parseProposalVersion(input);
  return deepFreeze({ ...parsed, sourceReferences: [...parsed.sourceReferences], status: "received", transitions: [] });
}

/** Applies one allowed proposal state change and appends, never replaces, history. */
export function transitionProposalVersion(
  record: ProposalVersion,
  input: unknown,
): ProposalVersion {
  const result = proposalTransitionSchema.safeParse(input);
  if (!result.success) throw new Error("Invalid proposal transition");
  const transition = result.data;

  if (transition.proposalVersionId !== record.proposalVersionId) {
    throw new Error("Proposal version ID does not match");
  }
  if (transition.fromStatus !== record.status) {
    throw new Error("Proposal transition is stale");
  }
  if (!allowedProposalTransitions[record.status].includes(transition.toStatus)) {
    throw new Error("Proposal transition is not allowed");
  }

  return deepFreeze({ ...record, status: transition.toStatus, transitions: [...record.transitions, transition] });
}

export function canTransitionProposal(
  from: ProposalStatus,
  to: ProposalStatus,
): boolean {
  return allowedProposalTransitions[from]?.includes(to) ?? false;
}

export const proposalComparisonInputSchema = z.strictObject({
  comparisonId: uuid,
  dealId: uuid,
  customerOrganizationId: uuid,
  proposalVersions: z.array(proposalVersionSchema).min(2).max(50),
  approvedByIdentityIds: z.array(uuid).min(1).max(10),
  approvedAt: timestamp,
  correlationId: uuid,
});

export type ProposalComparison = Readonly<z.output<typeof proposalComparisonInputSchema>>;

/**
 * Creates a comparison only from approved versions with source references.
 * The snapshot prevents later proposal edits from changing the comparison.
 */
export function createApprovedProposalComparison(input: unknown): ProposalComparison {
  const result = proposalComparisonInputSchema.safeParse(input);
  if (!result.success) throw new Error("Invalid proposal comparison");
  const comparison = result.data;
  const ids = new Set<string>();
  const vendors = new Set<string>();
  let currency: string | undefined;

  for (const proposal of comparison.proposalVersions) {
    if (ids.has(proposal.proposalVersionId)) throw new Error("Proposal versions must be unique");
    ids.add(proposal.proposalVersionId);
    if (proposal.dealId !== comparison.dealId || proposal.customerOrganizationId !== comparison.customerOrganizationId) {
      throw new Error("Proposal scope does not match comparison");
    }
    if (proposal.status !== "approved_for_comparison") {
      throw new Error("Only approved proposal versions can be compared");
    }
    if (proposal.sourceReferences.length === 0) {
      throw new Error("Every compared proposal requires a source reference");
    }
    if (vendors.has(proposal.vendorOrganizationId)) {
      throw new Error("A comparison cannot contain two versions from one vendor");
    }
    vendors.add(proposal.vendorOrganizationId);
    const proposalCurrency = proposal.pricing.currency;
    if (currency === undefined) currency = proposalCurrency;
    if (currency !== proposalCurrency) throw new Error("Compared proposals must use one currency");
  }

  const approvers = new Set(comparison.approvedByIdentityIds);
  if (approvers.size !== comparison.approvedByIdentityIds.length) {
    throw new Error("Comparison approval identities must be unique");
  }

  return deepFreeze({
    ...comparison,
    proposalVersions: comparison.proposalVersions.map((proposal) => ({
      ...proposal,
      sourceReferences: [...proposal.sourceReferences],
      pricing: {
        ...proposal.pricing,
        termsAndAssumptions: [...proposal.pricing.termsAndAssumptions],
        customerRequestedChanges: [...proposal.pricing.customerRequestedChanges],
      },
      transitions: proposal.transitions.map((transition) => ({ ...transition })),
    })),
    approvedByIdentityIds: [...comparison.approvedByIdentityIds],
  });
}

export const vendorSelectionInputSchema = z.strictObject({
  selectionId: uuid,
  comparisonId: uuid,
  dealId: uuid,
  customerOrganizationId: uuid,
  selectedVendorOrganizationId: uuid,
  decisionReasons: z.array(text.max(1_000)).min(1).max(20),
  remainingRisks: z.array(text.max(1_000)).max(50),
  approvedByIdentityIds: z.array(uuid).min(1).max(10),
  approvedAt: timestamp,
  correlationId: uuid,
});

export type VendorSelection = Readonly<z.output<typeof vendorSelectionInputSchema>>;

/** Requires an approved comparison before recording the selected vendor. */
export function createApprovedVendorSelection(
  input: unknown,
  comparison: ProposalComparison,
): VendorSelection {
  const result = vendorSelectionInputSchema.safeParse(input);
  if (!result.success) throw new Error("Invalid vendor selection");
  const selection = result.data;
  if (selection.comparisonId !== comparison.comparisonId) throw new Error("Selection comparison does not match");
  if (selection.dealId !== comparison.dealId || selection.customerOrganizationId !== comparison.customerOrganizationId) {
    throw new Error("Selection scope does not match comparison");
  }
  if (!comparison.proposalVersions.some((proposal) => proposal.vendorOrganizationId === selection.selectedVendorOrganizationId)) {
    throw new Error("Selected vendor is not in the approved comparison");
  }
  const approvers = new Set(selection.approvedByIdentityIds);
  if (approvers.size !== selection.approvedByIdentityIds.length) {
    throw new Error("Selection approval identities must be unique");
  }
  return deepFreeze({
    ...selection,
    decisionReasons: [...selection.decisionReasons],
    remainingRisks: [...selection.remainingRisks],
    approvedByIdentityIds: [...selection.approvedByIdentityIds],
  });
}

/**
 * MMHR records shared status only after handoff. Legal terms and negotiation
 * instructions are intentionally outside this strict contract.
 */
export const directNegotiationStatusSchema = z.strictObject({
  handoffId: uuid,
  customerOrganizationId: uuid,
  vendorOrganizationId: uuid,
  status: z.enum(["introduced", "negotiating", "stalled", "signed", "not_signed", "cancelled"]),
  sharedStatus: text.max(1_000),
  recordedByIdentityId: uuid,
  occurredAt: timestamp,
  correlationId: uuid,
});

export type DirectNegotiationStatus = Readonly<z.output<typeof directNegotiationStatusSchema>>;

export function recordDirectNegotiationStatus(input: unknown): DirectNegotiationStatus {
  const result = directNegotiationStatusSchema.safeParse(input);
  if (!result.success) throw new Error("Invalid direct negotiation status");
  if (result.data.customerOrganizationId === result.data.vendorOrganizationId) {
    throw new Error("Customer and vendor must be different organizations");
  }
  return deepFreeze(result.data);
}
