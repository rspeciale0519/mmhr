import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { identities, orgs } from "./identity";
import { demoRounds } from "./r6-workflow";
import { rfpRecipients, workflowDocuments, workflowDocumentVersions, workflowJobs } from "./workflow-foundation";

export const workflowDocumentUploads = pgTable("workflow_document_uploads", {
  versionId: uuid("version_id").primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
  documentId: uuid("document_id").notNull(),
  uploadOrganizationId: uuid("upload_organization_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
  uploadedByIdentityId: uuid("uploaded_by_identity_id").notNull().references(() => identities.id, { onDelete: "restrict" }),
  sourceKind: text("source_kind").notNull(),
  rfpRecipientId: uuid("rfp_recipient_id"),
  demoId: uuid("demo_id"),
  fileName: text("file_name").notNull(),
  state: text("state").notNull().default("received"),
  revision: integer("revision").notNull().default(1),
  processingJobId: uuid("processing_job_id"),
  leaseToken: uuid("lease_token"),
  leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
  scanEvidence: jsonb("scan_evidence"),
  failureCode: text("failure_code"),
  reviewReason: text("review_reason"),
  approvedByIdentityId: uuid("approved_by_identity_id").references(() => identities.id, { onDelete: "restrict" }),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  correlationId: uuid("correlation_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("workflow_document_uploads_organization_version_uq").on(t.organizationId, t.versionId),
  index("workflow_document_uploads_state_created_idx").on(t.state, t.createdAt, t.versionId),
  index("workflow_document_uploads_organization_document_idx").on(t.organizationId, t.documentId, t.versionId),
  foreignKey({ columns: [t.organizationId, t.documentId], foreignColumns: [workflowDocuments.organizationId, workflowDocuments.id], name: "workflow_document_uploads_document_scope_fk" }).onDelete("restrict"),
  foreignKey({ columns: [t.organizationId, t.versionId], foreignColumns: [workflowDocumentVersions.organizationId, workflowDocumentVersions.id], name: "workflow_document_uploads_version_scope_fk" }).onDelete("restrict"),
  foreignKey({ columns: [t.organizationId, t.rfpRecipientId], foreignColumns: [rfpRecipients.organizationId, rfpRecipients.id], name: "workflow_document_uploads_recipient_scope_fk" }).onDelete("restrict"),
  foreignKey({ columns: [t.organizationId, t.demoId], foreignColumns: [demoRounds.organizationId, demoRounds.id], name: "workflow_document_uploads_demo_scope_fk" }).onDelete("restrict"),
  foreignKey({ columns: [t.organizationId, t.processingJobId], foreignColumns: [workflowJobs.organizationId, workflowJobs.id], name: "workflow_document_uploads_job_scope_fk" }).onDelete("restrict"),
  check("workflow_document_uploads_source_ck", sql`(${t.sourceKind} in ('workspace','finance') and ${t.rfpRecipientId} is null and ${t.demoId} is null)
    or (${t.sourceKind} = 'rfp_response' and ${t.rfpRecipientId} is not null and ${t.demoId} is null)
    or (${t.sourceKind} = 'demo_evidence' and ${t.demoId} is not null and ${t.rfpRecipientId} is null)`),
  check("workflow_document_uploads_state_ck", sql`${t.state} in ('received', 'quarantined', 'scanning', 'ready', 'processing', 'needs_review', 'approved', 'rejected', 'failed', 'superseded')`),
  check("workflow_document_uploads_name_ck", sql`octet_length(btrim(${t.fileName})) between 1 and 255
    and octet_length(${t.fileName}) <= 255 and ${t.fileName} !~ '[[:cntrl:]]'
    and position('/' in ${t.fileName}) = 0 and position(chr(92) in ${t.fileName}) = 0`),
  check("workflow_document_uploads_revision_ck", sql`${t.revision} > 0`),
  check("workflow_document_uploads_lease_ck", sql`(${t.state} in ('scanning', 'processing') and ${t.leaseToken} is not null and ${t.leaseExpiresAt} is not null)
    or (${t.state} not in ('scanning', 'processing') and ${t.leaseToken} is null and ${t.leaseExpiresAt} is null)`),
  check("workflow_document_uploads_scan_ck", sql`${t.scanEvidence} is null or jsonb_typeof(${t.scanEvidence}) = 'object'`),
  check("workflow_document_uploads_safe_state_ck", sql`${t.state} not in ('ready', 'processing', 'needs_review', 'approved')
    or (${t.scanEvidence} is not null and coalesce(${t.scanEvidence}->>'state', '') = 'clean')`),
  check("workflow_document_uploads_failure_ck", sql`${t.failureCode} is null or ${t.failureCode} ~ '^[a-z][a-z0-9_]{0,63}$'`),
  check("workflow_document_uploads_review_ck", sql`${t.reviewReason} is null or octet_length(btrim(${t.reviewReason})) between 1 and 2000`),
  check("workflow_document_uploads_approval_ck", sql`(${t.state} = 'approved' and ${t.approvedByIdentityId} is not null
    and ${t.approvedAt} is not null and ${t.reviewReason} is not null and ${t.approvedByIdentityId} <> ${t.uploadedByIdentityId})
    or (${t.state} <> 'approved')`),
  check("workflow_document_uploads_updated_ck", sql`${t.updatedAt} >= ${t.createdAt}`),
]);

export const workflowDocumentUploadEvents = pgTable("workflow_document_upload_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
  versionId: uuid("version_id").notNull(),
  revision: integer("revision").notNull(),
  action: text("action").notNull(),
  snapshot: jsonb("snapshot").notNull(),
  actorIdentityId: uuid("actor_identity_id").references(() => identities.id, { onDelete: "restrict" }),
  correlationId: uuid("correlation_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("workflow_document_upload_events_version_revision_uq").on(t.versionId, t.revision),
  foreignKey({ columns: [t.organizationId, t.versionId], foreignColumns: [workflowDocumentUploads.organizationId, workflowDocumentUploads.versionId], name: "workflow_document_upload_events_upload_scope_fk" }).onDelete("restrict"),
  check("workflow_document_upload_events_revision_ck", sql`${t.revision} > 0`),
  check("workflow_document_upload_events_action_ck", sql`${t.action} in ('reserve', 'uploaded', 'scan_claimed', 'scan_clean', 'scan_rejected', 'scan_failed', 'review_started', 'approve', 'reject', 'retry', 'supersede', 'abandon')`),
  check("workflow_document_upload_events_snapshot_ck", sql`jsonb_typeof(${t.snapshot}) = 'object' and octet_length(${t.snapshot}::text) <= 100000`),
]);
