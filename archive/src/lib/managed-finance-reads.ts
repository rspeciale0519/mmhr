import { z } from "zod";
import { proposalQuoteCurrencyCodes } from "@/lib/proposal-quote";
import { securityReasonSchema } from "@/lib/security-reason";
import { workspaceDocumentRowSchema } from "@/lib/workspace-documents";
import { financeSourceReferenceSchema, managedAgreementRuleSchema, contractValueFactSchema,
  managedFinanceReadSchema, managedFinanceDetailSchema, managedFinanceInstantSchema,
  compareManagedFinanceInstants } from "./managed-finance-workflow";

const uuid = z.uuid().transform(value => value.toLowerCase());
const revision = z.number().int().min(1).max(2_147_483_647);
const label = z.string().trim().min(1).max(500).refine(value => !/[\x00-\x1f\x7f]/.test(value));
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const instant = managedFinanceInstantSchema;
const currency = z.enum(proposalQuoteCurrencyCodes);
const money = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const reason = securityReasonSchema;
const reviewedState = z.enum(["pending", "approved", "rejected"]);
const eventState = z.enum(["pending_review", "approved", "invoiced", "partially_paid", "paid", "disputed", "adjusted", "voided", "written_off"]);
const origin = { organizationId: uuid, correlationId: uuid };
const original = financeSourceReferenceSchema.extend({ fileName: label, currentDocumentVersion: revision, originalVersion: revision,
  document: workspaceDocumentRowSchema.safeExtend({state:z.enum(["approved","superseded"]),failureCode:z.null()}),
}).superRefine((value,context)=>{
  if (value.document.documentId!==value.documentId || value.document.versionId!==value.versionId
    || value.document.version!==value.originalVersion || value.document.fileName!==value.fileName
    || value.currentDocumentVersion<value.originalVersion
    || value.document.isCurrent!==(value.currentDocumentVersion===value.originalVersion)) {
    context.addIssue({code:"custom",message:"Invalid finance original metadata"});
  }
});

const agreementListItem = z.strictObject({ agreementId: uuid, vendorOrganizationId: uuid, vendorLabel: label,
  seriesRevision: z.number().int().min(0).max(2_147_483_647), currentApprovedVersionId: uuid.nullable(),
  pendingVersionCount: z.number().int().min(0).max(2_147_483_647) });
const contractListItem = z.strictObject({ contractId: uuid, handoffId: uuid, dealId: uuid, dealLabel: label,
  vendorOrganizationId: uuid, vendorLabel: label, signedAt: instant, approvedFactsVersionId: uuid.nullable(),
  commissionEventId: uuid.nullable(), commissionState: eventState.nullable() }).refine(
  value => (value.commissionEventId === null) === (value.commissionState === null), "Invalid finance event binding");
const calculationListItem = z.strictObject({ calculationId: uuid, commissionEventId: uuid, contractId: uuid,
  dealLabel: label, vendorLabel: label, state: reviewedState, revision, calculationRevision: revision,
  amountMinorUnits: money.nullable(), currency: currency.nullable(),
  blockerCodes: z.array(z.enum(["rule_unsupported", "conditions_unsupported", "commission_currency_missing", "contract_value_missing",
    "contract_currency_missing", "currency_conversion_unsupported", "source_changed"])).max(7),
  preparedByLabel: label, preparedAt: instant }).superRefine((value, context) => {
  if ((value.amountMinorUnits === null) !== (value.currency === null)
    || value.state === "approved" && (value.amountMinorUnits === null || value.blockerCodes.length > 0)
    || new Set(value.blockerCodes).size !== value.blockerCodes.length) {
    context.addIssue({ code: "custom", message: "Invalid finance calculation state" });
  }
});

export const managedFinancePageSchema = z.discriminatedUnion("view", [
  z.strictObject({ ...origin, view: z.literal("agreements"), items: z.array(agreementListItem).max(25), nextCursor: uuid.nullable() }),
  z.strictObject({ ...origin, view: z.literal("contracts"), items: z.array(contractListItem).max(25), nextCursor: uuid.nullable() }),
  z.strictObject({ ...origin, view: z.literal("calculations"), items: z.array(calculationListItem).max(25), nextCursor: uuid.nullable() }),
]);

const decision = { state: reviewedState, revision, preparedByIdentityId: uuid, preparedByLabel: label,
  preparedAt: instant, decidedByIdentityId: uuid.nullable(), decidedByLabel: label.nullable(),
  decidedAt: instant.nullable(), decisionReason: reason.nullable(), canDecide: z.boolean(), canApprove: z.boolean(), canReject: z.boolean() };
const agreementVersion = z.strictObject({ ...decision, versionId: uuid, version: revision, predecessorVersionId: uuid.nullable(),
  expectedSeriesRevision: z.number().int().min(0).max(2_147_483_646),
  original, sourceDigest: hash, effectiveFrom: instant, statedEffectiveEnd: instant.nullable(),
  rule: managedAgreementRuleSchema, conditionReferences: z.array(label).max(50) });
const factsVersion = z.strictObject({ ...decision, versionId: uuid, version: revision, predecessorVersionId: uuid.nullable(),
  expectedFactsRevision: z.number().int().min(0).max(2_147_483_646),
  original, sourceDigest: hash, contractValue: contractValueFactSchema, sourceReference: label });

export const managedFinanceDetailPageSchema = z.discriminatedUnion("view", [
  z.strictObject({ ...origin, currentActorIdentityId: uuid, entityId: uuid, view: z.literal("agreement"), agreement: agreementListItem,
    versions: z.array(agreementVersion).max(25), nextVersion: revision.nullable() }),
  z.strictObject({ ...origin, currentActorIdentityId: uuid, entityId: uuid, view: z.literal("contract"), contract: contractListItem.safeExtend({
    currentFactsRevision: z.number().int().min(0).max(2_147_483_646), currentEventRevision: revision.nullable(),
    currentSourceDigest: hash.nullable(), canResolveEligibility: z.boolean(), canPrepareCalculation: z.boolean(),
  }).superRefine((value,context)=>{
    if ((value.approvedFactsVersionId===null)!==(value.currentFactsRevision===0)
      || (value.commissionEventId===null)!==(value.currentEventRevision===null)
      || value.canResolveEligibility && value.commissionEventId!==null
      || value.canPrepareCalculation && (value.commissionState!=="pending_review" || value.currentEventRevision===null
        || value.currentSourceDigest===null || value.approvedFactsVersionId===null)) {
      context.addIssue({code:"custom",message:"Invalid finance preparation availability"});
    }
  }),
    versions: z.array(factsVersion).max(25), nextVersion: revision.nullable() }),
  z.strictObject({ ...origin, entityId: uuid, view: z.literal("calculation"), calculation: calculationListItem.safeExtend({
    ...decision, preparedByIdentityId: uuid, expectedEventRevision: revision, currentEventRevision: revision,
    expectedSourceDigest: hash, currentSourceDigest: hash.nullable(), factsVersionId: uuid, agreementVersionId: uuid,
    agreementOrganizationId: uuid, contractOriginal: original, agreementOriginal: original,
    contractValue: contractValueFactSchema, rule: managedAgreementRuleSchema,
    conditionReferences: z.array(label).max(50), currentActorIdentityId: uuid, canApprove: z.boolean(), canReject: z.boolean(),
  }).superRefine((value, context) => {
    const available = value.state === "pending" && value.preparedByIdentityId !== value.currentActorIdentityId
      && value.expectedEventRevision === value.currentEventRevision;
    if (value.canDecide !== (value.canApprove || value.canReject)
      || (value.canReject || value.canApprove) && !available
      || value.canApprove && (value.expectedSourceDigest !== value.currentSourceDigest
        || value.amountMinorUnits === null || value.blockerCodes.length > 0)) {
      context.addIssue({ code: "custom", message: "Invalid finance decision availability" });
    }
    if (value.state === "pending" ? value.revision !== 1 || value.decidedByIdentityId !== null || value.decidedByLabel !== null
      || value.decidedAt !== null || value.decisionReason !== null
      : value.revision !== 2 || value.decidedByIdentityId === null || value.decidedByLabel === null
        || value.decidedByIdentityId === value.preparedByIdentityId || value.decidedAt === null || value.decisionReason === null) {
      context.addIssue({ code: "custom", message: "Invalid finance calculation decision" });
    }
    if (value.decidedAt !== null && compareManagedFinanceInstants(value.decidedAt, value.preparedAt) < 0) {
      context.addIssue({ code: "custom", message: "Invalid finance decision time" });
    }
  }) }),
]);

export function verifyManagedFinancePage(value: unknown, request: unknown) {
  const input = managedFinanceReadSchema.parse(request), output = managedFinancePageSchema.parse(value);
  if (output.organizationId !== input.organizationId || output.correlationId !== input.correlationId || output.view !== input.view) {
    throw new Error("Invalid finance page binding");
  }
  const ids = output.items.map(item => "agreementId" in item ? item.agreementId
    : "calculationId" in item ? item.calculationId : item.contractId);
  let previous = input.afterId;
  for (const id of ids) { if (previous && id <= previous) throw new Error("Invalid finance page order"); previous = id; }
  if (output.nextCursor && (ids.length !== 25 || output.nextCursor !== previous)) throw new Error("Invalid finance page cursor");
  return output;
}

export function verifyManagedFinanceDetail(value: unknown, request: unknown) {
  const input = managedFinanceDetailSchema.parse(request), output = managedFinanceDetailPageSchema.parse(value);
  const entityId = output.view === "agreement" ? output.agreement.agreementId
    : output.view === "contract" ? output.contract.contractId : output.calculation.calculationId;
  if (output.organizationId !== input.organizationId || output.correlationId !== input.correlationId
    || output.view !== input.view || output.entityId !== input.entityId || entityId !== input.entityId) {
    throw new Error("Invalid finance detail binding");
  }
  if (output.view !== "calculation") {
    let previousVersion = input.beforeVersion;
    const versionIds = new Set<string>();
    for (const version of output.versions) {
      if (versionIds.has(version.versionId) || previousVersion !== undefined && version.version >= previousVersion
        || version.original.organizationId !== input.organizationId
        || version.original.currentDocumentVersion < version.original.originalVersion) throw new Error("Invalid finance source version");
      versionIds.add(version.versionId); previousVersion = version.version;
      const pending = version.state === "pending";
      if (pending ? version.revision !== 1 || version.decidedByIdentityId !== null || version.decidedByLabel !== null
        || version.decidedAt !== null || version.decisionReason !== null
        : version.revision !== 2 || version.decidedByIdentityId === null || version.decidedByLabel === null
          || version.decidedByIdentityId === version.preparedByIdentityId || version.decidedAt === null || version.decisionReason === null) {
        throw new Error("Invalid finance source decision");
      }
      if (version.canDecide !== (version.canApprove || version.canReject)
        || version.canDecide && (!pending || version.preparedByIdentityId === output.currentActorIdentityId)) {
        throw new Error("Invalid finance source decision availability");
      }
      if (version.decidedAt !== null && compareManagedFinanceInstants(version.decidedAt, version.preparedAt) < 0) {
        throw new Error("Invalid finance decision time");
      }
    }
    if (output.nextVersion !== null && (output.versions.length !== 25 || output.nextVersion !== previousVersion)) {
      throw new Error("Invalid finance version cursor");
    }
  } else {
    const calculation = output.calculation;
    if (input.beforeVersion !== undefined || calculation.contractOriginal.organizationId !== input.organizationId
      || calculation.agreementOriginal.organizationId !== calculation.agreementOrganizationId) {
      throw new Error("Invalid finance calculation source");
    }
  }
  return output;
}
