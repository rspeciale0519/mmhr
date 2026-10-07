import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { identities, orgs } from "./identity";
import { products } from "./crm";
import { evaluationCandidates } from "./r3-intake";
import { evaluationPublications, evaluationPublicationOptions } from "./r3-publication";

/** Names and conflict text are fixed at the authorized disclosure, not read from live vendor records. */
export const evaluationDisclosures = pgTable("evaluation_disclosures", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
  intakeId: uuid("intake_id").notNull(),
  candidateId: uuid("candidate_id").notNull(),
  candidateRevision: integer("candidate_revision").notNull(),
  publicationId: uuid("publication_id").notNull(),
  optionId: uuid("option_id").notNull(),
  vendorOrganizationId: uuid("vendor_organization_id").notNull(),
  productId: uuid("product_id").notNull(),
  reviewDigest: text("review_digest").notNull(),
  maskedLabel: text("masked_label").notNull(),
  providerName: text("provider_name").notNull(),
  productName: text("product_name").notNull(),
  conflictDisclosure: text("conflict_disclosure").notNull(),
  discussionAt: timestamp("discussion_at", { withTimezone: true }).notNull(),
  discussionReference: text("discussion_reference").notNull(),
  reason: text("reason").notNull(),
  disclosedByIdentityId: uuid("disclosed_by_identity_id").notNull().references(() => identities.id, { onDelete: "restrict" }),
  correlationId: uuid("correlation_id").notNull(),
  disclosedAt: timestamp("disclosed_at", { withTimezone: true }).notNull().default(sql`clock_timestamp()`),
}, (t) => [
  uniqueIndex("evaluation_disclosures_scope_id_uq").on(t.organizationId, t.id),
  index("evaluation_disclosures_candidate_time_idx").on(t.organizationId, t.intakeId, t.candidateId, t.disclosedAt, t.id),
  foreignKey({ columns: [t.organizationId, t.intakeId, t.candidateId], foreignColumns: [evaluationCandidates.organizationId, evaluationCandidates.intakeId, evaluationCandidates.id], name: "evaluation_disclosures_candidate_fk" }).onDelete("restrict"),
  foreignKey({ columns: [t.organizationId, t.intakeId, t.publicationId], foreignColumns: [evaluationPublications.organizationId, evaluationPublications.intakeId, evaluationPublications.id], name: "evaluation_disclosures_publication_fk" }).onDelete("restrict"),
  foreignKey({ columns: [t.organizationId, t.publicationId, t.optionId], foreignColumns: [evaluationPublicationOptions.organizationId, evaluationPublicationOptions.publicationId, evaluationPublicationOptions.id], name: "evaluation_disclosures_option_fk" }).onDelete("restrict"),
  foreignKey({ columns: [t.vendorOrganizationId, t.productId], foreignColumns: [products.organizationId, products.id], name: "evaluation_disclosures_product_fk" }).onDelete("restrict"),
  check("evaluation_disclosures_revision_ck", sql`${t.candidateRevision} > 0`),
  check("evaluation_disclosures_digest_ck", sql`${t.reviewDigest} ~ '^[a-f0-9]{64}$'`),
  check("evaluation_disclosures_names_ck", sql`length(btrim(${t.providerName})) between 1 and 200 and length(btrim(${t.productName})) between 1 and 200 and length(btrim(${t.maskedLabel})) between 1 and 100`),
  check("evaluation_disclosures_evidence_ck", sql`length(btrim(${t.conflictDisclosure})) between 1 and 2000 and length(btrim(${t.discussionReference})) between 1 and 300 and length(btrim(${t.reason})) between 1 and 500`),
  check("evaluation_disclosures_time_ck", sql`${t.discussionAt} <= ${t.disclosedAt}`),
]);
