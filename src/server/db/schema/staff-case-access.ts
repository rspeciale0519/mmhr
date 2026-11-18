import { sql } from "drizzle-orm";
import { check, pgSchema, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { identities, orgMembers, orgs } from "./identity";
import { intakes } from "./r3-intake";

const privateSchema = pgSchema("mmhr_private");

/**
 * Audited staff access to one self-registered customer case, or to one listed
 * vendor workspace. Only the fixed open-case and open-vendor-workspace RPCs
 * write it. A customer grant names its intake; a vendor grant has no intake.
 * The permission evaluator reads it for staff members.
 */
export const staffCaseAccessGrants = privateSchema.table("staff_case_access_grants", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
  identityId: uuid("identity_id").notNull().references(() => identities.id, { onDelete: "restrict" }),
  membershipId: uuid("membership_id").notNull().references(() => orgMembers.id, { onDelete: "restrict" }),
  intakeId: uuid("intake_id").references(() => intakes.id, { onDelete: "restrict" }),
  state: text("state").notNull().default("active"),
  reason: text("reason").notNull(),
  correlationId: uuid("correlation_id").notNull(),
  openedAt: timestamp("opened_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  revokedReason: text("revoked_reason"),
}, table => [
  uniqueIndex("staff_case_access_grants_membership_uq").on(table.membershipId),
  uniqueIndex("staff_case_access_grants_active_uq").on(table.organizationId, table.identityId)
    .where(sql`${table.state} = 'active'`),
  check("staff_case_access_grants_state_ck", sql`${table.state} in ('active', 'revoked')`),
  check("staff_case_access_grants_revocation_ck", sql`(${table.state} = 'active' and ${table.revokedAt} is null and ${table.revokedReason} is null) or (${table.state} = 'revoked' and ${table.revokedAt} is not null and ${table.revokedReason} is not null)`),
  check("staff_case_access_grants_reason_ck", sql`length(btrim(${table.reason})) between 1 and 500`),
  check("staff_case_access_grants_time_ck", sql`isfinite(${table.openedAt})`),
]);
