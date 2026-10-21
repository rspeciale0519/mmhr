import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { identities, orgs } from "./identity";
import { intakes } from "./r3-intake";

export const matchingRuleSets = pgTable("matching_rule_sets", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
  version: integer("version").notNull(),
  status: text("status").notNull().default("draft"),
  rules: jsonb("rules").notNull(),
  approvedByIdentityId: uuid("approved_by_identity_id").references(() => identities.id, { onDelete: "restrict" }),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  createdByIdentityId: uuid("created_by_identity_id").references(() => identities.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("matching_rule_sets_organization_id_uq").on(t.organizationId, t.id),
  uniqueIndex("matching_rule_sets_scope_version_uq").on(t.organizationId, t.version),
  check("matching_rule_sets_version_ck", sql`${t.version} > 0`),
  check("matching_rule_sets_status_ck", sql`${t.status} in ('draft', 'approved', 'retired')`),
  check("matching_rule_sets_rules_ck", sql`jsonb_typeof(${t.rules}) = 'object' and pg_column_size(${t.rules}) <= 100000`),
  check("matching_rule_sets_approval_ck", sql`(${t.status} = 'approved') = (${t.approvedByIdentityId} is not null and ${t.approvedAt} is not null)`),
]);

export const matchingRuns = pgTable("matching_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
  intakeId: uuid("intake_id").notNull(),
  ruleSetId: uuid("rule_set_id").notNull(),
  ruleVersion: integer("rule_version").notNull(),
  candidateCount: integer("candidate_count").notNull(),
  candidateSnapshot: jsonb("candidate_snapshot").notNull(),
  vendorInputSnapshot: jsonb("vendor_input_snapshot").notNull().default([]),
  createdByIdentityId: uuid("created_by_identity_id").notNull().references(() => identities.id, { onDelete: "restrict" }),
  correlationId: uuid("correlation_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("matching_runs_intake_time_idx").on(t.organizationId, t.intakeId, t.createdAt),
  foreignKey({ columns: [t.organizationId, t.intakeId], foreignColumns: [intakes.organizationId, intakes.id], name: "matching_runs_intake_scope_fk" }).onDelete("restrict"),
  foreignKey({ columns: [t.organizationId, t.ruleSetId], foreignColumns: [matchingRuleSets.organizationId, matchingRuleSets.id], name: "matching_runs_rule_scope_fk" }).onDelete("restrict"),
  check("matching_runs_rule_version_ck", sql`${t.ruleVersion} > 0`),
  check("matching_runs_count_ck", sql`${t.candidateCount} between 0 and 100`),
  check("matching_runs_snapshot_ck", sql`jsonb_typeof(${t.candidateSnapshot}) = 'array' and jsonb_array_length(${t.candidateSnapshot}) <= 100`),
  check("matching_runs_vendor_inputs_ck", sql`jsonb_typeof(${t.vendorInputSnapshot}) = 'array' and jsonb_array_length(${t.vendorInputSnapshot}) <= 100 and pg_column_size(${t.vendorInputSnapshot}) <= 4000000`),
]);
