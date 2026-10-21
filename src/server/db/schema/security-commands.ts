import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  integer,
  pgSchema,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { auditEvents } from "./audit";
import { identities } from "./identity";

const privateSchema = pgSchema("mmhr_private");

// Every authority writer changes this row before reading permissions. A real
// revision update also invalidates a stale Repeatable Read writer's snapshot.
export const securityAuthorityGuard = privateSchema.table(
  "security_authority_guard",
  {
    singletonKey: integer("singleton_key").primaryKey().default(1),
    revision: bigint("revision", { mode: "bigint" }).notNull().default(sql`0`),
  },
  (t) => [
    check("security_authority_guard_singleton_ck", sql`${t.singletonKey} = 1`),
    check("security_authority_guard_revision_ck", sql`${t.revision} >= 0`),
  ],
);

export const securityCommandReceipts = pgTable(
  "security_command_receipts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorIdentityId: uuid("actor_identity_id")
      .notNull()
      .references(() => identities.id, { onDelete: "restrict" }),
    command: text("command").notNull(),
    idempotencyKey: uuid("idempotency_key").notNull(),
    requestDigest: text("request_digest").notNull(),
    entityId: uuid("entity_id").notNull(),
    action: text("action").notNull(),
    auditEventId: uuid("audit_event_id")
      .notNull()
      .references(() => auditEvents.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("security_command_receipts_request_uq").on(
      t.actorIdentityId,
      t.command,
      t.idempotencyKey,
    ),
    uniqueIndex("security_command_receipts_audit_uq").on(t.auditEventId),
    check("security_command_receipts_digest_ck", sql`${t.requestDigest} ~ '^[0-9a-f]{64}$'`),
    check("security_command_receipts_command_ck", sql`${t.command} ~ '^[a-z][a-z0-9_.]+$'`),
    check("security_command_receipts_action_ck", sql`${t.action} ~ '^[a-z][a-z0-9_.]+$'`),
  ],
);
