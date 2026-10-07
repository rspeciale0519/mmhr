import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { identities, orgs } from "./identity";
import { deals } from "./crm-workflow";
import { intakes } from "./r3-intake";
import { proposalQuoteComparisons, proposalQuoteSources } from "./r6-proposal-quotes";
import { contractHandoffs } from "./r6-workflow";
import { rfpRecipients } from "./workflow-foundation";

// A customer selects one approved immutable quote. A comparison is optional. Staff
// approval retains the customer's original decision and adds a separate actor.
export const portalContractSelections = pgTable("portal_contract_selections", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
  intakeId: uuid("intake_id").notNull(),
  comparisonId: uuid("comparison_id"),
  proposalVersionId: uuid("proposal_version_id").notNull(),
  recipientId: uuid("recipient_id").notNull(),
  dealId: uuid("deal_id").notNull(),
  sourceHash: text("source_hash").notNull(),
  quoteRevision: integer("quote_revision").notNull(),
  selectionReasons: jsonb("selection_reasons").notNull(),
  remainingRisks: jsonb("remaining_risks").notNull().default([]),
  state: text("state").notNull().default("pending"),
  revision: integer("revision").notNull().default(1),
  selectedByIdentityId: uuid("selected_by_identity_id").notNull().references(() => identities.id, { onDelete: "restrict" }),
  selectedAt: timestamp("selected_at", { withTimezone: true }).notNull().defaultNow(),
  decidedByIdentityId: uuid("decided_by_identity_id").references(() => identities.id, { onDelete: "restrict" }),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  decisionReason: text("decision_reason"),
  approvalReference: text("approval_reference"),
  handoffId: uuid("handoff_id"),
  correlationId: uuid("correlation_id").notNull(),
}, (t) => [
  uniqueIndex("portal_contract_selections_scope_uq").on(t.organizationId, t.id),
  uniqueIndex("portal_contract_selections_handoff_uq").on(t.handoffId),
  index("portal_contract_selections_intake_idx").on(t.organizationId, t.intakeId, t.id),
  foreignKey({ columns: [t.organizationId, t.intakeId], foreignColumns: [intakes.organizationId, intakes.id], name: "portal_contract_selection_intake_fk" }).onDelete("restrict"),
  foreignKey({ columns: [t.organizationId, t.comparisonId], foreignColumns: [proposalQuoteComparisons.organizationId, proposalQuoteComparisons.id], name: "portal_contract_selection_comparison_fk" }).onDelete("restrict"),
  foreignKey({ columns: [t.organizationId, t.proposalVersionId], foreignColumns: [proposalQuoteSources.organizationId, proposalQuoteSources.proposalVersionId], name: "portal_contract_selection_quote_fk" }).onDelete("restrict"),
  foreignKey({ columns: [t.organizationId, t.recipientId], foreignColumns: [rfpRecipients.organizationId, rfpRecipients.id], name: "portal_contract_selection_recipient_fk" }).onDelete("restrict"),
  foreignKey({ columns: [t.organizationId, t.dealId], foreignColumns: [deals.organizationId, deals.id], name: "portal_contract_selection_deal_fk" }).onDelete("restrict"),
  foreignKey({ columns: [t.organizationId, t.handoffId], foreignColumns: [contractHandoffs.organizationId, contractHandoffs.id], name: "portal_contract_selection_handoff_fk" }).onDelete("restrict"),
  check("portal_contract_selection_hash_ck", sql`${t.sourceHash} ~ '^[a-f0-9]{64}$'`),
  check("portal_contract_selection_quote_revision_ck", sql`${t.quoteRevision} between 1 and 9999`),
  check("portal_contract_selection_reasons_ck", sql`jsonb_typeof(${t.selectionReasons}) = 'array' and jsonb_array_length(${t.selectionReasons}) between 1 and 10 and octet_length(${t.selectionReasons}::text) <= 6000`),
  check("portal_contract_selection_risks_ck", sql`jsonb_typeof(${t.remainingRisks}) = 'array' and jsonb_array_length(${t.remainingRisks}) <= 20 and octet_length(${t.remainingRisks}::text) <= 12000`),
  check("portal_contract_selection_state_ck", sql`${t.state} in ('pending', 'approved', 'rejected', 'withdrawn')`),
  check("portal_contract_selection_decision_ck", sql`(${t.state} = 'pending' and ${t.revision} = 1 and ${t.decidedByIdentityId} is null and ${t.decidedAt} is null and ${t.decisionReason} is null and ${t.approvalReference} is null and ${t.handoffId} is null)
    or (${t.state} in ('approved', 'rejected', 'withdrawn') and ${t.revision} = 2 and ${t.decidedByIdentityId} is not null and ${t.decidedAt} is not null and ${t.decidedAt} >= ${t.selectedAt} and ${t.decisionReason} is not null)`),
  check("portal_contract_selection_approval_ck", sql`(${t.state} = 'approved' and ${t.approvalReference} is not null and ${t.handoffId} is not null and ${t.decidedByIdentityId} <> ${t.selectedByIdentityId})
    or (${t.state} <> 'approved' and ${t.approvalReference} is null and ${t.handoffId} is null)`),
  check("portal_contract_selection_reason_ck", sql`${t.decisionReason} is null or octet_length(btrim(${t.decisionReason})) between 1 and 2000`),
  check("portal_contract_selection_reference_ck", sql`${t.approvalReference} is null or octet_length(btrim(${t.approvalReference})) between 1 and 300`),
]);

// This expands the legacy handoff record with current portal associations and
// immutable introduction and signature evidence. Terminal history stays intact.
export const portalContractHandoffDetails = pgTable("portal_contract_handoff_details", {
  handoffId: uuid("handoff_id").primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
  selectionId: uuid("selection_id").notNull(),
  introducedAt: timestamp("introduced_at", { withTimezone: true }),
  introductionReference: text("introduction_reference"),
  introducedByIdentityId: uuid("introduced_by_identity_id").references(() => identities.id, { onDelete: "restrict" }),
  signedAt: timestamp("signed_at", { withTimezone: true }),
  contractReference: text("contract_reference"),
  contractId: uuid("contract_id"),
  signatureRecordedByIdentityId: uuid("signature_recorded_by_identity_id").references(() => identities.id, { onDelete: "restrict" }),
  correlationId: uuid("correlation_id").notNull(),
}, (t) => [
  uniqueIndex("portal_contract_handoff_details_scope_uq").on(t.organizationId, t.handoffId),
  uniqueIndex("portal_contract_handoff_details_selection_uq").on(t.selectionId),
  uniqueIndex("portal_contract_handoff_details_contract_uq").on(t.organizationId, t.contractId),
  uniqueIndex("portal_contract_handoff_details_contract_identity_uq").on(t.organizationId, t.contractId, t.handoffId),
  foreignKey({ columns: [t.organizationId, t.handoffId], foreignColumns: [contractHandoffs.organizationId, contractHandoffs.id], name: "portal_contract_detail_handoff_fk" }).onDelete("restrict"),
  foreignKey({ columns: [t.organizationId, t.selectionId], foreignColumns: [portalContractSelections.organizationId, portalContractSelections.id], name: "portal_contract_detail_selection_fk" }).onDelete("restrict"),
  check("portal_contract_detail_introduction_ck", sql`(${t.introducedAt} is null and ${t.introductionReference} is null and ${t.introducedByIdentityId} is null)
    or (${t.introducedAt} is not null and ${t.introductionReference} is not null and ${t.introducedByIdentityId} is not null)`),
  check("portal_contract_detail_signed_ck", sql`(${t.signedAt} is null and ${t.contractReference} is null and ${t.contractId} is null and ${t.signatureRecordedByIdentityId} is null)
    or (${t.signedAt} is not null and ${t.contractReference} is not null and ${t.contractId} is not null and ${t.signatureRecordedByIdentityId} is not null and ${t.introducedAt} is not null and ${t.signedAt} >= ${t.introducedAt})`),
  check("portal_contract_detail_introduction_ref_ck", sql`${t.introductionReference} is null or octet_length(btrim(${t.introductionReference})) between 1 and 500`),
  check("portal_contract_detail_contract_ref_ck", sql`${t.contractReference} is null or octet_length(btrim(${t.contractReference})) between 1 and 500`),
]);

export const portalContractHandoffEvents = pgTable("portal_contract_handoff_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
  handoffId: uuid("handoff_id").notNull(),
  revision: integer("revision").notNull(),
  action: text("action").notNull(),
  fromStatus: text("from_status").notNull(),
  toStatus: text("to_status").notNull(),
  actorIdentityId: uuid("actor_identity_id").notNull().references(() => identities.id, { onDelete: "restrict" }),
  reason: text("reason").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  correlationId: uuid("correlation_id").notNull(),
}, (t) => [
  uniqueIndex("portal_contract_handoff_events_revision_uq").on(t.handoffId, t.revision),
  index("portal_contract_handoff_events_scope_idx").on(t.organizationId, t.handoffId, t.revision),
  foreignKey({ columns: [t.organizationId, t.handoffId], foreignColumns: [portalContractHandoffDetails.organizationId, portalContractHandoffDetails.handoffId], name: "portal_contract_event_detail_fk" }).onDelete("restrict"),
  check("portal_contract_event_revision_ck", sql`${t.revision} between 2 and 9999`),
  check("portal_contract_event_action_ck", sql`${t.action} in ('introduce', 'transition', 'record_signed')`),
  check("portal_contract_event_from_ck", sql`${t.fromStatus} in ('introduction_pending', 'introduced', 'negotiating', 'stalled')`),
  check("portal_contract_event_to_ck", sql`${t.toStatus} in ('introduced', 'negotiating', 'stalled', 'signed', 'not_signed', 'cancelled')`),
  check("portal_contract_event_reason_ck", sql`octet_length(btrim(${t.reason})) between 1 and 2000`),
]);
