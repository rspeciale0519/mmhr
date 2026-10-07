import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { identities, orgs } from "./identity";
import { intakes } from "./r3-intake";
import { proposalVersions } from "./r6-workflow";
import { rfpRecipients } from "./workflow-foundation";

// Each structured portal quote is an immutable source artifact. Review changes
// state and records decisions; it never changes the original quote or price.
export const proposalQuoteSources = pgTable("proposal_quote_sources", {
  proposalVersionId: uuid("proposal_version_id").primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
  intakeId: uuid("intake_id").notNull(),
  recipientId: uuid("recipient_id").notNull(),
  originalQuote: jsonb("original_quote").notNull(),
  sourceHash: text("source_hash").notNull(),
  state: text("state").notNull().default("received"),
  revision: integer("revision").notNull().default(1),
  submittedByIdentityId: uuid("submitted_by_identity_id").notNull().references(() => identities.id, { onDelete: "restrict" }),
  reviewedByIdentityId: uuid("reviewed_by_identity_id").references(() => identities.id, { onDelete: "restrict" }),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  approvedByIdentityId: uuid("approved_by_identity_id").references(() => identities.id, { onDelete: "restrict" }),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  approvalReference: text("approval_reference"),
  reason: text("reason"),
  correlationId: uuid("correlation_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("proposal_quote_sources_scope_uq").on(t.organizationId, t.proposalVersionId),
  index("proposal_quote_sources_recipient_idx").on(t.recipientId, t.proposalVersionId),
  index("proposal_quote_sources_intake_state_idx").on(t.organizationId, t.intakeId, t.state),
  foreignKey({ columns: [t.organizationId, t.proposalVersionId], foreignColumns: [proposalVersions.organizationId, proposalVersions.id], name: "proposal_quote_sources_version_scope_fk" }).onDelete("restrict"),
  foreignKey({ columns: [t.organizationId, t.intakeId], foreignColumns: [intakes.organizationId, intakes.id], name: "proposal_quote_sources_intake_scope_fk" }).onDelete("restrict"),
  foreignKey({ columns: [t.organizationId, t.recipientId], foreignColumns: [rfpRecipients.organizationId, rfpRecipients.id], name: "proposal_quote_sources_recipient_scope_fk" }).onDelete("restrict"),
  check("proposal_quote_sources_original_ck", sql`jsonb_typeof(${t.originalQuote}) = 'object' and octet_length(${t.originalQuote}::text) <= 35000`),
  check("proposal_quote_sources_hash_ck", sql`${t.sourceHash} ~ '^[a-f0-9]{64}$'`),
  check("proposal_quote_sources_state_ck", sql`${t.state} in ('received', 'under_review', 'revision_requested', 'approved_for_comparison', 'superseded', 'withdrawn')`),
  check("proposal_quote_sources_revision_ck", sql`${t.revision} between 1 and 10000`),
  check("proposal_quote_sources_review_ck", sql`(${t.reviewedByIdentityId} is null) = (${t.reviewedAt} is null)`),
  check("proposal_quote_sources_approval_ck", sql`(${t.approvedByIdentityId} is null and ${t.approvedAt} is null and ${t.approvalReference} is null)
    or (${t.approvedByIdentityId} is not null and ${t.approvedAt} is not null and ${t.approvalReference} is not null
      and ${t.reviewedByIdentityId} is not null and ${t.approvedByIdentityId} <> ${t.reviewedByIdentityId}
      and ${t.approvedByIdentityId} <> ${t.submittedByIdentityId} and ${t.reviewedByIdentityId} <> ${t.submittedByIdentityId})`),
  check("proposal_quote_sources_approved_ck", sql`${t.state} <> 'approved_for_comparison' or ${t.approvedByIdentityId} is not null`),
  check("proposal_quote_sources_reason_ck", sql`${t.reason} is null or octet_length(btrim(${t.reason})) between 1 and 2000`),
  check("proposal_quote_sources_reference_ck", sql`${t.approvalReference} is null or octet_length(btrim(${t.approvalReference})) between 1 and 300`),
  check("proposal_quote_sources_updated_ck", sql`${t.updatedAt} >= ${t.createdAt}`),
]);

export const proposalQuoteEvents = pgTable("proposal_quote_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
  proposalVersionId: uuid("proposal_version_id").notNull(),
  revision: integer("revision").notNull(),
  action: text("action").notNull(),
  snapshot: jsonb("snapshot").notNull(),
  actorIdentityId: uuid("actor_identity_id").notNull().references(() => identities.id, { onDelete: "restrict" }),
  correlationId: uuid("correlation_id").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("proposal_quote_events_revision_uq").on(t.proposalVersionId, t.revision),
  foreignKey({ columns: [t.organizationId, t.proposalVersionId], foreignColumns: [proposalQuoteSources.organizationId, proposalQuoteSources.proposalVersionId], name: "proposal_quote_events_scope_fk" }).onDelete("restrict"),
  check("proposal_quote_events_revision_ck", sql`${t.revision} between 1 and 10000`),
  check("proposal_quote_events_action_ck", sql`${t.action} in ('submit', 'review', 'approve', 'request_revision', 'withdraw', 'supersede')`),
  check("proposal_quote_events_snapshot_ck", sql`jsonb_typeof(${t.snapshot}) = 'object' and octet_length(${t.snapshot}::text) <= 10000`),
]);

// Comparison belongs to the customer intake. The included immutable quote
// versions can belong to different vendor deals within that same intake.
export const proposalQuoteComparisons = pgTable("proposal_quote_comparisons", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
  intakeId: uuid("intake_id").notNull(),
  sourceSnapshot: jsonb("source_snapshot").notNull(),
  sourceDigest: text("source_digest").notNull(),
  state: text("state").notNull().default("draft"),
  revision: integer("revision").notNull().default(1),
  preparedByIdentityId: uuid("prepared_by_identity_id").notNull().references(() => identities.id, { onDelete: "restrict" }),
  decidedByIdentityId: uuid("decided_by_identity_id").references(() => identities.id, { onDelete: "restrict" }),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  approvalReference: text("approval_reference"),
  reason: text("reason").notNull(),
  correlationId: uuid("correlation_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("proposal_quote_comparisons_scope_uq").on(t.organizationId, t.id),
  index("proposal_quote_comparisons_intake_idx").on(t.organizationId, t.intakeId, t.createdAt, t.id),
  foreignKey({ columns: [t.organizationId, t.intakeId], foreignColumns: [intakes.organizationId, intakes.id], name: "proposal_quote_comparisons_intake_scope_fk" }).onDelete("restrict"),
  check("proposal_quote_comparisons_sources_ck", sql`jsonb_typeof(${t.sourceSnapshot}) = 'array' and jsonb_array_length(${t.sourceSnapshot}) between 2 and 5 and octet_length(${t.sourceSnapshot}::text) <= 180000`),
  check("proposal_quote_comparisons_digest_ck", sql`${t.sourceDigest} ~ '^[a-f0-9]{64}$'`),
  check("proposal_quote_comparisons_state_ck", sql`${t.state} in ('draft', 'approved', 'rejected')`),
  check("proposal_quote_comparisons_revision_ck", sql`(${t.state} = 'draft' and ${t.revision} = 1 and ${t.decidedByIdentityId} is null and ${t.decidedAt} is null and ${t.approvalReference} is null)
    or (${t.state} in ('approved', 'rejected') and ${t.revision} = 2 and ${t.decidedByIdentityId} is not null and ${t.decidedAt} is not null and ${t.decidedByIdentityId} <> ${t.preparedByIdentityId})`),
  check("proposal_quote_comparisons_approval_ck", sql`(${t.state} = 'approved' and ${t.approvalReference} is not null) or (${t.state} <> 'approved' and ${t.approvalReference} is null)`),
  check("proposal_quote_comparisons_reason_ck", sql`octet_length(btrim(${t.reason})) between 1 and 2000`),
  check("proposal_quote_comparisons_reference_ck", sql`${t.approvalReference} is null or octet_length(btrim(${t.approvalReference})) between 1 and 300`),
]);
