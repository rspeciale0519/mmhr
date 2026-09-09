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
import { products } from "./crm";

function auditColumns() {
  return {
    createdByIdentityId: uuid("created_by_identity_id").references(
      () => identities.id,
      { onDelete: "restrict" },
    ),
    updatedByIdentityId: uuid("updated_by_identity_id").references(
      () => identities.id,
      { onDelete: "restrict" },
    ),
    revision: integer("revision").notNull().default(1),
    correlationId: uuid("correlation_id").notNull().defaultRandom(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  } as const;
}

/** Customer intake data remains private until an authorized command is added. */
export const intakes = pgTable(
  "intakes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "restrict" }),
    status: text("status").notNull().default("draft"),
    companyContext: jsonb("company_context"),
    currentSystems: jsonb("current_systems"),
    complianceNeeds: jsonb("compliance_needs"),
    budget: jsonb("budget"),
    timeline: jsonb("timeline"),
    stakeholders: jsonb("stakeholders"),
    decisionProcess: jsonb("decision_process"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    ...auditColumns(),
  },
  (t) => [
    uniqueIndex("intakes_organization_id_id_uq").on(t.organizationId, t.id),
    index("intakes_organization_status_idx").on(t.organizationId, t.status),
    check(
      "intakes_status_ck",
      sql`${t.status} in ('draft', 'in_progress', 'submitted', 'under_review', 'completed', 'archived')`,
    ),
    check("intakes_revision_ck", sql`${t.revision} > 0`),
    check(
      "intakes_submission_ck",
      sql`${t.status} in ('draft', 'in_progress') or ${t.submittedAt} is not null`,
    ),
  ],
);

export const intakeHistory = pgTable("intake_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
  intakeId: uuid("intake_id").notNull(),
  revision: integer("revision").notNull(),
  snapshot: jsonb("snapshot").notNull(),
  changedByIdentityId: uuid("changed_by_identity_id").notNull().references(() => identities.id, { onDelete: "restrict" }),
  changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
  correlationId: uuid("correlation_id").notNull(),
}, (t) => [
  uniqueIndex("intake_history_revision_uq").on(t.organizationId, t.intakeId, t.revision),
  index("intake_history_scope_time_idx").on(t.organizationId, t.intakeId, t.changedAt),
  foreignKey({ columns: [t.organizationId, t.intakeId], foreignColumns: [intakes.organizationId, intakes.id], name: "intake_history_scope_fk" }).onDelete("restrict"),
  check("intake_history_snapshot_ck", sql`jsonb_typeof(${t.snapshot}) = 'object' and pg_column_size(${t.snapshot}) <= 100000`),
  check("intake_history_revision_ck", sql`${t.revision} > 0`),
]);

export const intakeRequirements = pgTable(
  "intake_requirements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "restrict" }),
    intakeId: uuid("intake_id").notNull(),
    stableKey: text("stable_key").notNull(),
    label: text("label").notNull(),
    importance: text("importance").notNull().default("nice"),
    weight: integer("weight").notNull().default(1),
    ownerIdentityId: uuid("owner_identity_id").references(() => identities.id, {
      onDelete: "restrict",
    }),
    response: jsonb("response"),
    status: text("status").notNull().default("active"),
    requirementType: text("requirement_type").notNull().default("structured"),
    evidenceReferences: jsonb("evidence_references").notNull().default([]),
    vendorResponseLinks: jsonb("vendor_response_links").notNull().default([]),
    ...auditColumns(),
  },
  (t) => [
    uniqueIndex("intake_requirements_organization_id_uq").on(t.organizationId, t.id),
    uniqueIndex("intake_requirements_intake_key_uq").on(t.intakeId, t.stableKey),
    index("intake_requirements_organization_idx").on(t.organizationId, t.status),
    foreignKey({
      columns: [t.organizationId, t.intakeId],
      foreignColumns: [intakes.organizationId, intakes.id],
      name: "intake_requirements_intake_scope_fk",
    }).onDelete("restrict"),
    check(
      "intake_requirements_key_ck",
      sql`${t.stableKey} ~ '^[a-z][a-z0-9_]{0,99}$'`,
    ),
    check(
      "intake_requirements_label_ck",
      sql`length(btrim(${t.label})) between 1 and 200`,
    ),
    check(
      "intake_requirements_importance_ck",
      sql`${t.importance} in ('must', 'nice', 'not_applicable')`,
    ),
    check("intake_requirements_weight_ck", sql`${t.weight} between 1 and 100`),
    check(
      "intake_requirements_status_ck",
      sql`${t.status} in ('active', 'archived')`,
    ),
    check("intake_requirements_type_ck", sql`${t.requirementType} in ('structured', 'custom')`),
    check("intake_requirements_evidence_ck", sql`jsonb_typeof(${t.evidenceReferences}) = 'array' and jsonb_array_length(${t.evidenceReferences}) <= 20`),
    check("intake_requirements_vendor_links_ck", sql`jsonb_typeof(${t.vendorResponseLinks}) = 'array' and jsonb_array_length(${t.vendorResponseLinks}) <= 20`),
    check("intake_requirements_revision_ck", sql`${t.revision} > 0`),
  ],
);

/** Immutable requirement snapshots. Legacy rows may have no actor or source time. */
export const intakeRequirementHistory = pgTable("intake_requirement_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
  requirementId: uuid("requirement_id").notNull(),
  revision: integer("revision").notNull(),
  snapshot: jsonb("snapshot").notNull(),
  changedByIdentityId: uuid("changed_by_identity_id").references(() => identities.id, { onDelete: "restrict" }),
  changedAt: timestamp("changed_at", { withTimezone: true }),
  capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().default(sql`clock_timestamp()`),
  snapshotSource: text("snapshot_source").notNull().default("recorded"),
  correlationId: uuid("correlation_id").notNull(),
}, (t) => [
  uniqueIndex("intake_requirement_history_revision_uq").on(t.organizationId, t.requirementId, t.revision),
  index("intake_requirement_history_scope_time_idx").on(t.organizationId, t.requirementId, t.capturedAt),
  foreignKey({
    columns: [t.organizationId, t.requirementId],
    foreignColumns: [intakeRequirements.organizationId, intakeRequirements.id],
    name: "intake_requirement_history_scope_fk",
  }).onDelete("restrict"),
  check("intake_requirement_history_snapshot_ck", sql`jsonb_typeof(${t.snapshot}) = 'object'`),
  check("intake_requirement_history_revision_ck", sql`${t.revision} > 0`),
  check("intake_requirement_history_source_ck", sql`${t.snapshotSource} in ('recorded', 'legacy_backfill')`),
]);

export const evaluationCandidates = pgTable(
  "evaluation_candidates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "restrict" }),
    intakeId: uuid("intake_id").notNull(),
    productId: uuid("product_id").notNull(),
    source: text("source").notNull().default("initial"),
    state: text("state").notNull().default("proposed"),
    eligibility: text("eligibility").notNull().default("unknown"),
    deterministicScore: integer("deterministic_score"),
    scoringConfigurationVersion: integer("scoring_configuration_version"),
    fitReasons: jsonb("fit_reasons"),
    limitations: jsonb("limitations"),
    evidenceFreshAt: timestamp("evidence_fresh_at", { withTimezone: true }),
    ...auditColumns(),
  },
  (t) => [
    uniqueIndex("evaluation_candidates_intake_product_uq").on(t.intakeId, t.productId),
    uniqueIndex("evaluation_candidates_organization_id_id_uq").on(t.organizationId, t.id),
    index("evaluation_candidates_organization_state_idx").on(
      t.organizationId,
      t.state,
    ),
    foreignKey({
      columns: [t.organizationId, t.intakeId],
      foreignColumns: [intakes.organizationId, intakes.id],
      name: "evaluation_candidates_intake_scope_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.organizationId, t.productId],
      foreignColumns: [products.organizationId, products.id],
      name: "evaluation_candidates_product_scope_fk",
    }).onDelete("restrict"),
    check(
      "evaluation_candidates_source_ck",
      sql`${t.source} in ('initial', 'review_addition')`,
    ),
    check(
      "evaluation_candidates_state_ck",
      sql`${t.state} in ('proposed', 'active', 'paused', 'eliminated', 'selected', 'archived')`,
    ),
    check(
      "evaluation_candidates_eligibility_ck",
      sql`${t.eligibility} in ('unknown', 'eligible', 'ineligible')`,
    ),
    check(
      "evaluation_candidates_score_ck",
      sql`${t.deterministicScore} is null or ${t.deterministicScore} between 0 and 10000`,
    ),
    check(
      "evaluation_candidates_config_version_ck",
      sql`${t.scoringConfigurationVersion} is null or ${t.scoringConfigurationVersion} > 0`,
    ),
    check("evaluation_candidates_revision_ck", sql`${t.revision} > 0`),
  ],
);

export const evaluationCandidateMasks = pgTable(
  "evaluation_candidate_masks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
    candidateId: uuid("candidate_id").notNull(),
    maskedLabel: text("masked_label").notNull(),
    state: text("state").notNull().default("masked"),
    maskedAt: timestamp("masked_at", { withTimezone: true }).notNull().defaultNow(),
    unmaskedAt: timestamp("unmasked_at", { withTimezone: true }),
    unmaskedByIdentityId: uuid("unmasked_by_identity_id").references(() => identities.id, { onDelete: "restrict" }),
    unmaskReason: text("unmask_reason"),
    approvalReference: text("approval_reference"),
    ...auditColumns(),
  },
  (t) => [
    uniqueIndex("evaluation_candidate_masks_candidate_uq").on(t.organizationId, t.candidateId),
    index("evaluation_candidate_masks_organization_state_idx").on(t.organizationId, t.state),
    foreignKey({ columns: [t.organizationId, t.candidateId], foreignColumns: [evaluationCandidates.organizationId, evaluationCandidates.id], name: "evaluation_candidate_masks_candidate_fk" }).onDelete("restrict"),
    check("evaluation_candidate_masks_state_ck", sql`(${t.state} = 'masked' and ${t.unmaskedAt} is null and ${t.unmaskedByIdentityId} is null and ${t.unmaskReason} is null and ${t.approvalReference} is null) or (${t.state} = 'unmasked' and ${t.unmaskedAt} is not null and ${t.unmaskedByIdentityId} is not null and length(btrim(${t.unmaskReason})) between 1 and 500 and length(btrim(${t.approvalReference})) between 1 and 300)`),
    check("evaluation_candidate_masks_label_ck", sql`${t.maskedLabel} ~ '^Candidate-[A-Fa-f0-9]{8}$'`),
    check("evaluation_candidate_masks_revision_ck", sql`${t.revision} > 0`),
  ],
);
