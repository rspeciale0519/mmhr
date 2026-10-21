import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { identities, orgs } from "./identity";

export const roleKind = pgEnum("role_kind", ["platform", "organization"]);
export const roleDefinitionState = pgEnum("role_definition_state", [
  "draft",
  "approved",
  "active",
  "rejected",
  "retired",
]);
export const permissionKind = pgEnum("permission_kind", [
  "feature",
  "action",
  "field",
]);
export const permissionEffect = pgEnum("permission_effect", ["allow", "deny"]);
export const securityRecordState = pgEnum("security_record_state", [
  "active",
  "revoked",
]);
export const permissionScopeKind = pgEnum("permission_scope_kind", [
  "platform",
  "organization",
]);
export const portalKind = pgEnum("portal_kind", ["customer", "vendor"]);

export const roleDefinitions = pgTable(
  "role_definitions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    stableKey: text("stable_key").notNull(),
    version: integer("version").notNull(),
    kind: roleKind("kind").notNull(),
    displayName: text("display_name").notNull(),
    description: text("description"),
    state: roleDefinitionState("state").notNull().default("draft"),
    approvedByIdentityId: uuid("approved_by_identity_id").references(
      () => identities.id,
      { onDelete: "restrict" },
    ),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    retiredAt: timestamp("retired_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("role_definitions_key_version_uq").on(t.stableKey, t.version),
    uniqueIndex("role_definitions_active_key_uq")
      .on(t.stableKey)
      .where(sql`${t.state} = 'active'`),
    index("role_definitions_kind_state_idx").on(t.kind, t.state),
    check("role_definitions_version_ck", sql`${t.version} > 0`),
    check(
      "role_definitions_stable_key_ck",
      sql`${t.stableKey} ~ '^[a-z][a-z0-9_]*$'`,
    ),
    check(
      "role_definitions_lifecycle_ck",
      sql`(${t.state} = 'draft' and ${t.approvedAt} is null and ${t.activatedAt} is null and ${t.retiredAt} is null) or (${t.state} = 'approved' and ${t.approvedAt} is not null and ${t.activatedAt} is null and ${t.retiredAt} is null) or (${t.state} = 'active' and ${t.approvedAt} is not null and ${t.activatedAt} is not null and ${t.retiredAt} is null) or (${t.state} = 'rejected' and ${t.activatedAt} is null and ${t.retiredAt} is null) or (${t.state} = 'retired' and ${t.retiredAt} is not null)`,
    ),
  ],
);

export const permissionDefinitions = pgTable(
  "permission_definitions",
  {
    key: text("key").primaryKey(),
    kind: permissionKind("kind").notNull(),
    description: text("description").notNull(),
    platformScope: boolean("platform_scope").notNull().default(false),
    organizationScope: boolean("organization_scope").notNull().default(false),
    minimumAssurance: text("minimum_assurance").notNull().default("aal2"),
    internalOnly: boolean("internal_only").notNull().default(false),
    requiredPortal: portalKind("required_portal"),
    active: boolean("active").notNull().default(true),
    retiredAt: timestamp("retired_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("permission_definitions_kind_active_idx").on(t.kind, t.active),
    check(
      "permission_definitions_key_ck",
      sql`${t.key} ~ '^[a-z][a-z0-9_]*([.][a-z][a-z0-9_]*)+$'`,
    ),
    check(
      "permission_definitions_retirement_ck",
      sql`(${t.active} and ${t.retiredAt} is null) or (not ${t.active} and ${t.retiredAt} is not null)`,
    ),
    check(
      "permission_definitions_assurance_ck",
      sql`${t.minimumAssurance} in ('aal1', 'aal2')`,
    ),
    check(
      "permission_definitions_portal_scope_ck",
      sql`${t.requiredPortal} is null or (${t.organizationScope} and not ${t.platformScope})`,
    ),
  ],
);

export const rolePermissionDefaults = pgTable(
  "role_permission_defaults",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roleDefinitionId: uuid("role_definition_id")
      .notNull()
      .references(() => roleDefinitions.id, { onDelete: "restrict" }),
    permissionKey: text("permission_key")
      .notNull()
      .references(() => permissionDefinitions.key, { onDelete: "restrict" }),
    effect: permissionEffect("effect").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("role_permission_defaults_role_permission_uq").on(
      t.roleDefinitionId,
      t.permissionKey,
    ),
    index("role_permission_defaults_permission_idx").on(t.permissionKey),
  ],
);

export const platformRoleAssignments = pgTable(
  "platform_role_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    identityId: uuid("identity_id")
      .notNull()
      .references(() => identities.id, { onDelete: "restrict" }),
    roleKey: text("role_key").notNull(),
    state: securityRecordState("state").notNull().default("active"),
    assignedByIdentityId: uuid("assigned_by_identity_id").references(
      () => identities.id,
      { onDelete: "restrict" },
    ),
    assignedAt: timestamp("assigned_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    assignmentReason: text("assignment_reason").notNull(),
    revokedByIdentityId: uuid("revoked_by_identity_id").references(
      () => identities.id,
      { onDelete: "restrict" },
    ),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revocationReason: text("revocation_reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("platform_role_assignments_active_identity_uq")
      .on(t.identityId)
      .where(sql`${t.state} = 'active'`),
    index("platform_role_assignments_role_state_idx").on(t.roleKey, t.state),
    check(
      "platform_role_assignments_actor_ck",
      sql`${t.assignedByIdentityId} is null or ${t.assignedByIdentityId} <> ${t.identityId}`,
    ),
    check(
      "platform_role_assignments_revocation_ck",
      sql`(${t.state} = 'active' and ${t.revokedAt} is null and ${t.revokedByIdentityId} is null and ${t.revocationReason} is null) or (${t.state} = 'revoked' and ${t.revokedAt} is not null and ${t.revocationReason} is not null)`,
    ),
  ],
);

export const userPermissionOverrides = pgTable(
  "user_permission_overrides",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    identityId: uuid("identity_id")
      .notNull()
      .references(() => identities.id, { onDelete: "restrict" }),
    permissionKey: text("permission_key")
      .notNull()
      .references(() => permissionDefinitions.key, { onDelete: "restrict" }),
    scopeKind: permissionScopeKind("scope_kind").notNull(),
    organizationId: uuid("organization_id").references(() => orgs.id, {
      onDelete: "restrict",
    }),
    scopeKey: text("scope_key").notNull(),
    effect: permissionEffect("effect").notNull(),
    state: securityRecordState("state").notNull().default("active"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    sourceDelegationId: uuid("source_delegation_id").references(
      (): AnyPgColumn => adminDelegationGrants.id,
      { onDelete: "restrict" },
    ),
    issuedByIdentityId: uuid("issued_by_identity_id")
      .notNull()
      .references(() => identities.id, { onDelete: "restrict" }),
    issueReason: text("issue_reason").notNull(),
    revokedByIdentityId: uuid("revoked_by_identity_id").references(
      () => identities.id,
      { onDelete: "restrict" },
    ),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revocationReason: text("revocation_reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("user_permission_overrides_active_scope_uq")
      .on(t.identityId, t.permissionKey, t.scopeKey)
      .where(sql`${t.state} = 'active'`),
    index("user_permission_overrides_lookup_idx").on(
      t.identityId,
      t.state,
      t.expiresAt,
    ),
    check(
      "user_permission_overrides_scope_ck",
      sql`(${t.scopeKind} = 'platform' and ${t.organizationId} is null and ${t.scopeKey} = 'platform') or (${t.scopeKind} = 'organization' and ${t.organizationId} is not null and ${t.scopeKey} = 'organization:' || ${t.organizationId}::text)`,
    ),
    check(
      "user_permission_overrides_actor_ck",
      sql`${t.issuedByIdentityId} <> ${t.identityId}`,
    ),
    check(
      "user_permission_overrides_revocation_ck",
      sql`(${t.state} = 'active' and ${t.revokedAt} is null and ${t.revokedByIdentityId} is null and ${t.revocationReason} is null) or (${t.state} = 'revoked' and ${t.revokedAt} is not null and ${t.revocationReason} is not null)`,
    ),
  ],
);

export const adminDelegationGrants = pgTable(
  "admin_delegation_grants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    granteeIdentityId: uuid("grantee_identity_id")
      .notNull()
      .references(() => identities.id, { onDelete: "restrict" }),
    permissionKey: text("permission_key")
      .notNull()
      .references(() => permissionDefinitions.key, { onDelete: "restrict" }),
    scopeKind: permissionScopeKind("scope_kind").notNull(),
    organizationId: uuid("organization_id").references(() => orgs.id, {
      onDelete: "restrict",
    }),
    scopeKey: text("scope_key").notNull(),
    canView: boolean("can_view").notNull().default(false),
    canGrant: boolean("can_grant").notNull().default(false),
    canRevoke: boolean("can_revoke").notNull().default(false),
    canDelegate: boolean("can_delegate").notNull().default(false),
    parentGrantId: uuid("parent_grant_id").references(
      (): AnyPgColumn => adminDelegationGrants.id,
      { onDelete: "restrict" },
    ),
    state: securityRecordState("state").notNull().default("active"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    issuedByIdentityId: uuid("issued_by_identity_id")
      .notNull()
      .references(() => identities.id, { onDelete: "restrict" }),
    issueReason: text("issue_reason").notNull(),
    revokedByIdentityId: uuid("revoked_by_identity_id").references(
      () => identities.id,
      { onDelete: "restrict" },
    ),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revocationReason: text("revocation_reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("admin_delegation_grants_active_scope_uq")
      .on(t.granteeIdentityId, t.permissionKey, t.scopeKey)
      .where(sql`${t.state} = 'active'`),
    index("admin_delegation_grants_issuer_idx").on(
      t.issuedByIdentityId,
      t.state,
    ),
    index("admin_delegation_grants_parent_idx").on(t.parentGrantId),
    check(
      "admin_delegation_grants_parent_not_self_ck",
      sql`${t.parentGrantId} is null or ${t.parentGrantId} <> ${t.id}`,
    ),
    check(
      "admin_delegation_grants_scope_ck",
      sql`(${t.scopeKind} = 'platform' and ${t.organizationId} is null and ${t.scopeKey} = 'platform') or (${t.scopeKind} = 'organization' and ${t.organizationId} is not null and ${t.scopeKey} = 'organization:' || ${t.organizationId}::text)`,
    ),
    check(
      "admin_delegation_grants_no_self_ck",
      sql`${t.issuedByIdentityId} <> ${t.granteeIdentityId}`,
    ),
    check(
      "admin_delegation_grants_revocation_ck",
      sql`(${t.state} = 'active' and ${t.revokedAt} is null and ${t.revokedByIdentityId} is null and ${t.revocationReason} is null) or (${t.state} = 'revoked' and ${t.revokedAt} is not null and ${t.revocationReason} is not null)`,
    ),
  ],
);

export const portalAccessGrants = pgTable(
  "portal_access_grants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "restrict" }),
    portal: portalKind("portal").notNull(),
    state: securityRecordState("state").notNull().default("active"),
    issuedByIdentityId: uuid("issued_by_identity_id")
      .notNull()
      .references(() => identities.id, { onDelete: "restrict" }),
    issueReason: text("issue_reason").notNull(),
    revokedByIdentityId: uuid("revoked_by_identity_id").references(
      () => identities.id,
      { onDelete: "restrict" },
    ),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revocationReason: text("revocation_reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("portal_access_grants_active_org_portal_uq")
      .on(t.organizationId, t.portal)
      .where(sql`${t.state} = 'active'`),
    index("portal_access_grants_issuer_idx").on(t.issuedByIdentityId, t.state),
    check(
      "portal_access_grants_revocation_ck",
      sql`(${t.state} = 'active' and ${t.revokedAt} is null and ${t.revokedByIdentityId} is null and ${t.revocationReason} is null) or (${t.state} = 'revoked' and ${t.revokedAt} is not null and ${t.revocationReason} is not null)`,
    ),
  ],
);
