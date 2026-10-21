import { sql } from "drizzle-orm";
import { check, foreignKey, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { identities, orgs } from "./identity";
import { evaluationCandidates } from "./r3-intake";
import { evaluationPublications, evaluationPublicationOptions } from "./r3-publication";

/** Immutable customer choices and the exact approved comparison that supplied them. */
export const evaluationInitialSelections = pgTable("evaluation_initial_selections", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
  intakeId: uuid("intake_id").notNull(),
  publicationId: uuid("publication_id").notNull(),
  inputDigest: text("input_digest").notNull(),
  selectedCount: integer("selected_count").notNull(),
  initialCandidateCount: integer("initial_candidate_count").notNull(),
  createdByIdentityId: uuid("created_by_identity_id").notNull().references(() => identities.id, { onDelete: "restrict" }),
  correlationId: uuid("correlation_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`clock_timestamp()`),
}, (t) => [
  uniqueIndex("evaluation_initial_selections_scope_id_uq").on(t.organizationId, t.id),
  uniqueIndex("evaluation_initial_selections_binding_uq").on(t.organizationId, t.id, t.intakeId, t.publicationId),
  foreignKey({
    columns: [t.organizationId, t.intakeId, t.publicationId],
    foreignColumns: [evaluationPublications.organizationId, evaluationPublications.intakeId, evaluationPublications.id],
    name: "evaluation_initial_selections_publication_fk",
  }).onDelete("restrict"),
  check("evaluation_initial_selections_digest_ck", sql`${t.inputDigest} ~ '^[a-f0-9]{64}$'`),
  check("evaluation_initial_selections_count_ck", sql`${t.selectedCount} between 1 and 5 and ${t.initialCandidateCount} between ${t.selectedCount} and 5`),
]);

/** Exact scope joins keep option, intake, selection batch and candidate together. */
export const evaluationInitialSelectionItems = pgTable("evaluation_initial_selection_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull(),
  intakeId: uuid("intake_id").notNull(),
  publicationId: uuid("publication_id").notNull(),
  selectionId: uuid("selection_id").notNull(),
  optionId: uuid("option_id").notNull(),
  candidateId: uuid("candidate_id").notNull(),
  position: integer("position").notNull(),
}, (t) => [
  uniqueIndex("evaluation_initial_selection_items_candidate_uq").on(t.organizationId, t.candidateId),
  uniqueIndex("evaluation_initial_selection_items_option_uq").on(t.organizationId, t.publicationId, t.optionId),
  uniqueIndex("evaluation_initial_selection_items_position_uq").on(t.organizationId, t.selectionId, t.position),
  foreignKey({
    columns: [t.organizationId, t.selectionId, t.intakeId, t.publicationId],
    foreignColumns: [evaluationInitialSelections.organizationId, evaluationInitialSelections.id, evaluationInitialSelections.intakeId, evaluationInitialSelections.publicationId],
    name: "evaluation_initial_selection_items_batch_fk",
  }).onDelete("restrict"),
  foreignKey({
    columns: [t.organizationId, t.publicationId, t.optionId],
    foreignColumns: [evaluationPublicationOptions.organizationId, evaluationPublicationOptions.publicationId, evaluationPublicationOptions.id],
    name: "evaluation_initial_selection_items_option_fk",
  }).onDelete("restrict"),
  foreignKey({
    columns: [t.organizationId, t.intakeId, t.candidateId],
    foreignColumns: [evaluationCandidates.organizationId, evaluationCandidates.intakeId, evaluationCandidates.id],
    name: "evaluation_initial_selection_items_candidate_fk",
  }).onDelete("restrict"),
  check("evaluation_initial_selection_items_position_ck", sql`${t.position} between 1 and 5`),
]);
