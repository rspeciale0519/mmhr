import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { identities, orgs } from "./identity";

export const deletionRequests = pgTable("deletion_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
  subjectId: uuid("subject_id").notNull(),
  requestedByIdentityId: uuid("requested_by_identity_id").references(() => identities.id, { onDelete: "restrict" }),
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull(),
  dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
  legalHold: boolean("legal_hold").notNull().default(false),
  retentionUntil: timestamp("retention_until", { withTimezone: true }),
  status: text("status").notNull().default("requested"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("deletion_requests_organization_id_uq").on(t.organizationId, t.id),
  index("deletion_requests_due_status_idx").on(t.organizationId, t.status, t.dueAt),
  check("deletion_requests_status_ck", sql`${t.status} in ('requested', 'approved', 'held', 'rejected', 'completed')`),
  check("deletion_requests_due_ck", sql`${t.dueAt} >= ${t.requestedAt} and ${t.dueAt} <= ${t.requestedAt} + interval '30 days'`),
  check("deletion_requests_retention_ck", sql`${t.retentionUntil} is null or ${t.retentionUntil} >= ${t.requestedAt}`),
]);

export const deletionDecisions = pgTable("deletion_decisions", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
  requestId: uuid("request_id").notNull(),
  decidedAt: timestamp("decided_at", { withTimezone: true }).notNull(),
  decision: text("decision").notNull(),
  auditReference: text("audit_reference").notNull(),
}, (t) => [
  uniqueIndex("deletion_decisions_organization_id_uq").on(t.organizationId, t.id),
  uniqueIndex("deletion_decisions_request_uq").on(t.organizationId, t.requestId),
  foreignKey({ columns: [t.organizationId, t.requestId], foreignColumns: [deletionRequests.organizationId, deletionRequests.id], name: "deletion_decisions_scope_fk" }),
  check("deletion_decisions_decision_ck", sql`${t.decision} in ('approved', 'held', 'rejected')`),
  check("deletion_decisions_reference_ck", sql`${t.auditReference} ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$'`),
]);

export const availabilityObservations = pgTable("availability_observations", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
  serviceId: text("service_id").notNull(),
  observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
  durationSeconds: integer("duration_seconds").notNull(),
  outcome: text("outcome").notNull(),
  maintenance: boolean("maintenance").notNull().default(false),
  source: text("source").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("availability_observations_organization_id_uq").on(t.organizationId, t.id),
  index("availability_observations_service_time_idx").on(t.organizationId, t.serviceId, t.observedAt),
  check("availability_observations_duration_ck", sql`${t.durationSeconds} between 1 and 86400`),
  check("availability_observations_outcome_ck", sql`${t.outcome} in ('available', 'unavailable')`),
  check("availability_observations_source_ck", sql`${t.source} in ('synthetic', 'user')`),
  check("availability_observations_service_ck", sql`${t.serviceId} ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,119}$'`),
]);

export const performanceMeasurements = pgTable("performance_measurements", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
  route: text("route").notNull(),
  measuredAt: timestamp("measured_at", { withTimezone: true }).notNull(),
  sampleCount: integer("sample_count").notNull(),
  lcpP75Ms: integer("lcp_p75_ms").notNull(),
  inpP75Ms: integer("inp_p75_ms").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("performance_measurements_organization_id_uq").on(t.organizationId, t.id),
  uniqueIndex("performance_measurements_route_time_uq").on(t.organizationId, t.route, t.measuredAt),
  check("performance_measurements_route_ck", sql`${t.route} ~ '^/(|[a-z0-9][a-z0-9/_-]*)$'`),
  check("performance_measurements_sample_ck", sql`${t.sampleCount} between 1 and 100000`),
  check("performance_measurements_lcp_ck", sql`${t.lcpP75Ms} between 0 and 60000`),
  check("performance_measurements_inp_ck", sql`${t.inpP75Ms} between 0 and 60000`),
]);
