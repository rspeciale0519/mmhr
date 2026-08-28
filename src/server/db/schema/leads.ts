import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Captured leads (FR-MKT-06, FR-MKT-10). Every field except `source` is mandatory at the
 * registration gate; `consentAt` records the TCPA/privacy consent timestamp and
 * is never nullable — a lead without recorded consent must not exist.
 */
export const leads = pgTable("leads", {
  id: uuid("id").primaryKey().defaultRandom(),
  fullName: text("full_name").notNull(),
  company: text("company").notNull(),
  workEmail: text("work_email").notNull(),
  phone: text("phone").notNull(),
  source: text("source"),
  status: text("status").notNull().default("new"),
  consentAt: timestamp("consent_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
