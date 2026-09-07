import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { identities, orgs } from "./identity";

/**
 * Captured leads (FR-MKT-06, FR-MKT-10). Every field except `source` is mandatory at the
 * registration gate; `consentAt` records the TCPA/privacy consent timestamp and
 * is never nullable — a lead without recorded consent must not exist.
 */
export const leads = pgTable("leads", {
  id: uuid("id").primaryKey().defaultRandom(),
  fullName: text("full_name").notNull(),
  company: text("company").notNull(),
  workEmail: text("work_email").notNull(),
  phone: text("phone").notNull(),
  source: text("source"),
  status: text("status").notNull().default("new"),
  consentAt: timestamp("consent_at", { withTimezone: true }).notNull(),
  // These fields are nullable for legacy rows. New command-created rows always
  // populate them, which keeps the additive migration reversible.
  organizationId: uuid("organization_id"),
  routingOwnerIdentityId: uuid("routing_owner_identity_id"),
  normalizedSource: text("normalized_source"),
  idempotencyKey: uuid("idempotency_key"),
  requestDigest: text("request_digest"),
  correlationId: uuid("correlation_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (t) => [
  foreignKey({ columns: [t.organizationId], foreignColumns: [orgs.id], name: "leads_organization_id_orgs_id_fk" }).onDelete("restrict"),
  foreignKey({ columns: [t.routingOwnerIdentityId], foreignColumns: [identities.id], name: "leads_routing_owner_identity_id_identities_id_fk" }).onDelete("restrict"),
  uniqueIndex("leads_idempotency_key_uq").on(t.idempotencyKey).where(sql`${t.idempotencyKey} is not null`),
  index("leads_organization_status_idx").on(t.organizationId, t.status),
  check("leads_status_ck", sql`${t.status} in ('new', 'contacted', 'qualified', 'disqualified', 'converted', 'archived')`),
  check("leads_request_digest_ck", sql`${t.requestDigest} is null or ${t.requestDigest} ~ '^[0-9a-f]{64}$'`),
]);
