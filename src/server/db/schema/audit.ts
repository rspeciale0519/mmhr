import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { identities, orgs } from "./identity";

export const auditActorType = pgEnum("audit_actor_type", [
  "user",
  "worker",
  "system",
  "migration",
]);

/**
 * Retained legacy snapshots. The R1.2 migration freezes this table and marks
 * every row with its legacy format.
 */
export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorId: uuid("actor_id"),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: text("entity_id"),
  before: jsonb("before"),
  after: jsonb("after"),
  formatVersion: text("format_version")
    .notNull()
    .default("legacy_snapshot_v1"),
  frozenAt: timestamp("frozen_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventVersion: integer("event_version").notNull().default(1),
    actorType: auditActorType("actor_type").notNull(),
    actorIdentityId: uuid("actor_identity_id").references(() => identities.id, {
      onDelete: "restrict",
    }),
    actorReference: text("actor_reference"),
    organizationId: uuid("organization_id").references(() => orgs.id, {
      onDelete: "restrict",
    }),
    command: text("command").notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    reason: text("reason").notNull(),
    correlationId: uuid("correlation_id").notNull(),
    idempotencyKey: text("idempotency_key"),
    beforeSummary: jsonb("before_summary"),
    afterSummary: jsonb("after_summary"),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("audit_events_actor_time_idx").on(t.actorIdentityId, t.occurredAt),
    index("audit_events_entity_time_idx").on(
      t.entityType,
      t.entityId,
      t.occurredAt,
    ),
    index("audit_events_org_time_idx").on(t.organizationId, t.occurredAt),
    index("audit_events_correlation_idx").on(t.correlationId),
    check("audit_events_version_ck", sql`${t.eventVersion} > 0`),
    check(
      "audit_events_actor_ck",
      sql`(${t.actorType} = 'user' and ${t.actorIdentityId} is not null) or (${t.actorType} <> 'user' and ${t.actorReference} is not null and length(btrim(${t.actorReference})) > 0)`,
    ),
    check("audit_events_reason_ck", sql`length(btrim(${t.reason})) > 0`),
    check("audit_events_command_ck", sql`length(btrim(${t.command})) > 0`),
    check("audit_events_action_ck", sql`length(btrim(${t.action})) > 0`),
  ],
);
