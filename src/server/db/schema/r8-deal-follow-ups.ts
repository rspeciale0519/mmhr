import { sql } from "drizzle-orm";
import { check, foreignKey, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { crmTasks } from "./crm-activity";
import { deals } from "./crm-workflow";
import { identities, orgs } from "./identity";
import { securityCommandReceipts } from "./security-commands";

export const dealFollowUps = pgTable("deal_follow_ups", {
  taskId: uuid("task_id").primaryKey(), organizationId: uuid("organization_id").notNull(), dealId: uuid("deal_id").notNull(),
  createdByIdentityId: uuid("created_by_identity_id").notNull().references(() => identities.id, { onDelete: "restrict" }),
  ownerIdentityId: uuid("owner_identity_id").notNull().references(() => identities.id, { onDelete: "restrict" }),
  priority: text("priority").notNull(), blockerReason: text("blocker_reason"),
}, table => [
  uniqueIndex("deal_follow_ups_scope_uq").on(table.organizationId, table.taskId),
  foreignKey({ columns: [table.organizationId, table.taskId], foreignColumns: [crmTasks.organizationId, crmTasks.id], name: "deal_follow_ups_task_scope_fk" }).onDelete("restrict"),
  foreignKey({ columns: [table.organizationId, table.dealId], foreignColumns: [deals.organizationId, deals.id], name: "deal_follow_ups_deal_scope_fk" }).onDelete("restrict"),
  check("deal_follow_ups_priority_ck", sql`${table.priority} in ('low','normal','high','urgent')`),
  check("deal_follow_ups_blocker_ck", sql`${table.blockerReason} is null or length(btrim(${table.blockerReason})) between 1 and 2000`),
]);
export const dealFollowUpEvents = pgTable("deal_follow_up_events", {
  id: uuid("id").primaryKey().defaultRandom(), organizationId: uuid("organization_id").notNull(), taskId: uuid("task_id").notNull(),
  revision: integer("revision").notNull(), actorIdentityId: uuid("actor_identity_id").notNull().references(() => identities.id, { onDelete: "restrict" }),
  action: text("action").notNull(), reason: text("reason").notNull(), before: jsonb("before_snapshot"), after: jsonb("after_snapshot").notNull(),
  // Earlier events keep NULL. New insert guards require the exact original request.
  originalRequest: jsonb("original_request"),
  result: jsonb("original_result").notNull(), receiptId: uuid("receipt_id").notNull().references(() => securityCommandReceipts.id, { onDelete: "restrict" }),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(), correlationId: uuid("correlation_id").notNull(),
}, table => [
  uniqueIndex("deal_follow_up_events_revision_uq").on(table.taskId, table.revision),
  uniqueIndex("deal_follow_up_events_receipt_uq").on(table.receiptId),
  foreignKey({ columns: [table.organizationId, table.taskId], foreignColumns: [dealFollowUps.organizationId, dealFollowUps.taskId], name: "deal_follow_up_events_scope_fk" }).onDelete("restrict"),
  check("deal_follow_up_events_request_ck", sql`${table.originalRequest} is null or (jsonb_typeof(${table.originalRequest}) = 'object' and octet_length(${table.originalRequest}::text) <= 100000)`),
  check("deal_follow_up_events_revision_ck", sql`${table.revision} > 0`),
  check("deal_follow_up_events_action_ck", sql`${table.action} in ('create','edit','reassign','transfer_owner','start','block','resume','complete','cancel')`),
  check("deal_follow_up_events_reason_ck", sql`length(btrim(${table.reason})) between 1 and 2000`),
]);
export const dealFollowUpQueueVersions = pgTable("deal_follow_up_queue_versions", {
  organizationId: uuid("organization_id").primaryKey().references(() => orgs.id, { onDelete: "restrict" }),
  revision: integer("revision").notNull().default(0),
}, table => [check("deal_follow_up_queue_versions_revision_ck", sql`${table.revision} >= 0`)]);

