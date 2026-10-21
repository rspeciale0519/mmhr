import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  check,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { identities, orgs } from "./identity";
import {
  adminDelegationGrants,
  permissionDefinitions,
  platformRoleAssignments,
  roleDefinitions,
  userPermissionOverrides,
} from "./permissions";

export const grantAuthorityKind = pgEnum("grant_authority_kind", [
  "reviewed_owner",
  "super_admin",
  "delegated",
]);
export const roleAuthorityRecordKind = pgEnum("role_authority_record_kind", [
  "platform_assignment",
  "role_activation",
]);
export const permissionAuthorityPurpose = pgEnum("permission_authority_purpose", [
  "allow",
  "deny_removal",
]);

// Stable assignments retain their original bundle. Each activation adds a new
// record; returning to an older version never rewrites its activation history.
export const roleAuthorityRecords = pgTable(
  "role_authority_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recordKind: roleAuthorityRecordKind("record_kind").notNull(),
    authorityKind: grantAuthorityKind("authority_kind").notNull(),
    platformAssignmentId: uuid("platform_assignment_id").references(
      () => platformRoleAssignments.id,
      { onDelete: "restrict" },
    ),
    roleDefinitionId: uuid("role_definition_id").notNull().references(
      () => roleDefinitions.id,
      { onDelete: "restrict" },
    ),
    previousAuthorityId: uuid("previous_authority_id").references(
      (): AnyPgColumn => roleAuthorityRecords.id,
      { onDelete: "restrict" },
    ),
    actorIdentityId: uuid("actor_identity_id").references(() => identities.id, { onDelete: "restrict" }),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    correlationId: uuid("correlation_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("role_authority_records_assignment_uq").on(t.platformAssignmentId)
      .where(sql`${t.platformAssignmentId} is not null`),
    uniqueIndex("role_authority_records_activation_uq").on(t.roleDefinitionId, t.activatedAt)
      .where(sql`${t.recordKind} = 'role_activation'`),
    index("role_authority_records_actor_idx").on(t.actorIdentityId),
    index("role_authority_records_previous_idx").on(t.previousAuthorityId),
    check("role_authority_records_kind_ck", sql`
      (${t.recordKind} = 'platform_assignment' and ${t.platformAssignmentId} is not null
        and ${t.activatedAt} is null and ${t.previousAuthorityId} is null)
      or (${t.recordKind} = 'role_activation' and ${t.platformAssignmentId} is null
        and ${t.activatedAt} is not null and isfinite(${t.activatedAt}))
    `),
    check("role_authority_records_actor_ck", sql`
      (${t.authorityKind} = 'reviewed_owner' and ${t.actorIdentityId} is null)
      or (${t.authorityKind} in ('super_admin', 'delegated') and ${t.actorIdentityId} is not null)
    `),
    check("role_authority_records_previous_ck", sql`
      ${t.previousAuthorityId} is null or ${t.previousAuthorityId} <> ${t.id}
    `),
  ],
);

// Removing a deny is a positive grant. An unrelated later allow cannot erase
// that grant's source. A fresh, explicit removal retains the old deny horizon.
export const permissionDenyRemovals = pgTable(
  "permission_deny_removals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    overrideId: uuid("override_id").notNull().references(() => userPermissionOverrides.id, { onDelete: "restrict" }),
    previousRemovalId: uuid("previous_removal_id").references(
      (): AnyPgColumn => permissionDenyRemovals.id,
      { onDelete: "restrict" },
    ),
    identityId: uuid("identity_id").notNull().references(() => identities.id, { onDelete: "restrict" }),
    permissionKey: text("permission_key").notNull().references(() => permissionDefinitions.key, { onDelete: "restrict" }),
    organizationId: uuid("organization_id").references(() => orgs.id, { onDelete: "restrict" }),
    scopeKey: text("scope_key").notNull(),
    authorityKind: grantAuthorityKind("authority_kind").notNull(),
    actorIdentityId: uuid("actor_identity_id").notNull().references(() => identities.id, { onDelete: "restrict" }),
    guardedUntil: timestamp("guarded_until", { withTimezone: true }),
    correlationId: uuid("correlation_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("permission_deny_removals_override_uq").on(t.overrideId),
    uniqueIndex("permission_deny_removals_successor_uq").on(t.previousRemovalId)
      .where(sql`${t.previousRemovalId} is not null`),
    index("permission_deny_removals_scope_idx").on(t.identityId, t.permissionKey, t.scopeKey),
    index("permission_deny_removals_actor_idx").on(t.actorIdentityId),
    check("permission_deny_removals_scope_ck", sql`
      (${t.organizationId} is null and ${t.scopeKey} = 'platform')
      or (${t.organizationId} is not null and ${t.scopeKey} = 'organization:' || ${t.organizationId}::text)
    `),
    check("permission_deny_removals_actor_ck", sql`
      ${t.actorIdentityId} <> ${t.identityId} and ${t.authorityKind} in ('super_admin', 'delegated')
    `),
    check("permission_deny_removals_horizon_ck", sql`${t.guardedUntil} is null or isfinite(${t.guardedUntil})`),
    check("permission_deny_removals_previous_ck", sql`${t.previousRemovalId} is null or ${t.previousRemovalId} <> ${t.id}`),
  ],
);

export const roleRevocationAuthorities = pgTable(
  "role_revocation_authorities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    platformAssignmentId: uuid("platform_assignment_id").notNull().references(
      () => platformRoleAssignments.id,
      { onDelete: "restrict" },
    ),
    roleDefinitionId: uuid("role_definition_id").notNull().references(() => roleDefinitions.id, { onDelete: "restrict" }),
    actorIdentityId: uuid("actor_identity_id").notNull().references(() => identities.id, { onDelete: "restrict" }),
    authorityKind: grantAuthorityKind("authority_kind").notNull(),
    correlationId: uuid("correlation_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("role_revocation_authorities_assignment_uq").on(t.platformAssignmentId),
    index("role_revocation_authorities_actor_idx").on(t.actorIdentityId),
    check("role_revocation_authorities_kind_ck", sql`${t.authorityKind} in ('super_admin', 'delegated')`),
  ],
);

export const permissionAuthoritySources = pgTable(
  "permission_authority_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roleAuthorityId: uuid("role_authority_id").references(() => roleAuthorityRecords.id, { onDelete: "restrict" }),
    denyRemovalId: uuid("deny_removal_id").references(() => permissionDenyRemovals.id, { onDelete: "restrict" }),
    roleRevocationId: uuid("role_revocation_id").references(() => roleRevocationAuthorities.id, { onDelete: "restrict" }),
    purpose: permissionAuthorityPurpose("purpose").notNull(),
    permissionKey: text("permission_key").notNull().references(() => permissionDefinitions.key, { onDelete: "restrict" }),
    organizationId: uuid("organization_id").references(() => orgs.id, { onDelete: "restrict" }),
    scopeKey: text("scope_key").notNull(),
    sourceDelegationId: uuid("source_delegation_id").notNull().references(
      () => adminDelegationGrants.id,
      { onDelete: "restrict" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("permission_authority_sources_role_scope_uq")
      .on(t.roleAuthorityId, t.purpose, t.permissionKey, t.scopeKey)
      .where(sql`${t.roleAuthorityId} is not null`),
    uniqueIndex("permission_authority_sources_removal_scope_uq")
      .on(t.denyRemovalId, t.permissionKey, t.scopeKey)
      .where(sql`${t.denyRemovalId} is not null`),
    uniqueIndex("permission_authority_sources_revocation_scope_uq")
      .on(t.roleRevocationId, t.permissionKey, t.scopeKey)
      .where(sql`${t.roleRevocationId} is not null`),
    index("permission_authority_sources_delegation_idx").on(t.sourceDelegationId),
    check("permission_authority_sources_parent_ck", sql`
      (${t.roleAuthorityId} is not null and ${t.denyRemovalId} is null and ${t.roleRevocationId} is null)
      or (${t.roleAuthorityId} is null and ${t.denyRemovalId} is not null
        and ${t.roleRevocationId} is null and ${t.purpose} = 'deny_removal')
      or (${t.roleAuthorityId} is null and ${t.denyRemovalId} is null
        and ${t.roleRevocationId} is not null and ${t.purpose} = 'deny_removal')
    `),
    check("permission_authority_sources_scope_ck", sql`
      (${t.organizationId} is null and ${t.scopeKey} = 'platform')
      or (${t.organizationId} is not null and ${t.scopeKey} = 'organization:' || ${t.organizationId}::text)
    `),
  ],
);
