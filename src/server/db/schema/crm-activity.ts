import { sql } from "drizzle-orm";
import {
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

const subjectTypes = ["customer", "vendor", "product", "contact", "deal", "task"] as const;

export const crmActivities = pgTable(
  "crm_activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
    actorIdentityId: uuid("actor_identity_id").notNull().references(() => identities.id, { onDelete: "restrict" }),
    subjectType: text("subject_type").notNull(),
    subjectId: uuid("subject_id").notNull(),
    kind: text("kind").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    correlationId: uuid("correlation_id").notNull(),
    summary: text("summary").notNull(),
  },
  (t) => [
    uniqueIndex("crm_activities_organization_id_id_uq").on(t.organizationId, t.id),
    index("crm_activities_organization_time_idx").on(t.organizationId, t.occurredAt),
    check("crm_activities_subject_type_ck", sql`${t.subjectType} in ('customer', 'vendor', 'product', 'contact', 'deal', 'task')`),
    check("crm_activities_kind_ck", sql`${t.kind} in ('call', 'email', 'meeting', 'note', 'status_change', 'task_completed')`),
    check("crm_activities_summary_ck", sql`length(btrim(${t.summary})) between 1 and 500`),
  ],
);

export const crmTasks = pgTable(
  "crm_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
    subjectType: text("subject_type").notNull(),
    subjectId: uuid("subject_id").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    assigneeIdentityId: uuid("assignee_identity_id").references(() => identities.id, { onDelete: "restrict" }),
    dueAt: timestamp("due_at", { withTimezone: true }),
    state: text("state").notNull().default("open"),
    revision: integer("revision").notNull().default(1),
    correlationId: uuid("correlation_id").notNull().defaultRandom(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("crm_tasks_organization_id_id_uq").on(t.organizationId, t.id),
    index("crm_tasks_organization_state_due_idx").on(t.organizationId, t.state, t.dueAt),
    check("crm_tasks_subject_type_ck", sql`${t.subjectType} in ('customer', 'vendor', 'product', 'contact', 'deal', 'task')`),
    check("crm_tasks_title_ck", sql`length(btrim(${t.title})) between 1 and 200`),
    check("crm_tasks_description_ck", sql`${t.description} is null or length(${t.description}) <= 2000`),
    check("crm_tasks_state_ck", sql`${t.state} in ('open', 'in_progress', 'blocked', 'completed', 'cancelled')`),
    check("crm_tasks_revision_ck", sql`${t.revision} > 0`),
  ],
);

export const crmTaskStateHistory = pgTable(
  "crm_task_state_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
    taskId: uuid("task_id").notNull(),
    fromState: text("from_state").notNull(),
    toState: text("to_state").notNull(),
    expectedRevision: integer("expected_revision").notNull(),
    actorIdentityId: uuid("actor_identity_id").notNull().references(() => identities.id, { onDelete: "restrict" }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    reason: text("reason").notNull(),
    correlationId: uuid("correlation_id").notNull(),
  },
  (t) => [
    index("crm_task_state_history_task_time_idx").on(t.organizationId, t.taskId, t.occurredAt),
    foreignKey({
      columns: [t.organizationId, t.taskId],
      foreignColumns: [crmTasks.organizationId, crmTasks.id],
      name: "crm_task_state_history_task_scope_fk",
    }).onDelete("restrict"),
    check("crm_task_state_history_revision_ck", sql`${t.expectedRevision} > 0`),
    check("crm_task_state_history_reason_ck", sql`length(btrim(${t.reason})) between 1 and 2000`),
  ],
);

export { subjectTypes };
