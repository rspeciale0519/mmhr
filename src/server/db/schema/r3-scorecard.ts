import { sql } from "drizzle-orm";
import {
  integer,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  check,
  foreignKey,
} from "drizzle-orm/pg-core";

import { identities, orgs } from "./identity";
import { evaluationCandidates, intakes } from "./r3-intake";

export const scorecards = pgTable("scorecards", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
  intakeId: uuid("intake_id").notNull(),
  candidateId: uuid("candidate_id").notNull(),
  configurationId: uuid("configuration_id").notNull(),
  configurationVersion: integer("configuration_version").notNull(),
  status: text("status").notNull().default("draft"),
  revision: integer("revision").notNull().default(1),
  correlationId: uuid("correlation_id").notNull().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("scorecards_organization_id_id_uq").on(t.organizationId, t.id),
  uniqueIndex("scorecards_candidate_uq").on(t.organizationId, t.intakeId, t.candidateId),
  foreignKey({ columns: [t.organizationId, t.intakeId], foreignColumns: [intakes.organizationId, intakes.id], name: "scorecards_intake_scope_fk" }).onDelete("restrict"),
  foreignKey({ columns: [t.organizationId, t.candidateId], foreignColumns: [evaluationCandidates.organizationId, evaluationCandidates.id], name: "scorecards_candidate_scope_fk" }).onDelete("restrict"),
  check("scorecards_configuration_version_ck", sql`${t.configurationVersion} > 0`),
  check("scorecards_status_ck", sql`${t.status} in ('draft', 'submitted', 'approved')`),
  check("scorecards_revision_ck", sql`${t.revision} > 0`),
  check("scorecards_updated_at_ck", sql`${t.updatedAt} >= ${t.createdAt}`),
]);

export const scorecardCriteria = pgTable("scorecard_criteria", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
  scorecardId: uuid("scorecard_id").notNull(),
  criterionKey: text("criterion_key").notNull(),
  weight: integer("weight").notNull(),
}, (t) => [
  uniqueIndex("scorecard_criteria_scope_key_uq").on(t.organizationId, t.scorecardId, t.criterionKey),
  foreignKey({ columns: [t.organizationId, t.scorecardId], foreignColumns: [scorecards.organizationId, scorecards.id], name: "scorecard_criteria_scorecard_scope_fk" }).onDelete("restrict"),
  check("scorecard_criteria_key_ck", sql`${t.criterionKey} ~ '^[a-z][a-z0-9_]{0,99}$'`),
  check("scorecard_criteria_weight_ck", sql`${t.weight} between 1 and 100`),
]);

export const scorecardEntries = pgTable("scorecard_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
  scorecardId: uuid("scorecard_id").notNull(),
  criterionKey: text("criterion_key").notNull(),
  scorerIdentityId: uuid("scorer_identity_id").notNull().references(() => identities.id, { onDelete: "restrict" }),
  value: integer("value").notNull(),
  comment: text("comment"),
  evidenceReferences: jsonb("evidence_references").notNull().default([]),
  enteredAt: timestamp("entered_at", { withTimezone: true }).notNull(),
}, (t) => [
  uniqueIndex("scorecard_entries_scorer_criterion_uq").on(t.organizationId, t.scorecardId, t.criterionKey, t.scorerIdentityId),
  foreignKey({ columns: [t.organizationId, t.scorecardId], foreignColumns: [scorecards.organizationId, scorecards.id], name: "scorecard_entries_scorecard_scope_fk" }).onDelete("restrict"),
  foreignKey({ columns: [t.organizationId, t.scorecardId, t.criterionKey], foreignColumns: [scorecardCriteria.organizationId, scorecardCriteria.scorecardId, scorecardCriteria.criterionKey], name: "scorecard_entries_criterion_scope_fk" }).onDelete("restrict"),
  check("scorecard_entries_value_ck", sql`${t.value} between 0 and 100`),
  check("scorecard_entries_comment_ck", sql`${t.comment} is null or length(${t.comment}) <= 1000`),
  check("scorecard_entries_evidence_ck", sql`jsonb_typeof(${t.evidenceReferences}) = 'array'`),
]);

export const scorecardEntryHistory = pgTable("scorecard_entry_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
  scorecardId: uuid("scorecard_id").notNull(),
  criterionKey: text("criterion_key").notNull(),
  scorerIdentityId: uuid("scorer_identity_id").notNull().references(() => identities.id, { onDelete: "restrict" }),
  value: integer("value").notNull(),
  comment: text("comment"),
  evidenceReferences: jsonb("evidence_references").notNull().default([]),
  enteredAt: timestamp("entered_at", { withTimezone: true }).notNull(),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  correlationId: uuid("correlation_id").notNull(),
}, (t) => [
  index("scorecard_entry_history_scope_time_idx").on(t.organizationId, t.scorecardId, t.recordedAt),
  foreignKey({ columns: [t.organizationId, t.scorecardId], foreignColumns: [scorecards.organizationId, scorecards.id], name: "scorecard_entry_history_scorecard_scope_fk" }).onDelete("restrict"),
  foreignKey({ columns: [t.organizationId, t.scorecardId, t.criterionKey], foreignColumns: [scorecardCriteria.organizationId, scorecardCriteria.scorecardId, scorecardCriteria.criterionKey], name: "scorecard_entry_history_criterion_scope_fk" }).onDelete("restrict"),
  check("scorecard_entry_history_value_ck", sql`${t.value} between 0 and 100`),
  check("scorecard_entry_history_comment_ck", sql`${t.comment} is null or length(${t.comment}) <= 1000`),
  check("scorecard_entry_history_evidence_ck", sql`jsonb_typeof(${t.evidenceReferences}) = 'array'`),
]);
