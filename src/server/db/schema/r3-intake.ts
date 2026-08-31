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
    ...auditColumns(),
  },
  (t) => [
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
    check("intake_requirements_revision_ck", sql`${t.revision} > 0`),
  ],
);

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
