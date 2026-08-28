import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const orgRole = pgEnum("org_role", ["admin", "contributor", "viewer"]);
export const identityStatus = pgEnum("identity_status", [
  "pending",
  "active",
  "recovery_pending",
  "suspended",
  "archived",
]);
export const organizationType = pgEnum("organization_type", [
  "internal",
  "customer",
  "vendor",
]);
export const organizationStatus = pgEnum("organization_status", [
  "pending",
  "active",
  "suspended",
  "archived",
]);
export const membershipStatus = pgEnum("membership_status", [
  "active",
  "suspended",
  "revoked",
]);
export const invitationStatus = pgEnum("invitation_status", [
  "pending",
  "accepted",
  "expired",
  "revoked",
]);

export const identities = pgTable(
  "identities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // The auth.users foreign key is added in reviewed SQL.
    authUserId: uuid("auth_user_id"),
    normalizedEmail: text("normalized_email"),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    status: identityStatus("status").notNull().default("pending"),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    suspendedAt: timestamp("suspended_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    synchronizedAt: timestamp("synchronized_at", { withTimezone: true }),
    migrationReviewRequired: boolean("migration_review_required")
      .notNull()
      .default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("identities_auth_user_id_uq")
      .on(t.authUserId)
      .where(sql`${t.authUserId} is not null`),
    uniqueIndex("identities_verified_email_uq")
      .on(t.normalizedEmail)
      .where(
        sql`${t.normalizedEmail} is not null and ${t.emailVerifiedAt} is not null and ${t.status} <> 'archived'`,
      ),
    index("identities_status_idx").on(t.status),
    check(
      "identities_normalized_email_ck",
      sql`${t.normalizedEmail} is null or ${t.normalizedEmail} = lower(btrim(${t.normalizedEmail}))`,
    ),
    check(
      "identities_lifecycle_ck",
      sql`(${t.status} = 'pending' and ${t.activatedAt} is null and ${t.suspendedAt} is null and ${t.archivedAt} is null) or (${t.status} in ('active', 'recovery_pending') and ${t.activatedAt} is not null and ${t.suspendedAt} is null and ${t.archivedAt} is null) or (${t.status} = 'suspended' and ${t.activatedAt} is not null and ${t.suspendedAt} is not null and ${t.archivedAt} is null) or (${t.status} = 'archived' and ${t.archivedAt} is not null)`,
    ),
  ],
);

export const orgs = pgTable(
  "orgs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    type: organizationType("type"),
    status: organizationStatus("status").notNull().default("pending"),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    suspendedAt: timestamp("suspended_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    migrationReviewRequired: boolean("migration_review_required")
      .notNull()
      .default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("orgs_status_idx").on(t.status),
    check(
      "orgs_active_type_ck",
      sql`${t.status} = 'pending' or ${t.type} is not null`,
    ),
    check(
      "orgs_lifecycle_ck",
      sql`(${t.status} = 'pending' and ${t.activatedAt} is null and ${t.suspendedAt} is null and ${t.archivedAt} is null) or (${t.status} = 'active' and ${t.activatedAt} is not null and ${t.suspendedAt} is null and ${t.archivedAt} is null) or (${t.status} = 'suspended' and ${t.activatedAt} is not null and ${t.suspendedAt} is not null and ${t.archivedAt} is null) or (${t.status} = 'archived' and ${t.archivedAt} is not null)`,
    ),
  ],
);

export const orgMembers = pgTable(
  "org_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "restrict" }),
    identityId: uuid("identity_id")
      .notNull()
      .references(() => identities.id, { onDelete: "restrict" }),
    // Retained for rollback reads. The auth.users foreign key uses ON DELETE SET NULL.
    userId: uuid("user_id"),
    role: orgRole("role").notNull().default("contributor"),
    roleKey: text("role_key").notNull().default("contributor"),
    status: membershipStatus("status").notNull().default("active"),
    activatedAt: timestamp("activated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    suspendedAt: timestamp("suspended_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedByIdentityId: uuid("revoked_by_identity_id").references(
      () => identities.id,
      { onDelete: "restrict" },
    ),
    revokedReason: text("revoked_reason"),
    migrationReviewRequired: boolean("migration_review_required")
      .notNull()
      .default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("org_members_nonterminal_uq")
      .on(t.orgId, t.identityId)
      .where(sql`${t.status} in ('active', 'suspended')`),
    index("org_members_identity_idx").on(t.identityId),
    index("org_members_org_status_idx").on(t.orgId, t.status),
    check(
      "org_members_role_map_ck",
      sql`(${t.role} = 'admin' and ${t.roleKey} = 'organization_admin') or (${t.role} = 'contributor' and ${t.roleKey} = 'contributor') or (${t.role} = 'viewer' and ${t.roleKey} = 'viewer')`,
    ),
    check(
      "org_members_revocation_ck",
      sql`(${t.status} = 'revoked' and ${t.revokedAt} is not null and ${t.revokedReason} is not null) or (${t.status} <> 'revoked' and ${t.revokedAt} is null and ${t.revokedByIdentityId} is null and ${t.revokedReason} is null)`,
    ),
    check(
      "org_members_lifecycle_ck",
      sql`(${t.status} = 'active' and ${t.suspendedAt} is null) or (${t.status} = 'suspended' and ${t.suspendedAt} is not null) or ${t.status} = 'revoked'`,
    ),
  ],
);

export const invitations = pgTable(
  "invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "restrict" }),
    email: text("email").notNull(),
    normalizedEmail: text("normalized_email").notNull(),
    role: orgRole("role").notNull().default("contributor"),
    roleKey: text("role_key").notNull().default("contributor"),
    // Legacy values remain readable. New invitations create no application token.
    token: uuid("token"),
    status: invitationStatus("status").notNull().default("pending"),
    createdByIdentityId: uuid("created_by_identity_id").references(
      () => identities.id,
      { onDelete: "restrict" },
    ),
    acceptedByIdentityId: uuid("accepted_by_identity_id").references(
      () => identities.id,
      { onDelete: "restrict" },
    ),
    revokedByIdentityId: uuid("revoked_by_identity_id").references(
      () => identities.id,
      { onDelete: "restrict" },
    ),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedReason: text("revoked_reason"),
    migrationReviewRequired: boolean("migration_review_required")
      .notNull()
      .default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("invitations_pending_org_email_uq")
      .on(t.orgId, t.normalizedEmail)
      .where(sql`${t.status} = 'pending' and not ${t.migrationReviewRequired}`),
    index("invitations_org_status_idx").on(t.orgId, t.status),
    check(
      "invitations_normalized_email_ck",
      sql`${t.normalizedEmail} = lower(btrim(${t.normalizedEmail}))`,
    ),
    check(
      "invitations_role_map_ck",
      sql`(${t.role} = 'admin' and ${t.roleKey} = 'organization_admin') or (${t.role} = 'contributor' and ${t.roleKey} = 'contributor') or (${t.role} = 'viewer' and ${t.roleKey} = 'viewer')`,
    ),
    check(
      "invitations_terminal_fields_ck",
      sql`(${t.status} = 'accepted' and ${t.acceptedAt} is not null and (${t.acceptedByIdentityId} is not null or ${t.migrationReviewRequired}) and ${t.revokedAt} is null) or (${t.status} = 'revoked' and ${t.revokedAt} is not null and ${t.revokedReason} is not null and ${t.acceptedAt} is null) or (${t.status} in ('pending', 'expired') and ${t.acceptedAt} is null and ${t.acceptedByIdentityId} is null and ${t.revokedAt} is null and ${t.revokedByIdentityId} is null and ${t.revokedReason} is null)`,
    ),
  ],
);
