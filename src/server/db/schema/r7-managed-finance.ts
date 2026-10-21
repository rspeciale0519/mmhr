import { sql } from "drizzle-orm";
import { bigint, check, foreignKey, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { identities, orgs } from "@/server/db/schema/identity";
import { commissionEvents, commissionStructures } from "@/server/db/schema/r7-finance";
import { portalContractHandoffDetails } from "@/server/db/schema/r6-contract-portal";
import { securityCommandReceipts } from "@/server/db/schema/security-commands";
import { financeDocumentSources } from "@/server/db/schema/r7-finance-documents";

function preparationEvidence() {
  return { prepareReceiptId: uuid("prepare_receipt_id").notNull().references(() => securityCommandReceipts.id, { onDelete: "restrict" }),
    prepareRequest: jsonb("prepare_request").notNull(), prepareRequestDigest: text("prepare_request_digest").notNull() };
}
function decisionEvidence() {
  return { decisionRequest: jsonb("decision_request"), decisionRequestDigest: text("decision_request_digest"),
    decisionCorrelationId: uuid("decision_correlation_id") };
}

// Source-only draft. Generated SQL, RLS, command/event guards, source approval,
// and actual signed Auth checks must accompany these tables before runtime use.
export const financeAgreementSeries = pgTable("finance_agreement_series", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
  vendorOrganizationId: uuid("vendor_organization_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
  businessScope: text("business_scope").notNull().default("commission"),
  revision: integer("revision").notNull().default(0),
  createdByIdentityId: uuid("created_by_identity_id").notNull().references(() => identities.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex("finance_agreement_series_scope_uq").on(table.organizationId, table.id),
  // Exactly one authority series for the initial supported vendor business scope.
  uniqueIndex("finance_agreement_series_vendor_scope_uq").on(table.vendorOrganizationId, table.businessScope),
  check("finance_agreement_series_org_ck", sql`${table.organizationId} <> ${table.vendorOrganizationId}`),
  check("finance_agreement_series_business_ck", sql`${table.businessScope} = 'commission'`),
  check("finance_agreement_series_revision_ck", sql`${table.revision} >= 0`),
]);

export const financeAgreementVersions = pgTable("finance_agreement_versions", {
  id: uuid("id").primaryKey().defaultRandom(), organizationId: uuid("organization_id").notNull(),
  agreementId: uuid("agreement_id").notNull(), version: integer("version").notNull(),
  predecessorVersionId: uuid("predecessor_version_id"), expectedSeriesRevision: integer("expected_series_revision").notNull(),
  sourceDocumentId: uuid("source_document_id").notNull(), sourceVersionId: uuid("source_version_id").notNull(),
  sourceSha256: text("source_sha256").notNull(), sourceDigest: text("source_digest").notNull(),
  sourceObservation: jsonb("source_observation").notNull(),
  effectiveFrom: timestamp("effective_from", { withTimezone: true, mode: "string" }).notNull(),
  statedEffectiveEnd: timestamp("stated_effective_end", { withTimezone: true, mode: "string" }),
  replacementSourceReference: text("replacement_source_reference"),
  calculationType: text("calculation_type").notNull(), rateBasisPoints: integer("rate_basis_points"),
  flatAmountMinorUnits: bigint("flat_amount_minor_units", { mode: "number" }), currency: text("currency"),
  unsupportedSourceTermReference: text("unsupported_source_term_reference"),
  conditionReferences: jsonb("condition_references").notNull().default([]),
  state: text("state").notNull().default("pending"), revision: integer("revision").notNull().default(1),
  preparedByIdentityId: uuid("prepared_by_identity_id").notNull().references(() => identities.id, { onDelete: "restrict" }),
  preparedAt: timestamp("prepared_at", { withTimezone: true }).notNull().defaultNow(),
  decidedByIdentityId: uuid("decided_by_identity_id").references(() => identities.id, { onDelete: "restrict" }),
  decidedAt: timestamp("decided_at", { withTimezone: true }), decisionReason: text("decision_reason"), reviewReference: text("review_reference"),
  reviewedAccessId: uuid("reviewed_access_id"), decisionReceiptId: uuid("decision_receipt_id").references(() => securityCommandReceipts.id, { onDelete: "restrict" }),
  correlationId: uuid("correlation_id").notNull(),
  ...preparationEvidence(), ...decisionEvidence(),
}, table => [
  uniqueIndex("finance_agreement_versions_scope_uq").on(table.organizationId, table.id),
  uniqueIndex("finance_agreement_versions_series_identity_uq").on(table.organizationId, table.agreementId, table.id),
  uniqueIndex("finance_agreement_versions_series_version_uq").on(table.agreementId, table.version),
  index("finance_agreement_versions_effective_idx").on(table.agreementId, table.state, table.effectiveFrom),
  foreignKey({ columns: [table.organizationId, table.agreementId], foreignColumns: [financeAgreementSeries.organizationId, financeAgreementSeries.id],
    name: "finance_agreement_versions_series_fk" }).onDelete("restrict"),
  foreignKey({ columns: [table.organizationId, table.sourceDocumentId, table.sourceVersionId],
    foreignColumns: [financeDocumentSources.organizationId, financeDocumentSources.documentId, financeDocumentSources.versionId],
    name: "finance_agreement_versions_source_fk" }).onDelete("restrict"),
  foreignKey({ columns: [table.organizationId, table.agreementId, table.predecessorVersionId],
    foreignColumns: [table.organizationId, table.agreementId, table.id], name: "finance_agreement_versions_predecessor_fk" }).onDelete("restrict"),
  check("finance_agreement_versions_hash_ck", sql`${table.sourceSha256} ~ '^[a-f0-9]{64}$' and ${table.sourceDigest} ~ '^[a-f0-9]{64}$'`),
  check("finance_agreement_versions_dates_ck", sql`${table.statedEffectiveEnd} is null or ${table.statedEffectiveEnd} > ${table.effectiveFrom}`),
  check("finance_agreement_versions_lineage_ck", sql`${table.version} > 0 and ${table.expectedSeriesRevision} >= 0
    and ((${table.predecessorVersionId} is null and ${table.expectedSeriesRevision} = 0 and ${table.replacementSourceReference} is null)
      or (${table.predecessorVersionId} is not null and ${table.expectedSeriesRevision} > 0 and ${table.replacementSourceReference} is not null))`),
  check("finance_agreement_versions_rule_ck", sql`(${table.calculationType} = 'flat_amount' and ${table.flatAmountMinorUnits} is not null and ${table.flatAmountMinorUnits} between 0 and 9007199254740991
      and ${table.rateBasisPoints} is null and ${table.currency} is not null and ${table.currency} ~ '^[A-Z]{3}$' and ${table.unsupportedSourceTermReference} is null)
    or (${table.calculationType} = 'contract_value_rate' and ${table.rateBasisPoints} is not null and ${table.rateBasisPoints} between 0 and 10000 and ${table.flatAmountMinorUnits} is null
      and ${table.currency} is not null and ${table.currency} ~ '^[A-Z]{3}$' and ${table.unsupportedSourceTermReference} is null)
    or (${table.calculationType} = 'unsupported' and ${table.flatAmountMinorUnits} is null and ${table.rateBasisPoints} is null
      and ${table.currency} is null and ${table.unsupportedSourceTermReference} is not null)`),
  check("finance_agreement_versions_conditions_ck", sql`jsonb_typeof(${table.conditionReferences}) = 'array'
    and jsonb_array_length(${table.conditionReferences}) <= 50 and octet_length(${table.conditionReferences}::text) <= 30000`),
  check("finance_agreement_versions_receipt_ck", sql`${table.prepareRequestDigest} ~ '^[a-f0-9]{64}$'
    and jsonb_typeof(${table.prepareRequest}) = 'object' and octet_length(${table.prepareRequest}::text) <= 100000
    and ((${table.state} = 'pending' and ${table.decisionRequest} is null and ${table.decisionRequestDigest} is null and ${table.decisionCorrelationId} is null)
      or (${table.state} in ('approved','rejected') and ${table.decisionRequest} is not null and jsonb_typeof(${table.decisionRequest}) = 'object'
        and ${table.decisionRequestDigest} is not null and ${table.decisionRequestDigest} ~ '^[a-f0-9]{64}$' and ${table.decisionCorrelationId} is not null))`),
  check("finance_agreement_versions_decision_ck", sql`(${table.state} = 'pending' and ${table.revision} = 1 and ${table.decidedByIdentityId} is null
      and ${table.decidedAt} is null and ${table.decisionReceiptId} is null and ${table.reviewedAccessId} is null
      and ${table.decisionReason} is null and ${table.reviewReference} is null)
    or (${table.state} in ('approved','rejected') and ${table.revision} = 2 and ${table.decidedByIdentityId} is not null
      and ${table.decidedByIdentityId} <> ${table.preparedByIdentityId} and ${table.decidedAt} is not null and ${table.decidedAt} >= ${table.preparedAt}
      and ${table.decisionReceiptId} is not null and ${table.reviewedAccessId} is not null and ${table.decisionReason} is not null and ${table.reviewReference} is not null)`),
]);

// Immutable amendment history computes half-open intervals without modifying
// predecessor terms. The command locks the series and forbids branches.
export const financeAgreementApplicability = pgTable("finance_agreement_applicability", {
  id: uuid("id").primaryKey().defaultRandom(), organizationId: uuid("organization_id").notNull(),
  agreementId: uuid("agreement_id").notNull(), versionId: uuid("version_id").notNull(), predecessorVersionId: uuid("predecessor_version_id"),
  seriesRevision: integer("series_revision").notNull(), cutoverAt: timestamp("cutover_at", { withTimezone: true, mode: "string" }).notNull(),
  approvalReceiptId: uuid("approval_receipt_id").notNull().references(() => securityCommandReceipts.id, { onDelete: "restrict" }),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex("finance_agreement_applicability_scope_uq").on(table.organizationId, table.id),
  uniqueIndex("finance_agreement_applicability_binding_uq").on(table.organizationId, table.agreementId, table.versionId, table.id),
  uniqueIndex("finance_agreement_applicability_version_uq").on(table.versionId),
  uniqueIndex("finance_agreement_applicability_predecessor_uq").on(table.predecessorVersionId),
  uniqueIndex("finance_agreement_applicability_series_revision_uq").on(table.agreementId, table.seriesRevision),
  uniqueIndex("finance_agreement_applicability_cutover_uq").on(table.agreementId, table.cutoverAt),
  foreignKey({ columns: [table.organizationId, table.agreementId], foreignColumns: [financeAgreementSeries.organizationId, financeAgreementSeries.id], name: "finance_agreement_applicability_series_fk" }).onDelete("restrict"),
  foreignKey({ columns: [table.organizationId, table.agreementId, table.versionId], foreignColumns: [financeAgreementVersions.organizationId, financeAgreementVersions.agreementId, financeAgreementVersions.id], name: "finance_agreement_applicability_version_fk" }).onDelete("restrict"),
  foreignKey({ columns: [table.organizationId, table.agreementId, table.predecessorVersionId], foreignColumns: [financeAgreementVersions.organizationId, financeAgreementVersions.agreementId, financeAgreementVersions.id], name: "finance_agreement_applicability_predecessor_fk" }).onDelete("restrict"),
  check("finance_agreement_applicability_revision_ck", sql`${table.seriesRevision} > 0`),
]);

export const financeContractFactsVersions = pgTable("finance_contract_facts_versions", {
  id: uuid("id").primaryKey().defaultRandom(), organizationId: uuid("organization_id").notNull(),
  contractId: uuid("contract_id").notNull(), handoffId: uuid("handoff_id").notNull(), version: integer("version").notNull(),
  predecessorVersionId: uuid("predecessor_version_id"), expectedFactsRevision: integer("expected_facts_revision").notNull(),
  sourceDocumentId: uuid("source_document_id").notNull(), sourceVersionId: uuid("source_version_id").notNull(),
  sourceSha256: text("source_sha256").notNull(), sourceDigest: text("source_digest").notNull(), sourceReference: text("source_reference").notNull(),
  sourceObservation: jsonb("source_observation").notNull(),
  contractValueMinorUnits: bigint("contract_value_minor_units", { mode: "number" }), contractCurrency: text("contract_currency"),
  state: text("state").notNull().default("pending"), revision: integer("revision").notNull().default(1),
  preparedByIdentityId: uuid("prepared_by_identity_id").notNull().references(() => identities.id, { onDelete: "restrict" }),
  preparedAt: timestamp("prepared_at", { withTimezone: true }).notNull().defaultNow(),
  decidedByIdentityId: uuid("decided_by_identity_id").references(() => identities.id, { onDelete: "restrict" }),
  decidedAt: timestamp("decided_at", { withTimezone: true }), decisionReason: text("decision_reason"), reviewReference: text("review_reference"),
  reviewedAccessId: uuid("reviewed_access_id"), decisionReceiptId: uuid("decision_receipt_id").references(() => securityCommandReceipts.id, { onDelete: "restrict" }),
  correlationId: uuid("correlation_id").notNull(),
  ...preparationEvidence(), ...decisionEvidence(),
}, table => [
  uniqueIndex("finance_contract_facts_versions_scope_uq").on(table.organizationId, table.id),
  uniqueIndex("finance_contract_facts_versions_contract_identity_uq").on(table.organizationId, table.contractId, table.id),
  uniqueIndex("finance_contract_facts_versions_contract_version_uq").on(table.organizationId, table.contractId, table.version),
  foreignKey({ columns: [table.organizationId, table.contractId, table.handoffId], foreignColumns: [portalContractHandoffDetails.organizationId, portalContractHandoffDetails.contractId, portalContractHandoffDetails.handoffId], name: "finance_contract_facts_contract_handoff_fk" }).onDelete("restrict"),
  foreignKey({ columns: [table.organizationId, table.sourceDocumentId, table.sourceVersionId], foreignColumns: [financeDocumentSources.organizationId, financeDocumentSources.documentId, financeDocumentSources.versionId], name: "finance_contract_facts_original_fk" }).onDelete("restrict"),
  foreignKey({ columns: [table.organizationId, table.contractId, table.predecessorVersionId], foreignColumns: [table.organizationId, table.contractId, table.id], name: "finance_contract_facts_predecessor_fk" }).onDelete("restrict"),
  check("finance_contract_facts_money_ck", sql`(${table.contractValueMinorUnits} is null or (${table.contractValueMinorUnits} between 0 and 9007199254740991
    and ${table.contractCurrency} is not null)) and (${table.contractCurrency} is null or ${table.contractCurrency} ~ '^[A-Z]{3}$')`),
  check("finance_contract_facts_hash_ck", sql`${table.sourceSha256} ~ '^[a-f0-9]{64}$' and ${table.sourceDigest} ~ '^[a-f0-9]{64}$'`),
  check("finance_contract_facts_receipt_ck", sql`${table.prepareRequestDigest} ~ '^[a-f0-9]{64}$'
    and jsonb_typeof(${table.prepareRequest}) = 'object' and octet_length(${table.prepareRequest}::text) <= 100000
    and ((${table.state} = 'pending' and ${table.decisionRequest} is null and ${table.decisionRequestDigest} is null and ${table.decisionCorrelationId} is null)
      or (${table.state} in ('approved','rejected') and ${table.decisionRequest} is not null and jsonb_typeof(${table.decisionRequest}) = 'object'
        and ${table.decisionRequestDigest} is not null and ${table.decisionRequestDigest} ~ '^[a-f0-9]{64}$' and ${table.decisionCorrelationId} is not null))`),
  check("finance_contract_facts_lineage_ck", sql`${table.version} > 0 and ${table.expectedFactsRevision} >= 0
    and ((${table.predecessorVersionId} is null and ${table.expectedFactsRevision} = 0)
      or (${table.predecessorVersionId} is not null and ${table.expectedFactsRevision} > 0))`),
  check("finance_contract_facts_decision_ck", sql`(${table.state} = 'pending' and ${table.revision} = 1 and ${table.decidedByIdentityId} is null
      and ${table.decidedAt} is null and ${table.reviewedAccessId} is null and ${table.decisionReceiptId} is null
      and ${table.decisionReason} is null and ${table.reviewReference} is null)
    or (${table.state} in ('approved','rejected') and ${table.revision} = 2 and ${table.decidedByIdentityId} is not null
      and ${table.decidedByIdentityId} <> ${table.preparedByIdentityId} and ${table.decidedAt} is not null and ${table.decidedAt} >= ${table.preparedAt}
      and ${table.reviewedAccessId} is not null and ${table.decisionReceiptId} is not null and ${table.decisionReason} is not null and ${table.reviewReference} is not null)`),
]);

export const managedCommissionSources = pgTable("managed_commission_sources", {
  commissionEventId: uuid("commission_event_id").primaryKey(), organizationId: uuid("organization_id").notNull(),
  contractId: uuid("contract_id").notNull(), handoffId: uuid("handoff_id").notNull(),
  structureId: uuid("structure_id"), agreementOrganizationId: uuid("agreement_organization_id").notNull(),
  agreementVersionId: uuid("agreement_version_id").notNull(), applicabilityId: uuid("applicability_id").notNull(),
  agreementId: uuid("agreement_id").notNull(),
  resolvedEffectiveFrom: timestamp("resolved_effective_from", { withTimezone: true, mode: "string" }).notNull(),
  resolvedEffectiveEnd: timestamp("resolved_effective_end", { withTimezone: true, mode: "string" }),
  sourceSnapshot: jsonb("source_snapshot").notNull(), sourceDigest: text("source_digest").notNull(),
  createdByIdentityId: uuid("created_by_identity_id").notNull().references(() => identities.id, { onDelete: "restrict" }),
  receiptId: uuid("receipt_id").notNull().references(() => securityCommandReceipts.id, { onDelete: "restrict" }),
  creationRequest: jsonb("creation_request").notNull(), creationRequestDigest: text("creation_request_digest").notNull(),
  creationCorrelationId: uuid("creation_correlation_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex("managed_commission_sources_scope_uq").on(table.organizationId, table.commissionEventId),
  uniqueIndex("managed_commission_sources_contract_uq").on(table.organizationId, table.contractId),
  foreignKey({ columns: [table.organizationId, table.commissionEventId, table.contractId], foreignColumns: [commissionEvents.organizationId, commissionEvents.id, commissionEvents.contractId], name: "managed_commission_sources_event_fk" }).onDelete("restrict"),
  foreignKey({ columns: [table.organizationId, table.structureId], foreignColumns: [commissionStructures.organizationId, commissionStructures.id], name: "managed_commission_sources_structure_fk" }).onDelete("restrict"),
  foreignKey({ columns: [table.organizationId, table.contractId, table.handoffId], foreignColumns: [portalContractHandoffDetails.organizationId, portalContractHandoffDetails.contractId, portalContractHandoffDetails.handoffId], name: "managed_commission_sources_contract_handoff_fk" }).onDelete("restrict"),
  foreignKey({ columns: [table.agreementOrganizationId, table.agreementId, table.agreementVersionId, table.applicabilityId], foreignColumns: [financeAgreementApplicability.organizationId, financeAgreementApplicability.agreementId, financeAgreementApplicability.versionId, financeAgreementApplicability.id], name: "managed_commission_sources_applicability_fk" }).onDelete("restrict"),
  check("managed_commission_sources_request_ck", sql`${table.creationRequestDigest} ~ '^[a-f0-9]{64}$' and jsonb_typeof(${table.creationRequest}) = 'object' and octet_length(${table.creationRequest}::text) <= 100000`),
  check("managed_commission_sources_dates_ck", sql`${table.resolvedEffectiveEnd} is null or ${table.resolvedEffectiveEnd} > ${table.resolvedEffectiveFrom}`),
  check("managed_commission_sources_digest_ck", sql`${table.sourceDigest} ~ '^[a-f0-9]{64}$' and jsonb_typeof(${table.sourceSnapshot}) = 'object'
    and octet_length(${table.sourceSnapshot}::text) <= 100000`),
]);

export const managedCommissionCalculations = pgTable("managed_commission_calculations", {
  id: uuid("id").primaryKey().defaultRandom(), organizationId: uuid("organization_id").notNull(), commissionEventId: uuid("commission_event_id").notNull(),
  calculationRevision: integer("calculation_revision").notNull(), factsVersionId: uuid("facts_version_id").notNull(),
  contractId: uuid("contract_id").notNull(), expectedEventRevision: integer("expected_event_revision").notNull(),
  sourceDigest: text("source_digest").notNull(), inputSnapshot: jsonb("input_snapshot").notNull(),
  resultSnapshot: jsonb("result_snapshot").notNull(), algorithm: text("algorithm").notNull(),
  amountMinorUnits: bigint("amount_minor_units", { mode: "number" }), currency: text("currency"),
  state: text("state").notNull().default("pending"), revision: integer("revision").notNull().default(1),
  preparedByIdentityId: uuid("prepared_by_identity_id").notNull().references(() => identities.id, { onDelete: "restrict" }),
  preparedAt: timestamp("prepared_at", { withTimezone: true }).notNull().defaultNow(),
  decidedByIdentityId: uuid("decided_by_identity_id").references(() => identities.id, { onDelete: "restrict" }),
  decidedAt: timestamp("decided_at", { withTimezone: true }), decisionReason: text("decision_reason"), reviewReference: text("review_reference"),
  decisionReceiptId: uuid("decision_receipt_id").references(() => securityCommandReceipts.id, { onDelete: "restrict" }),
  correlationId: uuid("correlation_id").notNull(), ...preparationEvidence(), ...decisionEvidence(),
}, table => [
  uniqueIndex("managed_commission_calculations_scope_uq").on(table.organizationId, table.id),
  uniqueIndex("managed_commission_calculations_event_identity_uq").on(table.organizationId, table.commissionEventId, table.id),
  uniqueIndex("managed_commission_calculations_revision_uq").on(table.commissionEventId, table.calculationRevision),
  foreignKey({ columns: [table.organizationId, table.commissionEventId], foreignColumns: [managedCommissionSources.organizationId, managedCommissionSources.commissionEventId], name: "managed_commission_calculations_source_fk" }).onDelete("restrict"),
  foreignKey({ columns: [table.organizationId, table.commissionEventId, table.contractId], foreignColumns: [commissionEvents.organizationId, commissionEvents.id, commissionEvents.contractId], name: "managed_commission_calculations_event_contract_fk" }).onDelete("restrict"),
  foreignKey({ columns: [table.organizationId, table.contractId, table.factsVersionId], foreignColumns: [financeContractFactsVersions.organizationId, financeContractFactsVersions.contractId, financeContractFactsVersions.id], name: "managed_commission_calculations_facts_fk" }).onDelete("restrict"),
  check("managed_commission_calculations_receipt_ck", sql`${table.expectedEventRevision} > 0 and ${table.prepareRequestDigest} ~ '^[a-f0-9]{64}$'
    and jsonb_typeof(${table.prepareRequest}) = 'object' and octet_length(${table.prepareRequest}::text) <= 100000
    and ((${table.state} = 'pending' and ${table.decisionRequest} is null and ${table.decisionRequestDigest} is null and ${table.decisionCorrelationId} is null)
      or (${table.state} in ('approved','rejected') and ${table.decisionRequest} is not null and jsonb_typeof(${table.decisionRequest}) = 'object'
        and ${table.decisionRequestDigest} is not null and ${table.decisionRequestDigest} ~ '^[a-f0-9]{64}$' and ${table.decisionCorrelationId} is not null))`),
  check("managed_commission_calculations_algorithm_ck", sql`${table.algorithm} = 'managed_commission_minor_units_half_up_v1' and ${table.calculationRevision} > 0`),
  check("managed_commission_calculations_money_ck", sql`(${table.amountMinorUnits} is null and ${table.currency} is null)
    or (${table.amountMinorUnits} is not null and ${table.amountMinorUnits} between 0 and 9007199254740991 and ${table.currency} is not null and ${table.currency} ~ '^[A-Z]{3}$')`),
  check("managed_commission_calculations_snapshot_ck", sql`${table.sourceDigest} ~ '^[a-f0-9]{64}$' and jsonb_typeof(${table.inputSnapshot}) = 'object'
    and jsonb_typeof(${table.resultSnapshot}) = 'object' and octet_length(${table.inputSnapshot}::text) <= 100000
    and octet_length(${table.resultSnapshot}::text) <= 100000`),
  check("managed_commission_calculations_decision_ck", sql`(${table.state} = 'pending' and ${table.revision} = 1 and ${table.decidedByIdentityId} is null
      and ${table.decidedAt} is null and ${table.decisionReceiptId} is null and ${table.decisionReason} is null and ${table.reviewReference} is null)
    or (${table.state} in ('approved','rejected') and ${table.revision} = 2 and ${table.decidedByIdentityId} is not null
      and ${table.decidedByIdentityId} <> ${table.preparedByIdentityId} and ${table.decidedAt} is not null and ${table.decidedAt} >= ${table.preparedAt}
      and ${table.decisionReceiptId} is not null and ${table.decisionReason} is not null and ${table.reviewReference} is not null
      and (${table.state} <> 'approved' or (${table.amountMinorUnits} is not null and ${table.currency} is not null)))`),
]);

// Private by forced RLS and grants. Each business mutation has one exact row
// snapshot and receipt; public audit summaries retain their existing safe shape.
export const managedFinanceEvents = pgTable("managed_finance_events", {
  id: uuid("id").primaryKey().defaultRandom(), organizationId: uuid("organization_id").notNull(),
  entityType: text("entity_type").notNull(), entityId: uuid("entity_id").notNull(),
  revision: integer("revision").notNull(), action: text("action").notNull(),
  actorIdentityId: uuid("actor_identity_id").notNull().references(() => identities.id, { onDelete: "restrict" }),
  receiptId: uuid("receipt_id").notNull().references(() => securityCommandReceipts.id, { onDelete: "restrict" }),
  correlationId: uuid("correlation_id").notNull(), snapshot: jsonb("snapshot").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex("managed_finance_events_entity_revision_uq").on(table.entityType, table.entityId, table.revision),
  uniqueIndex("managed_finance_events_receipt_uq").on(table.receiptId),
  check("managed_finance_events_type_ck", sql`${table.entityType} in ('finance_agreement_version','finance_contract_facts_version','managed_commission_calculation','commission_event')`),
  check("managed_finance_events_revision_ck", sql`${table.revision} > 0`),
  check("managed_finance_events_snapshot_ck", sql`jsonb_typeof(${table.snapshot}) = 'object' and octet_length(${table.snapshot}::text) <= 400000`),
]);
