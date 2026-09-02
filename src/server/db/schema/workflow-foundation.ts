import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
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
import { intakes } from "./r3-intake";

const auditColumns = () => ({
  createdByIdentityId: uuid("created_by_identity_id").references(() => identities.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const rfpVersions = pgTable(
  "rfp_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
    rfpId: uuid("rfp_id").notNull(),
    sourceIntakeId: uuid("source_intake_id"),
    version: integer("version").notNull(),
    status: text("status").notNull().default("draft"),
    title: text("title").notNull(),
    sections: jsonb("sections").notNull(),
    approvedByIdentityId: uuid("approved_by_identity_id").references(() => identities.id, { onDelete: "restrict" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvalReference: text("approval_reference"),
    ...auditColumns(),
  },
  (t) => [
    uniqueIndex("rfp_versions_organization_id_uq").on(t.organizationId, t.id),
    uniqueIndex("rfp_versions_organization_rfp_version_uq").on(t.organizationId, t.rfpId, t.version),
    index("rfp_versions_organization_intake_idx").on(t.organizationId, t.sourceIntakeId),
    index("rfp_versions_organization_status_idx").on(t.organizationId, t.status),
    check("rfp_versions_version_ck", sql`${t.version} > 0`),
    check("rfp_versions_status_ck", sql`${t.status} in ('draft', 'review', 'approved', 'distributed', 'closed', 'archived')`),
    check("rfp_versions_title_ck", sql`length(btrim(${t.title})) between 1 and 200`),
    check("rfp_versions_approval_ck", sql`(${t.approvedByIdentityId} is null and ${t.approvalReference} is null and ${t.approvedAt} is null) or (${t.approvedByIdentityId} is not null and ${t.approvalReference} is not null and ${t.approvedAt} is not null)`),
    foreignKey({ columns: [t.organizationId, t.sourceIntakeId], foreignColumns: [intakes.organizationId, intakes.id], name: "rfp_versions_source_intake_scope_fk" }).onDelete("restrict"),
  ],
);

export const rfpRecipients = pgTable(
  "rfp_recipients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
    rfpVersionId: uuid("rfp_version_id").notNull(),
    vendorProfileId: uuid("vendor_profile_id").notNull(),
    state: text("state").notNull().default("pending"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("rfp_recipients_version_vendor_uq").on(t.rfpVersionId, t.vendorProfileId),
    index("rfp_recipients_organization_state_idx").on(t.organizationId, t.state),
    foreignKey({ columns: [t.organizationId, t.rfpVersionId], foreignColumns: [rfpVersions.organizationId, rfpVersions.id], name: "rfp_recipients_version_scope_fk" }).onDelete("restrict"),
    check("rfp_recipients_state_ck", sql`${t.state} in ('pending', 'distributed', 'acknowledged', 'responded', 'withdrawn')`),
  ],
);

export const inboundEmailEvents = pgTable(
  "inbound_email_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerEventId: text("provider_event_id").notNull(),
    organizationId: uuid("organization_id").references(() => orgs.id, { onDelete: "restrict" }),
    conversationToken: text("conversation_token").notNull(),
    senderAddress: text("sender_address").notNull(),
    recipientAddresses: jsonb("recipient_addresses").notNull(),
    subject: text("subject"),
    bodyReference: text("body_reference").notNull(),
    attachmentReferences: jsonb("attachment_references").notNull(),
    rawBodyHash: text("raw_body_hash").notNull(),
    signedAt: timestamp("signed_at", { withTimezone: true }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
    signature: text("signature").notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("inbound_email_provider_event_uq").on(t.providerEventId),
    index("inbound_email_organization_received_idx").on(t.organizationId, t.receivedAt),
    check("inbound_email_body_hash_ck", sql`${t.rawBodyHash} ~ '^[0-9a-fA-F]{64}$'`),
  ],
);

export const workflowDocuments = pgTable(
  "workflow_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
    documentType: text("document_type").notNull(),
    currentVersion: integer("current_version").notNull().default(1),
    state: text("state").notNull().default("active"),
    ...auditColumns(),
  },
  (t) => [
    uniqueIndex("workflow_documents_organization_id_id_uq").on(t.organizationId, t.id),
    index("workflow_documents_organization_type_idx").on(t.organizationId, t.documentType, t.state),
    check("workflow_documents_type_ck", sql`${t.documentType} in ('rfp', 'response', 'proposal', 'contract', 'attachment', 'other')`),
    check("workflow_documents_state_ck", sql`${t.state} in ('active', 'archived')`),
    check("workflow_documents_version_ck", sql`${t.currentVersion} > 0`),
  ],
);

export const workflowDocumentVersions = pgTable(
  "workflow_document_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
    documentId: uuid("document_id").notNull(),
    version: integer("version").notNull(),
    state: text("state").notNull().default("ready"),
    sha256: text("sha256").notNull(),
    storageReference: text("storage_reference").notNull(),
    createdByIdentityId: uuid("created_by_identity_id").notNull().references(() => identities.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("workflow_document_versions_document_version_uq").on(t.documentId, t.version),
    index("workflow_document_versions_organization_state_idx").on(t.organizationId, t.state),
    foreignKey({ columns: [t.organizationId, t.documentId], foreignColumns: [workflowDocuments.organizationId, workflowDocuments.id], name: "workflow_document_versions_document_scope_fk" }).onDelete("restrict"),
    check("workflow_document_versions_state_ck", sql`${t.state} in ('ready', 'approved', 'superseded')`),
    check("workflow_document_versions_version_ck", sql`${t.version} > 0`),
    check("workflow_document_versions_hash_ck", sql`${t.sha256} ~ '^[0-9a-fA-F]{64}$'`),
  ],
);

export const workflowCommunications = pgTable(
  "workflow_communications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
    channel: text("channel").notNull().default("email"),
    direction: text("direction").notNull(),
    idempotencyKey: uuid("idempotency_key").notNull(),
    correlationId: uuid("correlation_id").notNull(),
    templateKey: text("template_key"),
    recipientReferences: jsonb("recipient_references").notNull(),
    associationReferences: jsonb("association_references").notNull(),
    consent: text("consent"),
    deliveryState: text("delivery_state").notNull().default("queued"),
    providerMessageId: text("provider_message_id"),
    ...auditColumns(),
  },
  (t) => [
    uniqueIndex("workflow_communications_organization_idempotency_uq").on(t.organizationId, t.idempotencyKey),
    index("workflow_communications_organization_state_idx").on(t.organizationId, t.deliveryState),
    check("workflow_communications_channel_ck", sql`${t.channel} = 'email'`),
    check("workflow_communications_direction_ck", sql`${t.direction} in ('outbound', 'inbound')`),
    check("workflow_communications_delivery_ck", sql`${t.deliveryState} in ('queued', 'sent', 'delivered', 'failed', 'bounced', 'complained', 'opted_out')`),
  ],
);

export const workflowJobs = pgTable(
  "workflow_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
    jobType: text("job_type").notNull(),
    correlationId: uuid("correlation_id").notNull(),
    idempotencyKey: uuid("idempotency_key").notNull(),
    payloadReferences: jsonb("payload_references").notNull(),
    maximumAttempts: integer("maximum_attempts").notNull().default(3),
    attemptsInCycle: integer("attempts_in_cycle").notNull().default(0),
    rerunCount: integer("rerun_count").notNull().default(0),
    scheduleAt: timestamp("schedule_at", { withTimezone: true }),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    state: text("state").notNull().default("queued"),
    lastFailure: jsonb("last_failure"),
    ...auditColumns(),
  },
  (t) => [
    uniqueIndex("workflow_jobs_organization_id_uq").on(t.organizationId, t.id),
    uniqueIndex("workflow_jobs_organization_idempotency_uq").on(t.organizationId, t.idempotencyKey),
    index("workflow_jobs_organization_state_schedule_idx").on(t.organizationId, t.state, t.scheduleAt),
    check("workflow_jobs_type_ck", sql`${t.jobType} in ('rfp_distribution', 'inbound_email', 'document_scan', 'content_acquisition', 'communication_delivery')`),
    check("workflow_jobs_state_ck", sql`${t.state} in ('queued', 'scheduled', 'running', 'retry_pending', 'needs_attention', 'succeeded', 'failed', 'cancelled')`),
    check("workflow_jobs_attempts_ck", sql`${t.maximumAttempts} between 1 and 10 and ${t.attemptsInCycle} between 0 and ${t.maximumAttempts} and ${t.rerunCount} >= 0`),
  ],
);

export const workflowJobAttempts = pgTable(
  "workflow_job_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
    jobId: uuid("job_id").notNull(),
    attemptNumber: integer("attempt_number").notNull(),
    correlationId: uuid("correlation_id").notNull(),
    trigger: text("trigger").notNull(),
    requestedBy: text("requested_by"),
    reason: text("reason"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    outcome: text("outcome").notNull(),
    failure: jsonb("failure"),
  },
  (t) => [
    index("workflow_job_attempts_job_time_idx").on(t.organizationId, t.jobId, t.startedAt),
    foreignKey({ columns: [t.organizationId, t.jobId], foreignColumns: [workflowJobs.organizationId, workflowJobs.id], name: "workflow_job_attempts_job_scope_fk" }).onDelete("restrict"),
    check("workflow_job_attempts_number_ck", sql`${t.attemptNumber} > 0`),
    check("workflow_job_attempts_trigger_ck", sql`${t.trigger} in ('automatic', 'manual')`),
    check("workflow_job_attempts_outcome_ck", sql`${t.outcome} in ('running', 'succeeded', 'failed')`),
  ],
);
