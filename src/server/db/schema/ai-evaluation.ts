import { sql } from "drizzle-orm";
import { boolean, check, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { identities } from "./identity";

export const aiEvaluationRuns = pgTable("ai_evaluation_runs", {
  evaluationId: uuid("evaluation_id").primaryKey(),
  capability: text("capability").notNull(),
  dataClass: text("data_class").notNull(),
  adapterId: text("adapter_id").notNull(),
  modelId: text("model_id").notNull(),
  schemaVersion: text("schema_version").notNull(),
  fixtureSetVersion: text("fixture_set_version").notNull(),
  fixtureCount: integer("fixture_count").notNull(),
  passed: boolean("passed").notNull(),
  reportHash: text("report_hash").notNull(),
  status: text("status").notNull(),
  createdByIdentityId: uuid("created_by_identity_id").notNull().references(() => identities.id, { onDelete: "restrict" }),
  reviewedByIdentityId: uuid("reviewed_by_identity_id").references(() => identities.id, { onDelete: "restrict" }),
  approvalReference: text("approval_reference"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reviewReason: text("review_reason"),
  evaluatedAt: timestamp("evaluated_at", { withTimezone: true }).notNull(),
  revision: integer("revision").notNull().default(1),
  correlationId: uuid("correlation_id").notNull(),
}, (t) => [
  index("ai_evaluation_runs_adapter_idx").on(t.adapterId, t.modelId, t.evaluatedAt),
  check("ai_evaluation_runs_capability_ck", sql`${t.capability} in ('draft', 'summarize', 'extract_vendor_evidence', 'normalize_response', 'suggest_follow_up', 'identify_risk')`),
  check("ai_evaluation_runs_data_class_ck", sql`${t.dataClass} in ('public', 'internal', 'confidential', 'restricted')`),
  check("ai_evaluation_runs_identifier_ck", sql`${t.adapterId} ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$' and ${t.modelId} ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$' and ${t.schemaVersion} ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$' and ${t.fixtureSetVersion} ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$'`),
  check("ai_evaluation_runs_status_ck", sql`${t.status} in ('pending', 'approved', 'rejected', 'failed')`),
  check("ai_evaluation_runs_fixture_count_ck", sql`${t.fixtureCount} between 1 and 1000`),
  check("ai_evaluation_runs_hash_ck", sql`${t.reportHash} ~ '^[a-f0-9]{64}$'`),
  check("ai_evaluation_runs_approval_ck", sql`(${t.status} in ('pending', 'failed') and ${t.reviewedByIdentityId} is null and ${t.approvalReference} is null and ${t.reviewedAt} is null) or (${t.status} in ('approved', 'rejected') and ${t.reviewedByIdentityId} is not null and ${t.approvalReference} is not null and ${t.reviewedAt} is not null)`),
  check("ai_evaluation_runs_revision_ck", sql`${t.revision} > 0`),
]);
