import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { identities, orgs } from "./identity";
import { deals } from "./crm-workflow";
import { rfpRecipients } from "./workflow-foundation";

const demoStatuses = sql`'requested', 'scheduled', 'completed', 'cancelled', 'no_show'`;
const proposalStatuses = sql`'received', 'under_review', 'revision_requested', 'approved_for_comparison', 'superseded', 'withdrawn'`;
const handoffStatuses = sql`'introduction_pending', 'introduced', 'negotiating', 'stalled', 'signed', 'not_signed', 'cancelled'`;

export const demoRounds = pgTable("demo_rounds", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
  dealId: uuid("deal_id").notNull(),
  customerOrganizationId: uuid("customer_organization_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
  vendorOrganizationId: uuid("vendor_organization_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
  requestedByIdentityId: uuid("requested_by_identity_id").notNull().references(() => identities.id, { onDelete: "restrict" }),
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull(),
  status: text("status").notNull().default("requested"),
  scheduledStartAt: timestamp("scheduled_start_at", { withTimezone: true }),
  scheduledEndAt: timestamp("scheduled_end_at", { withTimezone: true }),
  meetingReference: text("meeting_reference"),
  portalRecipientId: uuid("portal_recipient_id"),
  coordination: jsonb("coordination"),
  revision: integer("revision").notNull().default(1),
  correlationId: uuid("correlation_id").notNull().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("demo_rounds_organization_id_id_uq").on(t.organizationId, t.id),
  index("demo_rounds_organization_status_idx").on(t.organizationId, t.status, t.requestedAt),
  foreignKey({ columns: [t.organizationId, t.dealId], foreignColumns: [deals.organizationId, deals.id], name: "demo_rounds_deal_scope_fk" }),
  foreignKey({ columns: [t.organizationId, t.portalRecipientId], foreignColumns: [rfpRecipients.organizationId, rfpRecipients.id], name: "demo_rounds_portal_recipient_fk" }).onDelete("restrict"),
  check("demo_rounds_coordination_ck", sql`(${t.portalRecipientId} is null and ${t.coordination} is null) or (${t.portalRecipientId} is not null and ${t.coordination} is not null and jsonb_typeof(${t.coordination}) = 'object')`),
  check("demo_rounds_status_ck", sql`${t.status} in (${demoStatuses})`),
  check("demo_rounds_scope_ck", sql`${t.organizationId} = ${t.customerOrganizationId} and ${t.customerOrganizationId} <> ${t.vendorOrganizationId}`),
  check("demo_rounds_schedule_ck", sql`(${t.status} = 'scheduled' and ${t.scheduledStartAt} is not null and ${t.scheduledEndAt} is not null and ${t.meetingReference} is not null) or (${t.status} <> 'scheduled' and ${t.scheduledStartAt} is null and ${t.scheduledEndAt} is null and ${t.meetingReference} is null)`),
  check("demo_rounds_revision_ck", sql`${t.revision} > 0`),
  check("demo_rounds_time_ck", sql`${t.scheduledEndAt} is null or ${t.scheduledEndAt} > ${t.scheduledStartAt}`),
  check("demo_rounds_updated_ck", sql`${t.updatedAt} >= ${t.createdAt}`),
]);

export const demoCoordinationEvents = pgTable("demo_coordination_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
  demoId: uuid("demo_id").notNull(),
  revision: integer("revision").notNull(),
  action: text("action").notNull(),
  actorIdentityId: uuid("actor_identity_id").notNull().references(() => identities.id, { onDelete: "restrict" }),
  snapshot: jsonb("snapshot").notNull(),
  correlationId: uuid("correlation_id").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("demo_coordination_events_revision_uq").on(t.demoId, t.revision),
  foreignKey({ columns: [t.organizationId, t.demoId], foreignColumns: [demoRounds.organizationId, demoRounds.id], name: "demo_coordination_events_scope_fk" }).onDelete("restrict"),
  check("demo_coordination_events_revision_ck", sql`${t.revision} > 0`),
  check("demo_coordination_events_action_ck", sql`${t.action} in ('create', 'customer_availability', 'vendor_availability', 'confirm', 'reopen', 'complete', 'cancel', 'no_show')`),
  check("demo_coordination_events_snapshot_ck", sql`jsonb_typeof(${t.snapshot}) = 'object'`),
]);

export const demoRoundHistory = pgTable("demo_round_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
  demoId: uuid("demo_id").notNull(),
  fromStatus: text("from_status").notNull(),
  toStatus: text("to_status").notNull(),
  expectedRevision: integer("expected_revision").notNull(),
  actorIdentityId: uuid("actor_identity_id").notNull().references(() => identities.id, { onDelete: "restrict" }),
  reason: text("reason").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  correlationId: uuid("correlation_id").notNull(),
}, (t) => [
  index("demo_round_history_scope_time_idx").on(t.organizationId, t.demoId, t.occurredAt),
  foreignKey({ columns: [t.organizationId, t.demoId], foreignColumns: [demoRounds.organizationId, demoRounds.id], name: "demo_round_history_scope_fk" }),
  check("demo_round_history_revision_ck", sql`${t.expectedRevision} > 0`),
  check("demo_round_history_reason_ck", sql`length(btrim(${t.reason})) between 1 and 2000`),
]);

export const demoFeedback = pgTable("demo_feedback", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
  demoId: uuid("demo_id").notNull(),
  submittedByIdentityId: uuid("submitted_by_identity_id").notNull().references(() => identities.id, { onDelete: "restrict" }),
  score: integer("score").notNull(),
  feedback: text("feedback").notNull(),
  evidenceReferences: jsonb("evidence_references").notNull().default([]),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("demo_feedback_scope_time_idx").on(t.organizationId, t.demoId, t.submittedAt),
  foreignKey({ columns: [t.organizationId, t.demoId], foreignColumns: [demoRounds.organizationId, demoRounds.id], name: "demo_feedback_scope_fk" }),
  check("demo_feedback_score_ck", sql`${t.score} between 1 and 5`),
  check("demo_feedback_text_ck", sql`length(btrim(${t.feedback})) between 1 and 5000`),
  check("demo_feedback_refs_ck", sql`jsonb_typeof(${t.evidenceReferences}) = 'array'`),
]);

export const proposalVersions = pgTable("proposal_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
  dealId: uuid("deal_id").notNull(),
  vendorOrganizationId: uuid("vendor_organization_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
  versionNumber: integer("version_number").notNull(),
  status: text("status").notNull().default("received"),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
  sourceReferences: jsonb("source_references").notNull(),
  pricing: jsonb("pricing").notNull(),
  createdByIdentityId: uuid("created_by_identity_id").notNull().references(() => identities.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("proposal_versions_organization_deal_vendor_version_uq").on(t.organizationId, t.dealId, t.vendorOrganizationId, t.versionNumber),
  uniqueIndex("proposal_versions_organization_id_uq").on(t.organizationId, t.id),
  foreignKey({ columns: [t.organizationId, t.dealId], foreignColumns: [deals.organizationId, deals.id], name: "proposal_versions_deal_scope_fk" }),
  check("proposal_versions_status_ck", sql`${t.status} in (${proposalStatuses})`),
  check("proposal_versions_version_ck", sql`${t.versionNumber} > 0`),
  check("proposal_versions_refs_ck", sql`jsonb_typeof(${t.sourceReferences}) = 'array' and jsonb_array_length(${t.sourceReferences}) > 0`),
  check("proposal_versions_pricing_ck", sql`jsonb_typeof(${t.pricing}) = 'object'`),
]);

export const proposalComparisons = pgTable("proposal_comparisons", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
  dealId: uuid("deal_id").notNull(),
  proposalVersionIds: jsonb("proposal_version_ids").notNull(),
  approvedByIdentityIds: jsonb("approved_by_identity_ids").notNull(),
  approvedAt: timestamp("approved_at", { withTimezone: true }).notNull(),
  createdByIdentityId: uuid("created_by_identity_id").notNull().references(() => identities.id, { onDelete: "restrict" }),
  correlationId: uuid("correlation_id").notNull(),
}, (t) => [
  uniqueIndex("proposal_comparisons_organization_id_uq").on(t.organizationId, t.id),
  foreignKey({ columns: [t.organizationId, t.dealId], foreignColumns: [deals.organizationId, deals.id], name: "proposal_comparisons_deal_scope_fk" }),
  check("proposal_comparisons_versions_ck", sql`jsonb_typeof(${t.proposalVersionIds}) = 'array' and jsonb_array_length(${t.proposalVersionIds}) between 2 and 50`),
  check("proposal_comparisons_approvers_ck", sql`jsonb_typeof(${t.approvedByIdentityIds}) = 'array' and jsonb_array_length(${t.approvedByIdentityIds}) between 1 and 10`),
]);

export const contractHandoffs = pgTable("contract_handoffs", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
  dealId: uuid("deal_id").notNull(),
  customerOrganizationId: uuid("customer_organization_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
  vendorOrganizationId: uuid("vendor_organization_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
  selectionReasons: jsonb("selection_reasons").notNull(),
  remainingRisks: jsonb("remaining_risks").notNull().default([]),
  approvedByIdentityIds: jsonb("approved_by_identity_ids").notNull(),
  approvedAt: timestamp("approved_at", { withTimezone: true }).notNull(),
  status: text("status").notNull().default("introduction_pending"),
  revision: integer("revision").notNull().default(1),
  correlationId: uuid("correlation_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("contract_handoffs_organization_id_uq").on(t.organizationId, t.id),
  foreignKey({ columns: [t.organizationId, t.dealId], foreignColumns: [deals.organizationId, deals.id], name: "contract_handoffs_deal_scope_fk" }),
  check("contract_handoffs_scope_ck", sql`${t.organizationId} = ${t.customerOrganizationId} and ${t.customerOrganizationId} <> ${t.vendorOrganizationId}`),
  check("contract_handoffs_status_ck", sql`${t.status} in (${handoffStatuses})`),
  check("contract_handoffs_reasons_ck", sql`jsonb_typeof(${t.selectionReasons}) = 'array' and jsonb_array_length(${t.selectionReasons}) between 1 and 10`),
  check("contract_handoffs_risks_ck", sql`jsonb_typeof(${t.remainingRisks}) = 'array'`),
  check("contract_handoffs_approvers_ck", sql`jsonb_typeof(${t.approvedByIdentityIds}) = 'array' and jsonb_array_length(${t.approvedByIdentityIds}) between 1 and 10`),
  check("contract_handoffs_revision_ck", sql`${t.revision} > 0`),
]);

export const contractHandoffHistory = pgTable("contract_handoff_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
  handoffId: uuid("handoff_id").notNull(),
  fromStatus: text("from_status").notNull(),
  toStatus: text("to_status").notNull(),
  actorIdentityId: uuid("actor_identity_id").notNull().references(() => identities.id, { onDelete: "restrict" }),
  reason: text("reason").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  correlationId: uuid("correlation_id").notNull(),
}, (t) => [
  index("contract_handoff_history_scope_time_idx").on(t.organizationId, t.handoffId, t.occurredAt),
  foreignKey({ columns: [t.organizationId, t.handoffId], foreignColumns: [contractHandoffs.organizationId, contractHandoffs.id], name: "contract_handoff_history_scope_fk" }),
  check("contract_handoff_history_reason_ck", sql`length(btrim(${t.reason})) between 1 and 2000`),
]);
