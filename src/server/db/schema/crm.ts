import { sql } from "drizzle-orm";
import {
  check,
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

function auditColumns() {
  return {
    createdByIdentityId: uuid("created_by_identity_id").references(
      () => identities.id,
      { onDelete: "restrict" },
    ),
    updatedByIdentityId: uuid("updated_by_identity_id").references(
      () => identities.id,
      { onDelete: "restrict" },
    ),
    revision: integer("revision").notNull().default(1),
    correlationId: uuid("correlation_id").notNull().defaultRandom(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  } as const;
}

export const customerProfiles = pgTable(
  "customer_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "restrict" }),
    status: text("status").notNull().default("prospect"),
    businessContext: text("business_context"),
    currentSoftware: text("current_software"),
    purchaseHistory: jsonb("purchase_history"),
    contractStartAt: timestamp("contract_start_at", { withTimezone: true }),
    contractEndAt: timestamp("contract_end_at", { withTimezone: true }),
    renewalWindowStartAt: timestamp("renewal_window_start_at", { withTimezone: true }),
    renewalWindowEndAt: timestamp("renewal_window_end_at", { withTimezone: true }),
    ...auditColumns(),
  },
  (t) => [
    uniqueIndex("customer_profiles_organization_uq").on(t.organizationId),
    index("customer_profiles_status_idx").on(t.status),
    check(
      "customer_profiles_status_ck",
      sql`${t.status} in ('prospect', 'active', 'paused', 'closed', 'archived')`,
    ),
    check("customer_profiles_revision_ck", sql`${t.revision} > 0`),
    check(
      "customer_profiles_contract_dates_ck",
      sql`${t.contractEndAt} is null or ${t.contractStartAt} is null or ${t.contractEndAt} >= ${t.contractStartAt}`,
    ),
    check(
      "customer_profiles_renewal_dates_ck",
      sql`${t.renewalWindowEndAt} is null or ${t.renewalWindowStartAt} is null or ${t.renewalWindowEndAt} >= ${t.renewalWindowStartAt}`,
    ),
  ],
);

export const vendorProfiles = pgTable(
  "vendor_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "restrict" }),
    status: text("status").notNull().default("prospect"),
    description: text("description"),
    approvedCommercialMetadata: jsonb("approved_commercial_metadata"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvedByIdentityId: uuid("approved_by_identity_id").references(
      () => identities.id,
      { onDelete: "restrict" },
    ),
    ...auditColumns(),
  },
  (t) => [
    uniqueIndex("vendor_profiles_organization_uq").on(t.organizationId),
    index("vendor_profiles_status_idx").on(t.status),
    check(
      "vendor_profiles_status_ck",
      sql`${t.status} in ('prospect', 'active', 'paused', 'archived')`,
    ),
    check(
      "vendor_profiles_approval_ck",
      sql`(${t.approvedAt} is null and ${t.approvedByIdentityId} is null) or (${t.approvedAt} is not null and ${t.approvedByIdentityId} is not null)`,
    ),
    check("vendor_profiles_revision_ck", sql`${t.revision} > 0`),
  ],
);

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "restrict" }),
    vendorProfileId: uuid("vendor_profile_id")
      .notNull()
      .references(() => vendorProfiles.id, { onDelete: "restrict" }),
    stableKey: text("stable_key").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    status: text("status").notNull().default("draft"),
    ...auditColumns(),
  },
  (t) => [
    uniqueIndex("products_vendor_stable_key_uq").on(t.vendorProfileId, t.stableKey),
    uniqueIndex("products_organization_id_id_uq").on(t.organizationId, t.id),
    uniqueIndex("products_organization_vendor_id_uq").on(t.organizationId, t.vendorProfileId, t.id),
    index("products_organization_status_idx").on(t.organizationId, t.status),
    check(
      "products_stable_key_ck",
      sql`${t.stableKey} ~ '^[a-z][a-z0-9_]{0,99}$'`,
    ),
    check(
      "products_name_ck",
      sql`length(btrim(${t.name})) between 1 and 200`,
    ),
    check(
      "products_status_ck",
      sql`${t.status} in ('draft', 'active', 'retired', 'archived')`,
    ),
    check("products_revision_ck", sql`${t.revision} > 0`),
  ],
);

export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "restrict" }),
    identityId: uuid("identity_id").references(() => identities.id, {
      onDelete: "restrict",
    }),
    fullName: text("full_name").notNull(),
    normalizedEmail: text("normalized_email"),
    phone: text("phone"),
    title: text("title"),
    status: text("status").notNull().default("active"),
    ...auditColumns(),
  },
  (t) => [
    uniqueIndex("contacts_organization_id_id_uq").on(t.organizationId, t.id),
    uniqueIndex("contacts_organization_email_uq")
      .on(t.organizationId, t.normalizedEmail)
      .where(sql`${t.normalizedEmail} is not null and ${t.status} <> 'archived'`),
    index("contacts_organization_status_idx").on(t.organizationId, t.status),
    check(
      "contacts_name_ck",
      sql`length(btrim(${t.fullName})) between 1 and 200`,
    ),
    check(
      "contacts_email_ck",
      sql`${t.normalizedEmail} is null or ${t.normalizedEmail} = lower(btrim(${t.normalizedEmail}))`,
    ),
    check(
      "contacts_status_ck",
      sql`${t.status} in ('active', 'inactive', 'archived')`,
    ),
    check("contacts_revision_ck", sql`${t.revision} > 0`),
  ],
);

export const relationships = pgTable(
  "relationships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "restrict" }),
    relationshipType: text("relationship_type").notNull(),
    subjectOrganizationId: uuid("subject_organization_id").references(
      () => orgs.id,
      { onDelete: "restrict" },
    ),
    subjectContactId: uuid("subject_contact_id").references(() => contacts.id, {
      onDelete: "restrict",
    }),
    relatedOrganizationId: uuid("related_organization_id").references(
      () => orgs.id,
      { onDelete: "restrict" },
    ),
    relatedContactId: uuid("related_contact_id").references(() => contacts.id, {
      onDelete: "restrict",
    }),
    ownerIdentityId: uuid("owner_identity_id").references(() => identities.id, {
      onDelete: "restrict",
    }),
    influence: text("influence").notNull().default("unknown"),
    preference: text("preference"),
    status: text("status").notNull().default("active"),
    ...auditColumns(),
  },
  (t) => [
    index("relationships_organization_status_idx").on(t.organizationId, t.status),
    index("relationships_owner_idx").on(t.ownerIdentityId, t.status),
    check(
      "relationships_type_ck",
      sql`${t.relationshipType} in ('customer_vendor', 'customer_contact', 'vendor_contact', 'partner', 'other')`,
    ),
    check(
      "relationships_endpoint_ck",
      sql`((${t.subjectOrganizationId} is not null)::integer + (${t.subjectContactId} is not null)::integer = 1) and ((${t.relatedOrganizationId} is not null)::integer + (${t.relatedContactId} is not null)::integer = 1) and (${t.subjectOrganizationId} is null or ${t.relatedOrganizationId} is null or ${t.subjectOrganizationId} <> ${t.relatedOrganizationId}) and (${t.subjectContactId} is null or ${t.relatedContactId} is null or ${t.subjectContactId} <> ${t.relatedContactId})`,
    ),
    check(
      "relationships_influence_ck",
      sql`${t.influence} in ('unknown', 'low', 'medium', 'high')`,
    ),
    check(
      "relationships_status_ck",
      sql`${t.status} in ('active', 'paused', 'ended', 'archived')`,
    ),
    check("relationships_revision_ck", sql`${t.revision} > 0`),
  ],
);
