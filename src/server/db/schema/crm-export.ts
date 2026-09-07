import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { identities, orgs } from "./identity";

export const crmExportRequests = pgTable(
  "crm_export_requests",
  {
    id: uuid("id").primaryKey(),
    organizationId: uuid("organization_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
    requestedByIdentityId: uuid("requested_by_identity_id").notNull().references(() => identities.id, { onDelete: "restrict" }),
    resource: text("resource").notNull(),
    fields: jsonb("fields").notNull(),
    purpose: text("purpose").notNull(),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull(),
    state: text("state").notNull().default("pending"),
    decisionId: uuid("decision_id"),
    correlationId: uuid("correlation_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("crm_export_requests_identity_scope_uq").on(t.organizationId, t.id),
    index("crm_export_requests_org_state_idx").on(t.organizationId, t.state, t.requestedAt),
    check("crm_export_requests_resource_ck", sql`${t.resource} in ('customer','vendor','product','contact','deal','activity','task')`),
    check("crm_export_requests_fields_ck", sql`jsonb_typeof(${t.fields}) = 'array' and jsonb_array_length(${t.fields}) between 1 and 20`),
    check("crm_export_requests_purpose_ck", sql`length(btrim(${t.purpose})) between 1 and 300`),
    check("crm_export_requests_state_ck", sql`${t.state} in ('pending','approved','denied')`),
  ],
);

export const crmExportDecisions = pgTable(
  "crm_export_decisions",
  {
    id: uuid("id").primaryKey(),
    organizationId: uuid("organization_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
    exportId: uuid("export_id").notNull(),
    reviewerIdentityId: uuid("reviewer_identity_id").notNull().references(() => identities.id, { onDelete: "restrict" }),
    decision: text("decision").notNull(),
    decidedAt: timestamp("decided_at", { withTimezone: true }).notNull(),
    reason: text("reason"),
    correlationId: uuid("correlation_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("crm_export_decisions_identity_scope_uq").on(t.organizationId, t.id),
    uniqueIndex("crm_export_decisions_export_uq").on(t.organizationId, t.exportId),
    index("crm_export_decisions_org_time_idx").on(t.organizationId, t.decidedAt),
    check("crm_export_decisions_decision_ck", sql`${t.decision} in ('approved','denied')`),
    check("crm_export_decisions_reason_ck", sql`${t.reason} is null or length(${t.reason}) <= 500`),
    foreignKey({ columns: [t.organizationId, t.exportId], foreignColumns: [crmExportRequests.organizationId, crmExportRequests.id], name: "crm_export_decisions_export_fk" }).onDelete("restrict"),
  ],
);
