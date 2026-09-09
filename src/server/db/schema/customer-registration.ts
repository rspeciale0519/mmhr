import { pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { identities, orgs } from "./identity";

/** One personal customer workspace per identity; only the fixed setup RPC writes it. */
export const customerRegistrations = pgTable("customer_registrations", {
  identityId: uuid("identity_id").primaryKey().references(() => identities.id, { onDelete: "restrict" }),
  organizationId: uuid("organization_id").notNull().unique().references(() => orgs.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
