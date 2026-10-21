import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { identities, orgs } from "./identity";
import { intakes } from "./r3-intake";

const workspaceStages = sql`('intake', 'matching', 'evaluation', 'selection', 'contracting', 'onboarding', 'closed')`;

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
  intakeId: uuid("intake_id").notNull(),
  stage: text("stage").notNull().default("intake"),
  revision: integer("revision").notNull().default(1),
  correlationId: uuid("correlation_id").notNull().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("workspaces_organization_id_id_uq").on(t.organizationId, t.id),
  uniqueIndex("workspaces_intake_uq").on(t.organizationId, t.intakeId),
  foreignKey({ columns: [t.organizationId, t.intakeId], foreignColumns: [intakes.organizationId, intakes.id], name: "workspaces_intake_scope_fk" }).onDelete("restrict"),
  check("workspaces_stage_ck", sql`${t.stage} in ${workspaceStages}`),
  check("workspaces_revision_ck", sql`${t.revision} > 0`),
  check("workspaces_updated_at_ck", sql`${t.updatedAt} >= ${t.createdAt}`),
]);

export const workspaceSnapshots = pgTable("workspace_snapshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
  workspaceId: uuid("workspace_id").notNull(),
  stage: text("stage").notNull(),
  candidateIds: jsonb("candidate_ids").notNull().default([]),
  openTaskIds: jsonb("open_task_ids").notNull().default([]),
  approvalIds: jsonb("approval_ids").notNull().default([]),
  upcomingEventReferences: jsonb("upcoming_event_references").notNull().default([]),
  recentActivityIds: jsonb("recent_activity_ids").notNull().default([]),
  capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
  revision: integer("revision").notNull(),
}, (t) => [
  uniqueIndex("workspace_snapshots_scope_revision_uq").on(t.organizationId, t.workspaceId, t.revision),
  index("workspace_snapshots_scope_time_idx").on(t.organizationId, t.workspaceId, t.capturedAt),
  foreignKey({ columns: [t.organizationId, t.workspaceId], foreignColumns: [workspaces.organizationId, workspaces.id], name: "workspace_snapshots_workspace_scope_fk" }).onDelete("restrict"),
  check("workspace_snapshots_stage_ck", sql`${t.stage} in ${workspaceStages}`),
  check("workspace_snapshots_revision_ck", sql`${t.revision} > 0`),
  check("workspace_snapshots_arrays_ck", sql`jsonb_typeof(${t.candidateIds}) = 'array' and jsonb_typeof(${t.openTaskIds}) = 'array' and jsonb_typeof(${t.approvalIds}) = 'array' and jsonb_typeof(${t.upcomingEventReferences}) = 'array' and jsonb_typeof(${t.recentActivityIds}) = 'array'`),
]);

export const workspaceParticipants = pgTable("workspace_participants", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
  workspaceId: uuid("workspace_id").notNull(),
  identityId: uuid("identity_id").notNull().references(() => identities.id, { onDelete: "restrict" }),
  role: text("role").notNull(),
  status: text("status").notNull().default("invited"),
  invitedAt: timestamp("invited_at", { withTimezone: true }).notNull(),
  joinedAt: timestamp("joined_at", { withTimezone: true }),
  removedAt: timestamp("removed_at", { withTimezone: true }),
}, (t) => [
  uniqueIndex("workspace_participants_scope_identity_uq").on(t.organizationId, t.workspaceId, t.identityId),
  foreignKey({ columns: [t.organizationId, t.workspaceId], foreignColumns: [workspaces.organizationId, workspaces.id], name: "workspace_participants_workspace_scope_fk" }).onDelete("restrict"),
  check("workspace_participants_role_ck", sql`${t.role} in ('customer_member', 'customer_admin', 'mmhr_advisor', 'mmhr_reviewer')`),
  check("workspace_participants_status_ck", sql`${t.status} in ('invited', 'active', 'removed')`),
  check("workspace_participants_timestamps_ck", sql`(${t.status} = 'active' and ${t.joinedAt} is not null and ${t.removedAt} is null) or (${t.status} = 'removed' and ${t.removedAt} is not null) or (${t.status} = 'invited' and ${t.joinedAt} is null and ${t.removedAt} is null)`),
]);

export const workspaceComments = pgTable("workspace_comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
  workspaceId: uuid("workspace_id").notNull(),
  authorIdentityId: uuid("author_identity_id").notNull().references(() => identities.id, { onDelete: "restrict" }),
  visibility: text("visibility").notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  correlationId: uuid("correlation_id").notNull(),
}, (t) => [
  uniqueIndex("workspace_comments_organization_id_id_uq").on(t.organizationId, t.id),
  index("workspace_comments_scope_time_idx").on(t.organizationId, t.workspaceId, t.createdAt),
  foreignKey({ columns: [t.organizationId, t.workspaceId], foreignColumns: [workspaces.organizationId, workspaces.id], name: "workspace_comments_workspace_scope_fk" }).onDelete("restrict"),
  check("workspace_comments_visibility_ck", sql`${t.visibility} in ('customer', 'internal')`),
  check("workspace_comments_body_ck", sql`length(btrim(${t.body})) between 1 and 5000`),
]);
