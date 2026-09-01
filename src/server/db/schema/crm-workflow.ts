import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { identities, orgs } from "./identity";

export const deals = pgTable("deals", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
  vendorOrganizationId: uuid("vendor_organization_id").references(() => orgs.id, { onDelete: "restrict" }),
  productId: uuid("product_id"),
  ownerIdentityId: uuid("owner_identity_id").notNull().references(() => identities.id, { onDelete: "restrict" }),
  stage: text("stage").notNull().default("lead"),
  status: text("status").notNull().default("open"),
  candidateId: uuid("candidate_id"),
  contractId: uuid("contract_id"),
  expectedCloseAt: timestamp("expected_close_at", { withTimezone: true }),
  revision: integer("revision").notNull().default(1),
  correlationId: uuid("correlation_id").notNull().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("deals_organization_id_id_uq").on(t.organizationId, t.id),
  index("deals_organization_stage_status_idx").on(t.organizationId, t.stage, t.status),
  check("deals_stage_ck", sql`${t.stage} in ('lead', 'discovery', 'evaluation', 'proposal', 'selection', 'contracting', 'won', 'lost', 'archived')`),
  check("deals_status_ck", sql`${t.status} in ('open', 'won', 'lost', 'archived')`),
  check("deals_stage_status_ck", sql`(${t.stage} in ('lead', 'discovery', 'evaluation', 'proposal', 'selection', 'contracting') and ${t.status} = 'open') or (${t.stage} = 'won' and ${t.status} = 'won') or (${t.stage} = 'lost' and ${t.status} = 'lost') or (${t.stage} = 'archived' and ${t.status} = 'archived')`),
  check("deals_product_requires_vendor_ck", sql`${t.productId} is null or ${t.vendorOrganizationId} is not null`),
  check("deals_organization_vendor_ck", sql`${t.vendorOrganizationId} is null or ${t.vendorOrganizationId} <> ${t.organizationId}`),
  check("deals_revision_ck", sql`${t.revision} > 0`),
  check("deals_updated_at_ck", sql`${t.updatedAt} >= ${t.createdAt}`),
]);

export const dealStageHistory = pgTable("deal_stage_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
  dealId: uuid("deal_id").notNull(),
  fromStage: text("from_stage").notNull(),
  toStage: text("to_stage").notNull(),
  fromStatus: text("from_status").notNull(),
  toStatus: text("to_status").notNull(),
  expectedRevision: integer("expected_revision").notNull(),
  actorIdentityId: uuid("actor_identity_id").notNull().references(() => identities.id, { onDelete: "restrict" }),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  reason: text("reason").notNull(),
  correlationId: uuid("correlation_id").notNull(),
}, (t) => [
  index("deal_stage_history_deal_time_idx").on(t.organizationId, t.dealId, t.occurredAt),
  check("deal_stage_history_revision_ck", sql`${t.expectedRevision} > 0`),
  check("deal_stage_history_reason_ck", sql`length(btrim(${t.reason})) between 1 and 2000`),
]);

export const renewals = pgTable("renewals", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
  contractId: uuid("contract_id").notNull(),
  sourceDealId: uuid("source_deal_id").notNull(),
  ownerIdentityId: uuid("owner_identity_id").notNull().references(() => identities.id, { onDelete: "restrict" }),
  contractStartAt: timestamp("contract_start_at", { withTimezone: true }).notNull(),
  contractEndAt: timestamp("contract_end_at", { withTimezone: true }).notNull(),
  renewalWindowStartAt: timestamp("renewal_window_start_at", { withTimezone: true }).notNull(),
  renewalWindowEndAt: timestamp("renewal_window_end_at", { withTimezone: true }).notNull(),
  linkedFollowOnDealId: uuid("linked_follow_on_deal_id"),
  nextActionAt: timestamp("next_action_at", { withTimezone: true }),
  status: text("status").notNull().default("upcoming"),
  revision: integer("revision").notNull().default(1),
  correlationId: uuid("correlation_id").notNull().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("renewals_organization_id_id_uq").on(t.organizationId, t.id),
  index("renewals_organization_status_action_idx").on(t.organizationId, t.status, t.nextActionAt),
  check("renewals_dates_ck", sql`${t.contractEndAt} >= ${t.contractStartAt}`),
  check("renewals_window_ck", sql`${t.renewalWindowEndAt} >= ${t.renewalWindowStartAt} and ${t.renewalWindowStartAt} >= ${t.contractStartAt} and ${t.renewalWindowEndAt} <= ${t.contractEndAt}`),
  check("renewals_status_ck", sql`${t.status} in ('upcoming', 'in_review', 'at_risk', 'renewed', 'replaced', 'expanded', 'cancelled')`),
  check("renewals_terminal_action_ck", sql`${t.status} not in ('renewed', 'replaced', 'expanded', 'cancelled') or ${t.nextActionAt} is null`),
  check("renewals_completed_deal_ck", sql`${t.status} not in ('renewed', 'replaced', 'expanded') or ${t.linkedFollowOnDealId} is not null`),
  check("renewals_revision_ck", sql`${t.revision} > 0`),
  check("renewals_updated_at_ck", sql`${t.updatedAt} >= ${t.createdAt}`),
]);

export const vendorSources = pgTable("vendor_sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
  vendorProfileId: uuid("vendor_profile_id").notNull(),
  uri: text("uri").notNull(),
  sourceType: text("source_type").notNull(),
  licenseNote: text("license_note"),
  capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
  active: boolean("active").notNull().default(true),
  createdByIdentityId: uuid("created_by_identity_id").references(() => identities.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("vendor_sources_organization_id_id_uq").on(t.organizationId, t.id),
  check("vendor_sources_uri_ck", sql`${t.uri} ~ '^https://'`),
  check("vendor_sources_type_ck", sql`${t.sourceType} in ('vendor_owned', 'licensed', 'manual')`),
  check("vendor_sources_license_ck", sql`${t.licenseNote} is null or length(${t.licenseNote}) <= 500`),
]);

export const vendorFacts = pgTable("vendor_facts", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
  vendorProfileId: uuid("vendor_profile_id").notNull(),
  productId: uuid("product_id"),
  fieldKey: text("field_key").notNull(),
  value: text("value").notNull(),
  observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
  status: text("status").notNull().default("draft"),
  createdByIdentityId: uuid("created_by_identity_id").references(() => identities.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("vendor_facts_organization_id_id_uq").on(t.organizationId, t.id),
  uniqueIndex("vendor_facts_organization_field_uq").on(t.organizationId, t.vendorProfileId, t.fieldKey).where(sql`${t.status} <> 'archived'`),
  check("vendor_facts_field_key_ck", sql`${t.fieldKey} ~ '^[a-z][a-z0-9_]{0,99}$'`),
  check("vendor_facts_value_ck", sql`length(btrim(${t.value})) between 1 and 2000`),
  check("vendor_facts_status_ck", sql`${t.status} in ('draft', 'published', 'archived')`),
]);

export const vendorEvidenceVersions = pgTable("vendor_evidence_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
  factId: uuid("fact_id").notNull(),
  sourceId: uuid("source_id").notNull(),
  version: integer("version").notNull(),
  contentHash: text("content_hash").notNull(),
  capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
  freshUntil: timestamp("fresh_until", { withTimezone: true }).notNull(),
  citation: text("citation").notNull(),
}, (t) => [
  uniqueIndex("vendor_evidence_organization_fact_version_uq").on(t.organizationId, t.factId, t.version),
  uniqueIndex("vendor_evidence_organization_id_id_uq").on(t.organizationId, t.id),
  check("vendor_evidence_version_ck", sql`${t.version} > 0`),
  check("vendor_evidence_hash_ck", sql`${t.contentHash} ~ '^[a-f0-9]{64}$'`),
  check("vendor_evidence_freshness_ck", sql`${t.freshUntil} >= ${t.capturedAt}`),
  check("vendor_evidence_citation_ck", sql`length(btrim(${t.citation})) between 1 and 1000`),
]);

export const vendorFactReviews = pgTable("vendor_fact_reviews", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
  evidenceId: uuid("evidence_id").notNull(),
  reviewerIdentityId: uuid("reviewer_identity_id").notNull().references(() => identities.id, { onDelete: "restrict" }),
  decision: text("decision").notNull(),
  decidedAt: timestamp("decided_at", { withTimezone: true }).notNull(),
  reason: text("reason"),
}, (t) => [
  uniqueIndex("vendor_fact_reviews_organization_id_id_uq").on(t.organizationId, t.id),
  check("vendor_fact_reviews_decision_ck", sql`${t.decision} in ('approved', 'rejected')`),
  check("vendor_fact_reviews_reason_ck", sql`${t.reason} is null or length(${t.reason}) <= 500`),
]);

export const vendorFactOverrides = pgTable("vendor_fact_overrides", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
  factId: uuid("fact_id").notNull(),
  value: text("value").notNull(),
  approvedByIdentityId: uuid("approved_by_identity_id").notNull().references(() => identities.id, { onDelete: "restrict" }),
  approvedAt: timestamp("approved_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  reason: text("reason").notNull(),
}, (t) => [
  uniqueIndex("vendor_fact_overrides_organization_id_id_uq").on(t.organizationId, t.id),
  check("vendor_fact_overrides_value_ck", sql`length(btrim(${t.value})) between 1 and 2000`),
  check("vendor_fact_overrides_dates_ck", sql`${t.expiresAt} >= ${t.approvedAt}`),
  check("vendor_fact_overrides_reason_ck", sql`length(btrim(${t.reason})) between 1 and 500`),
]);

export type CrmWorkflowTable =
  | typeof deals
  | typeof dealStageHistory
  | typeof renewals
  | typeof vendorSources
  | typeof vendorFacts
  | typeof vendorEvidenceVersions
  | typeof vendorFactReviews
  | typeof vendorFactOverrides;
