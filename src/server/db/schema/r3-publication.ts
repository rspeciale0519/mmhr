import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { products } from "./crm";
import { identities, orgs } from "./identity";
import { intakes } from "./r3-intake";

/** Private, immutable review inputs. Publication state comes from decisions. */
export const evaluationPublications = pgTable("evaluation_publications", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
  intakeId: uuid("intake_id").notNull(),
  sequence: integer("sequence").notNull(),
  intakeRevision: integer("intake_revision").notNull(),
  configuration: jsonb("configuration").notNull(),
  inputSnapshot: jsonb("input_snapshot").notNull(),
  inputDigest: text("input_digest").notNull(),
  optionCount: integer("option_count").notNull(),
  createdByIdentityId: uuid("created_by_identity_id").notNull().references(() => identities.id, { onDelete: "restrict" }),
  correlationId: uuid("correlation_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("evaluation_publications_scope_id_uq").on(t.organizationId, t.id),
  uniqueIndex("evaluation_publications_sequence_uq").on(t.organizationId, t.intakeId, t.sequence),
  foreignKey({ columns: [t.organizationId, t.intakeId], foreignColumns: [intakes.organizationId, intakes.id], name: "evaluation_publications_intake_scope_fk" }).onDelete("restrict"),
  check("evaluation_publications_revision_ck", sql`${t.sequence} > 0 and ${t.intakeRevision} > 0`),
  check("evaluation_publications_configuration_ck", sql`jsonb_typeof(${t.configuration}) = 'object' and octet_length(${t.configuration}::text) <= 1000000`),
  check("evaluation_publications_snapshot_ck", sql`jsonb_typeof(${t.inputSnapshot}) = 'object' and octet_length(${t.inputSnapshot}::text) <= 20000000`),
  check("evaluation_publications_digest_ck", sql`${t.inputDigest} ~ '^[a-f0-9]{64}$'`),
  check("evaluation_publications_count_ck", sql`${t.optionCount} >= 0`),
]);

/** Public reads must select only masked fields, never provider identifiers. */
export const evaluationPublicationOptions = pgTable("evaluation_publication_options", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
  publicationId: uuid("publication_id").notNull(),
  vendorOrganizationId: uuid("vendor_organization_id").notNull(),
  productId: uuid("product_id").notNull(),
  ordinal: integer("ordinal").notNull(),
  maskedLabel: text("masked_label").notNull(),
  eligibility: text("eligibility").notNull(),
  deterministicScore: integer("deterministic_score").notNull(),
  confidenceBasisPoints: integer("confidence_basis_points").notNull(),
  fitReasons: jsonb("fit_reasons").notNull(),
  limitations: jsonb("limitations").notNull(),
  evidenceFreshAt: timestamp("evidence_fresh_at", { withTimezone: true }),
  validUntil: timestamp("valid_until", { withTimezone: true }),
}, (t) => [
  uniqueIndex("evaluation_publication_options_scope_id_uq").on(t.organizationId, t.id),
  uniqueIndex("evaluation_publication_options_product_uq").on(t.publicationId, t.productId),
  uniqueIndex("evaluation_publication_options_ordinal_uq").on(t.publicationId, t.ordinal),
  foreignKey({ columns: [t.organizationId, t.publicationId], foreignColumns: [evaluationPublications.organizationId, evaluationPublications.id], name: "evaluation_publication_options_publication_scope_fk" }).onDelete("restrict"),
  foreignKey({ columns: [t.vendorOrganizationId, t.productId], foreignColumns: [products.organizationId, products.id], name: "evaluation_publication_options_vendor_product_fk" }).onDelete("restrict"),
  check("evaluation_publication_options_ordinal_ck", sql`${t.ordinal} > 0 and ${t.maskedLabel} = 'Option ' || ${t.ordinal}::text`),
  check("evaluation_publication_options_eligibility_ck", sql`${t.eligibility} in ('eligible', 'ineligible', 'unknown')`),
  check("evaluation_publication_options_scores_ck", sql`${t.deterministicScore} between 0 and 10000 and ${t.confidenceBasisPoints} between 0 and 10000`),
  check("evaluation_publication_options_reasons_ck", sql`jsonb_typeof(${t.fitReasons}) = 'array' and jsonb_array_length(${t.fitReasons}) <= 2000 and jsonb_typeof(${t.limitations}) = 'array' and jsonb_array_length(${t.limitations}) <= 2000`),
  check("evaluation_publication_options_freshness_ck", sql`(${t.evidenceFreshAt} is null and ${t.validUntil} is null) or (${t.evidenceFreshAt} is not null and ${t.validUntil} is not null and ${t.validUntil} > ${t.evidenceFreshAt})`),
]);

export const evaluationPublicationDecisions = pgTable("evaluation_publication_decisions", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
  publicationId: uuid("publication_id").notNull(),
  decision: text("decision").notNull(),
  reason: text("reason").notNull(),
  approvalReference: text("approval_reference"),
  actorIdentityId: uuid("actor_identity_id").notNull().references(() => identities.id, { onDelete: "restrict" }),
  correlationId: uuid("correlation_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("evaluation_publication_decisions_once_uq").on(t.publicationId, t.decision),
  index("evaluation_publication_decisions_scope_time_idx").on(t.organizationId, t.publicationId, t.createdAt),
  foreignKey({ columns: [t.organizationId, t.publicationId], foreignColumns: [evaluationPublications.organizationId, evaluationPublications.id], name: "evaluation_publication_decisions_publication_scope_fk" }).onDelete("restrict"),
  check("evaluation_publication_decisions_decision_ck", sql`${t.decision} in ('published', 'revoked')`),
  check("evaluation_publication_decisions_reason_ck", sql`length(btrim(${t.reason})) between 1 and 2000`),
  check("evaluation_publication_decisions_approval_ck", sql`(${t.decision} = 'published' and ${t.approvalReference} is not null and length(btrim(${t.approvalReference})) between 1 and 500) or (${t.decision} = 'revoked' and ${t.approvalReference} is null)`),
]);
