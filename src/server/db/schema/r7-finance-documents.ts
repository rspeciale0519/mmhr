import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, jsonb, pgSchema, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { identities, orgs } from "./identity";
import { workflowDocumentUploads } from "./r4-document-uploads";
import { workflowDocuments } from "./workflow-foundation";
import { securityCommandReceipts } from "./security-commands";

export const financeDocumentSources = pgTable("finance_document_sources", {
  versionId: uuid("version_id").primaryKey(), organizationId: uuid("organization_id").notNull(), documentId: uuid("document_id").notNull(),
  sourceClass: text("source_class").notNull(), vendorOrganizationId: uuid("vendor_organization_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
  contractId: uuid("contract_id"), handoffId: uuid("handoff_id"), dealId: uuid("deal_id"),
  sourceSnapshot: jsonb("source_snapshot").notNull(), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex("finance_document_sources_original_binding_uq").on(table.organizationId, table.documentId, table.versionId),
  foreignKey({ columns: [table.organizationId, table.versionId], foreignColumns: [workflowDocumentUploads.organizationId, workflowDocumentUploads.versionId],
    name: "finance_document_sources_upload_fk" }).onDelete("restrict"),
  foreignKey({ columns: [table.organizationId, table.documentId], foreignColumns: [workflowDocuments.organizationId, workflowDocuments.id],
    name: "finance_document_sources_document_fk" }).onDelete("restrict"),
  check("finance_document_sources_class_ck", sql`(${table.sourceClass}='agreement' and ${table.contractId} is null and ${table.handoffId} is null and ${table.dealId} is null)
    or (${table.sourceClass}='signed_contract' and ${table.contractId} is not null and ${table.handoffId} is not null and ${table.dealId} is not null)`),
  check("finance_document_sources_snapshot_ck", sql`jsonb_typeof(${table.sourceSnapshot})='object' and octet_length(${table.sourceSnapshot}::text)<=2000`),
]);
const privateSchema = pgSchema("mmhr_private");
export const financeDocumentAccessGrants = privateSchema.table("finance_document_access_grants", {
  id: uuid("id").primaryKey().defaultRandom(), organizationId: uuid("organization_id").notNull(), documentId: uuid("document_id").notNull(),
  versionId: uuid("version_id").notNull(), revision: integer("revision").notNull(), purpose: text("purpose").notNull(),
  actorIdentityId: uuid("actor_identity_id").notNull().references(() => identities.id, { onDelete: "restrict" }),
  sessionId: uuid("session_id").notNull(), accessToken: text("access_token").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  correlationId: uuid("correlation_id").notNull(),
}, table => [
  foreignKey({ columns: [table.organizationId, table.versionId], foreignColumns: [workflowDocumentUploads.organizationId, workflowDocumentUploads.versionId],
    name: "finance_document_access_grants_upload_fk" }).onDelete("restrict"),
  index("finance_document_access_grants_session_idx").on(table.sessionId, table.versionId, table.expiresAt),
  check("finance_document_access_grants_revision_ck", sql`${table.revision} between 1 and 2147483646`),
  check("finance_document_access_grants_purpose_ck", sql`${table.purpose} in ('finance_review','finance_original')`),
  check("finance_document_access_grants_token_ck", sql`${table.accessToken} ~ '^[a-f0-9]{64}$'`),
  check("finance_document_access_grants_lifetime_ck", sql`${table.expiresAt}=${table.createdAt}+interval '60 seconds'`),
]);
export const financeDocumentApprovals = pgTable("finance_document_approvals", {
  versionId: uuid("version_id").primaryKey(), organizationId: uuid("organization_id").notNull(), documentId: uuid("document_id").notNull(),
  uploadRevision: integer("upload_revision").notNull(), sha256: text("sha256").notNull(),
  reviewedAccessId: uuid("reviewed_access_id").notNull().references(() => financeDocumentAccessGrants.id, { onDelete: "restrict" }),
  reviewerIdentityId: uuid("reviewer_identity_id").notNull().references(() => identities.id, { onDelete: "restrict" }),
  approvalReceiptId: uuid("approval_receipt_id").notNull().references(() => securityCommandReceipts.id, { onDelete: "restrict" }),
  approvedAt: timestamp("approved_at", { withTimezone: true }).notNull(),
}, table => [
  foreignKey({ columns: [table.organizationId, table.versionId], foreignColumns: [workflowDocumentUploads.organizationId, workflowDocumentUploads.versionId],
    name: "finance_document_approvals_upload_fk" }).onDelete("restrict"),
  check("finance_document_approvals_revision_ck", sql`${table.uploadRevision} between 1 and 2147483647`),
  check("finance_document_approvals_hash_ck", sql`${table.sha256} ~ '^[a-f0-9]{64}$'`),
]);
