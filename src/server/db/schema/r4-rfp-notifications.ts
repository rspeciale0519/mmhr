import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, jsonb, pgSchema, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { identities, orgMembers, orgs } from "./identity";
import { rfpRecipients, rfpVersions } from "./workflow-foundation";

const privateSchema = pgSchema("mmhr_private");

/** Minimal immutable notification snapshots never expose questionnaire content. */
export const rfpNotificationOutbox = privateSchema.table("rfp_notification_outbox", {
  id: uuid("id").primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
  rfpVersionId: uuid("rfp_version_id").notNull(),
  recipientId: uuid("recipient_id").notNull(),
  vendorOrganizationId: uuid("vendor_organization_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
  membershipId: uuid("membership_id").notNull().references(() => orgMembers.id, { onDelete: "restrict" }),
  recipientIdentityId: uuid("recipient_identity_id").notNull().references(() => identities.id, { onDelete: "restrict" }),
  recipientEmail: text("recipient_email").notNull(),
  sourceDigest: text("source_digest").notNull(),
  sourceSnapshot: jsonb("source_snapshot").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  state: text("state").notNull().default("queued"),
  revision: integer("revision").notNull().default(1),
  attemptCount: integer("attempt_count").notNull().default(0),
  providerMessageId: text("provider_message_id"),
  failureCode: text("failure_code"),
  createdByIdentityId: uuid("created_by_identity_id").notNull().references(() => identities.id, { onDelete: "restrict" }),
  correlationId: uuid("correlation_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  foreignKey({ columns: [t.organizationId, t.recipientId], foreignColumns: [rfpRecipients.organizationId, rfpRecipients.id], name: "rfp_notification_recipient_scope_fk" }).onDelete("restrict"),
  foreignKey({ columns: [t.organizationId, t.rfpVersionId], foreignColumns: [rfpVersions.organizationId, rfpVersions.id], name: "rfp_notification_version_scope_fk" }).onDelete("restrict"),
  uniqueIndex("rfp_notification_participant_uq").on(t.recipientId, t.membershipId),
  index("rfp_notification_organization_state_idx").on(t.organizationId, t.state, t.id),
  check("rfp_notification_digest_ck", sql`${t.sourceDigest} ~ '^[0-9a-f]{64}$'`),
  check("rfp_notification_state_ck", sql`${t.state} in ('queued','leased','accepted','failed','needs_attention')`),
  check("rfp_notification_revision_ck", sql`${t.revision} between 1 and 2147483646`),
  check("rfp_notification_attempt_count_ck", sql`${t.attemptCount} between 0 and 3`),
  check("rfp_notification_email_ck", sql`${t.recipientEmail} = lower(btrim(${t.recipientEmail})) and length(${t.recipientEmail}) between 3 and 320`),
]).enableRLS();

export const rfpNotificationAttempts = privateSchema.table("rfp_notification_attempts", {
  id: uuid("id").primaryKey().defaultRandom(),
  notificationId: uuid("notification_id").notNull().references(() => rfpNotificationOutbox.id, { onDelete: "restrict" }),
  number: integer("number").notNull(),
  token: text("token").notNull(),
  outcome: text("outcome").notNull().default("leased"),
  failureCode: text("failure_code"),
  providerMessageId: text("provider_message_id"),
  resultDigest: text("result_digest"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
}, (t) => [
  uniqueIndex("rfp_notification_attempt_number_uq").on(t.notificationId, t.number),
  uniqueIndex("rfp_notification_active_lease_uq").on(t.notificationId).where(sql`${t.outcome} = 'leased'`),
  check("rfp_notification_attempt_number_ck", sql`${t.number} between 1 and 3`),
  check("rfp_notification_attempt_token_ck", sql`${t.token} ~ '^[0-9a-f]{64}$'`),
  check("rfp_notification_attempt_outcome_ck", sql`${t.outcome} in ('leased','accepted','failed','needs_attention')`),
  check("rfp_notification_attempt_expiry_ck", sql`${t.expiresAt} = ${t.startedAt} + interval '60 seconds'`),
  check("rfp_notification_attempt_finished_ck", sql`(${t.outcome} = 'leased' and ${t.finishedAt} is null) or (${t.outcome} <> 'leased' and ${t.finishedAt} is not null)`),
]).enableRLS();

export const rfpNotificationReceipts = privateSchema.table("rfp_notification_receipts", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorIdentityId: uuid("actor_identity_id").notNull().references(() => identities.id, { onDelete: "restrict" }),
  idempotencyKey: uuid("idempotency_key").notNull(),
  requestDigest: text("request_digest").notNull(),
  result: jsonb("result").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("rfp_notification_receipt_actor_key_uq").on(t.actorIdentityId, t.idempotencyKey),
  check("rfp_notification_receipt_digest_ck", sql`${t.requestDigest} ~ '^[0-9a-f]{64}$'`),
]).enableRLS();
