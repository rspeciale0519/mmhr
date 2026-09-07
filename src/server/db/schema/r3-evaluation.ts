import { sql } from "drizzle-orm";
import { check, foreignKey, index, jsonb, pgTable, timestamp, uniqueIndex, uuid, text } from "drizzle-orm/pg-core";

import { identities, orgs } from "./identity";
import { evaluationCandidates, intakes } from "./r3-intake";

export const evaluationAssessments = pgTable("evaluation_assessments", {
  id: uuid("id").primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
  intakeId: uuid("intake_id").notNull(),
  state: text("state").notNull().default("masked"),
  candidateSnapshot: jsonb("candidate_snapshot").notNull(),
  createdByIdentityId: uuid("created_by_identity_id").notNull().references(() => identities.id, { onDelete: "restrict" }),
  correlationId: uuid("correlation_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("evaluation_assessments_scope_uq").on(t.organizationId, t.id),
  uniqueIndex("evaluation_assessments_intake_uq").on(t.organizationId, t.intakeId),
  index("evaluation_assessments_intake_idx").on(t.organizationId, t.intakeId, t.createdAt),
  foreignKey({ columns: [t.organizationId, t.intakeId], foreignColumns: [intakes.organizationId, intakes.id], name: "evaluation_assessments_scope_fk" }).onDelete("restrict"),
  check("evaluation_assessments_state_ck", sql`${t.state} = 'masked'`),
  check("evaluation_assessments_snapshot_ck", sql`jsonb_typeof(${t.candidateSnapshot}) = 'array' and jsonb_array_length(${t.candidateSnapshot}) between 1 and 5`),
]);

export const evaluationComparisonExports = pgTable("evaluation_comparison_exports", {
  id: uuid("id").primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
  intakeId: uuid("intake_id").notNull(),
  requestedByIdentityId: uuid("requested_by_identity_id").notNull().references(() => identities.id, { onDelete: "restrict" }),
  candidateIds: jsonb("candidate_ids").notNull().default([]),
  purpose: text("purpose").notNull(),
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull(),
  state: text("state").notNull().default("pending"),
  decisionId: uuid("decision_id"),
  correlationId: uuid("correlation_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  foreignKey({ columns: [t.organizationId, t.intakeId], foreignColumns: [intakes.organizationId, intakes.id], name: "evaluation_comparison_exports_intake_scope_fk" }).onDelete("restrict"),
  uniqueIndex("evaluation_comparison_exports_scope_uq").on(t.organizationId, t.id),
  index("evaluation_comparison_exports_org_state_idx").on(t.organizationId, t.state, t.requestedAt),
  check("evaluation_comparison_exports_candidate_ids_ck", sql`jsonb_typeof(${t.candidateIds}) = 'array' and jsonb_array_length(${t.candidateIds}) <= 20`),
  check("evaluation_comparison_exports_purpose_ck", sql`length(btrim(${t.purpose})) between 1 and 300`),
  check("evaluation_comparison_exports_state_ck", sql`${t.state} in ('pending', 'approved', 'denied')`),
]);

export const evaluationComparisonExportDecisions = pgTable("evaluation_comparison_export_decisions", {
  id: uuid("id").primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
  exportId: uuid("export_id").notNull(),
  reviewerIdentityId: uuid("reviewer_identity_id").notNull().references(() => identities.id, { onDelete: "restrict" }),
  decision: text("decision").notNull(),
  decidedAt: timestamp("decided_at", { withTimezone: true }).notNull(),
  reason: text("reason"),
  correlationId: uuid("correlation_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  foreignKey({ columns: [t.organizationId, t.exportId], foreignColumns: [evaluationComparisonExports.organizationId, evaluationComparisonExports.id], name: "evaluation_comparison_export_decisions_export_scope_fk" }).onDelete("restrict"),
  uniqueIndex("evaluation_comparison_export_decisions_scope_uq").on(t.organizationId, t.id),
  uniqueIndex("evaluation_comparison_export_decisions_export_uq").on(t.organizationId, t.exportId),
  index("evaluation_comparison_export_decisions_org_time_idx").on(t.organizationId, t.decidedAt),
  check("evaluation_comparison_export_decisions_decision_ck", sql`${t.decision} in ('approved', 'denied')`),
  check("evaluation_comparison_export_decisions_reason_ck", sql`${t.reason} is null or length(${t.reason}) <= 500`),
]);

export const evaluationProductDuplicateReviews = pgTable("evaluation_product_duplicate_reviews", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
  intakeId: uuid("intake_id").notNull(),
  leftCandidateId: uuid("left_candidate_id").notNull(),
  rightCandidateId: uuid("right_candidate_id").notNull(),
  decision: text("decision").notNull(),
  reason: text("reason").notNull(),
  materialDistinction: text("material_distinction"),
  reviewedByIdentityId: uuid("reviewed_by_identity_id").notNull().references(() => identities.id, { onDelete: "restrict" }),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }).notNull().defaultNow(),
  correlationId: uuid("correlation_id").notNull(),
}, (t) => [
  foreignKey({ columns: [t.organizationId, t.intakeId], foreignColumns: [intakes.organizationId, intakes.id], name: "evaluation_product_duplicate_reviews_intake_scope_fk" }).onDelete("restrict"),
  foreignKey({ columns: [t.organizationId, t.leftCandidateId], foreignColumns: [evaluationCandidates.organizationId, evaluationCandidates.id], name: "evaluation_product_duplicate_reviews_left_scope_fk" }).onDelete("restrict"),
  foreignKey({ columns: [t.organizationId, t.rightCandidateId], foreignColumns: [evaluationCandidates.organizationId, evaluationCandidates.id], name: "evaluation_product_duplicate_reviews_right_scope_fk" }).onDelete("restrict"),
  uniqueIndex("evaluation_product_duplicate_reviews_pair_uq").on(t.organizationId, t.intakeId, t.leftCandidateId, t.rightCandidateId),
  index("evaluation_product_duplicate_reviews_intake_idx").on(t.organizationId, t.intakeId, t.reviewedAt),
  check("evaluation_product_duplicate_reviews_distinct_ck", sql`${t.leftCandidateId} <> ${t.rightCandidateId}`),
  check("evaluation_product_duplicate_reviews_decision_ck", sql`${t.decision} in ('duplicate', 'distinct')`),
  check("evaluation_product_duplicate_reviews_reason_ck", sql`length(btrim(${t.reason})) between 1 and 500`),
  check("evaluation_product_duplicate_reviews_distinction_ck", sql`${t.decision} <> 'distinct' or length(btrim(coalesce(${t.materialDistinction}, ''))) between 1 and 500`),
]);
