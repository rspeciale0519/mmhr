import { z } from "zod";
import { securityReasonSchema } from "@/lib/security-reason";
import { proposalQuoteCurrencyCodes } from "@/lib/proposal-quote";

const uuid = z.uuid().transform(value => value.toLowerCase());
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const revision = z.number().int().min(1).max(2_147_483_646);
const money = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const currency = z.enum(proposalQuoteCurrencyCodes);
export const managedFinanceInstantSchema = z.iso.datetime({ offset: true }).refine(
  value => /T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value),
  "Finance timestamps must not exceed microsecond precision",
);
const instant = managedFinanceInstantSchema;
const reason = securityReasonSchema;
const reference = z.string().trim().min(1).max(500).refine(value => !/[\x00-\x1f\x7f]/.test(value));
const metadata = { organizationId: uuid, correlationId: uuid, idempotencyKey: uuid, reason };

function microseconds(value: string) {
  const match = /^(.*:\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (match === null) throw new Error("Unsupported finance timestamp");
  return BigInt(Date.parse(match[1] + match[3])) * BigInt(1000)
    + BigInt((match[2] ?? "0").padEnd(6, "0"));
}

export function compareManagedFinanceInstants(left: string, right: string) {
  const difference = microseconds(instant.parse(left)) - microseconds(instant.parse(right));
  return difference < BigInt(0) ? -1 : difference > BigInt(0) ? 1 : 0;
}

// IDs and hashes identify the asserted source. Only database source resolution
// and current finance authority can establish eligibility or approval.
export const financeSourceReferenceSchema = z.strictObject({
  organizationId: uuid, documentId: uuid, versionId: uuid, sha256: hash,
});
export const managedAgreementRuleSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("flat_amount"), amountMinorUnits: money, currency }),
  z.strictObject({ kind: z.literal("contract_value_rate"), rateBasisPoints: z.number().int().min(0).max(10_000), currency }),
  z.strictObject({ kind: z.literal("unsupported"), sourceTermReference: reference }),
]);
export const contractValueFactSchema = z.strictObject({ amountMinorUnits: money.nullable(), currency: currency.nullable() })
  .refine(value => value.amountMinorUnits === null || value.currency !== null,
    "A known contract value requires its currency");

const agreementPreparation = z.strictObject({
  ...metadata, action: z.literal("prepare_agreement"), agreementId: uuid, versionId: uuid,
  vendorOrganizationId: uuid, expectedSeriesRevision: z.number().int().min(0).max(2_147_483_646),
  predecessorVersionId: uuid.nullable(), source: financeSourceReferenceSchema,
  effectiveFrom: instant, statedEffectiveEnd: instant.nullable(),
  replacementSourceReference: reference.nullable(), rule: managedAgreementRuleSchema,
  conditionReferences: z.array(reference).max(50),
}).superRefine((value, context) => {
  if (value.predecessorVersionId === value.versionId) {
    context.addIssue({ code: "custom", path: ["predecessorVersionId"], message: "An agreement version cannot replace itself" });
  }
  if (value.statedEffectiveEnd !== null && instant.safeParse(value.effectiveFrom).success
    && instant.safeParse(value.statedEffectiveEnd).success
    && microseconds(value.statedEffectiveEnd) <= microseconds(value.effectiveFrom)) {
    context.addIssue({ code: "custom", path: ["statedEffectiveEnd"], message: "An agreement interval must have positive length" });
  }
  if (value.organizationId !== value.source.organizationId) {
    context.addIssue({ code: "custom", path: ["source", "organizationId"], message: "Agreement evidence must belong to its finance workspace" });
  }
  if (value.organizationId === value.vendorOrganizationId) {
    context.addIssue({ code: "custom", path: ["vendorOrganizationId"], message: "The vendor cannot own the internal agreement workspace" });
  }
  if ((value.predecessorVersionId === null) !== (value.expectedSeriesRevision === 0)) {
    context.addIssue({ code: "custom", path: ["predecessorVersionId"], message: "The amendment must identify its expected predecessor" });
  }
  if ((value.predecessorVersionId === null) !== (value.replacementSourceReference === null)) {
    context.addIssue({ code: "custom", path: ["replacementSourceReference"], message: "An amendment requires its source replacement reference" });
  }
});

const sourceDecision = {
  ...metadata, versionId: uuid, expectedRevision: revision, expectedSourceDigest: hash,
  reviewedAccessId: uuid, contentsReviewed: z.literal(true), reviewReference: reference,
};
const agreementDecision = z.strictObject({
  ...sourceDecision, action: z.enum(["approve_agreement", "reject_agreement"]), agreementId: uuid,
  expectedSeriesRevision: z.number().int().min(0).max(2_147_483_646), predecessorVersionId: uuid.nullable(),
}).refine(value => (value.predecessorVersionId === null) === (value.expectedSeriesRevision === 0),
  "An amendment decision must identify its expected predecessor");
const contractFactsPreparation = z.strictObject({
  ...metadata, action: z.literal("prepare_contract_facts"), contractId: uuid, handoffId: uuid, versionId: uuid,
  predecessorVersionId: uuid.nullable(), expectedFactsRevision: z.number().int().min(0).max(2_147_483_646),
  source: financeSourceReferenceSchema, contractValue: contractValueFactSchema,
  sourceReference: reference,
}).superRefine((value, context) => {
  if (value.predecessorVersionId === value.versionId) {
    context.addIssue({ code: "custom", path: ["predecessorVersionId"], message: "A contract facts version cannot replace itself" });
  }
  if (value.organizationId !== value.source.organizationId) {
    context.addIssue({ code: "custom", path: ["source", "organizationId"], message: "Contract evidence must belong to its customer case" });
  }
  if ((value.predecessorVersionId === null) !== (value.expectedFactsRevision === 0)) {
    context.addIssue({ code: "custom", path: ["predecessorVersionId"], message: "A correction must identify its expected source version" });
  }
});
const contractFactsDecision = z.strictObject({
  ...sourceDecision, action: z.enum(["approve_contract_facts", "reject_contract_facts"]), contractId: uuid,
  expectedFactsRevision: z.number().int().min(0).max(2_147_483_646), predecessorVersionId: uuid.nullable(),
}).refine(value => (value.predecessorVersionId === null) === (value.expectedFactsRevision === 0),
  "A correction decision must identify its expected source version");
const eligibilityRequest = z.strictObject({
  ...metadata, action: z.literal("resolve_eligibility"), contractId: uuid, handoffId: uuid,
});
const calculationPreparation = z.strictObject({
  ...metadata, action: z.literal("prepare_calculation"), commissionEventId: uuid,
  calculationId: uuid, expectedEventRevision: revision, expectedSourceDigest: hash,
});
const calculationDecision = z.strictObject({
  ...metadata, action: z.enum(["approve_calculation", "reject_calculation"]), commissionEventId: uuid,
  calculationId: uuid, expectedEventRevision: revision, expectedCalculationRevision: revision,
  expectedSourceDigest: hash, reviewReference: reference,
});

// Client payloads never supply an actor, approval date, resolved agreement,
// commission result, signing date, or financial state as authority.
export const managedFinanceCommandSchema = z.union([
  agreementPreparation, agreementDecision, contractFactsPreparation, contractFactsDecision,
  eligibilityRequest, calculationPreparation, calculationDecision,
]);
export type ManagedFinanceCommand = z.output<typeof managedFinanceCommandSchema>;

export const managedFinanceReadSchema = z.strictObject({
  organizationId: uuid, correlationId: uuid, view: z.enum(["agreements", "contracts", "calculations"]),
  afterId: uuid.optional(),
});
export const managedFinanceDetailSchema = z.strictObject({
  organizationId: uuid, correlationId: uuid, entityId: uuid,
  view: z.enum(["agreement", "contract", "calculation"]),
  beforeVersion: revision.optional(),
});
const result = {
  organizationId: uuid, correlationId: uuid, entityId: uuid,
  revision: z.number().int().min(1).max(2_147_483_647), outcomeCode: z.enum(["recorded", "replayed"]),
};
export const managedFinanceCommandResultSchema = z.discriminatedUnion("action", [
  z.strictObject({ ...result, action: z.enum(["prepare_agreement", "approve_agreement", "reject_agreement"]), agreementId: uuid }),
  z.strictObject({ ...result, action: z.enum(["prepare_contract_facts", "approve_contract_facts", "reject_contract_facts"]), contractId: uuid }),
  z.strictObject({ ...result, action: z.literal("resolve_eligibility"), contractId: uuid, handoffId: uuid }),
  z.strictObject({ ...result, action: z.enum(["prepare_calculation", "approve_calculation", "reject_calculation"]), commissionEventId: uuid }),
]);

export function verifyManagedFinanceResult(value: unknown, inputValue: unknown) {
  const input = managedFinanceCommandSchema.parse(inputValue);
  const output = managedFinanceCommandResultSchema.parse(value);
  if (output.organizationId !== input.organizationId || output.correlationId !== input.correlationId || output.action !== input.action) {
    throw new Error("Invalid finance response");
  }
  if ("agreementId" in input) {
    if (!("agreementId" in output) || output.agreementId !== input.agreementId || output.entityId !== input.versionId) {
      throw new Error("Invalid agreement response");
    }
  } else if (input.action === "resolve_eligibility") {
    if (!("handoffId" in output) || output.contractId !== input.contractId || output.handoffId !== input.handoffId) {
      throw new Error("Invalid eligibility response");
    }
  } else if ("contractId" in input) {
    if (!("contractId" in output) || output.contractId !== input.contractId || output.entityId !== input.versionId) {
      throw new Error("Invalid contract facts response");
    }
  } else if (!("commissionEventId" in output) || output.commissionEventId !== input.commissionEventId || output.entityId !== input.calculationId) {
    throw new Error("Invalid calculation response");
  }
  const expectedRevision = "expectedRevision" in input ? input.expectedRevision + 1
    : "expectedCalculationRevision" in input ? input.expectedCalculationRevision + 1
    : 1;
  if (output.revision !== expectedRevision) throw new Error("Invalid finance result revision");
  return output;
}
