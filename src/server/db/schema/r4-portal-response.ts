import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, pgTable, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { identities, orgs } from "./identity";
import { rfpRecipients, rfpResponseNormalizations } from "./workflow-foundation";

// The immutable portal source links each revision to the existing response
// normalization pipeline. Customer and vendor scopes remain distinct.
export const rfpPortalSubmissions = pgTable("rfp_portal_submissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
  recipientId: uuid("recipient_id").notNull().references(() => rfpRecipients.id, { onDelete: "restrict" }),
  normalizationId: uuid("normalization_id").notNull(),
  revision: integer("revision").notNull(),
  submittedByIdentityId: uuid("submitted_by_identity_id").notNull().references(() => identities.id, { onDelete: "restrict" }),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("rfp_portal_submissions_recipient_revision_uq").on(t.recipientId, t.revision),
  uniqueIndex("rfp_portal_submissions_normalization_uq").on(t.normalizationId),
  index("rfp_portal_submissions_organization_idx").on(t.organizationId, t.id),
  foreignKey({ columns: [t.organizationId, t.normalizationId], foreignColumns: [rfpResponseNormalizations.organizationId, rfpResponseNormalizations.id], name: "rfp_portal_submissions_normalization_scope_fk" }).onDelete("restrict"),
  check("rfp_portal_submissions_revision_ck", sql`${t.revision} > 0`),
]);
