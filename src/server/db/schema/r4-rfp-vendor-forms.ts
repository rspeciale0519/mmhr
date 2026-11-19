import { sql } from "drizzle-orm";
import { check, customType, foreignKey, index, integer, jsonb, pgSchema, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { identities, orgs } from "./identity";
import { rfpRecipients } from "./workflow-foundation";

/**
 * Tables for the RFP web form that MMHR emails to a vendor contact.
 *
 * All four tables live in the private schema. No app user can read or write
 * them directly. Every read and write goes through a reviewed SQL function
 * in migration 0180, which checks either staff access or the vendor's
 * private link.
 */
const privateSchema = pgSchema("mmhr_private");

/** Postgres "bytea" column: raw file bytes. */
const bytea = customType<{ data: Buffer }>({ dataType: () => "bytea" });

/** The person at a vendor who receives RFP emails. One per vendor. */
export const vendorRfpContacts = privateSchema.table("vendor_rfp_contacts", {
  vendorOrganizationId: uuid("vendor_organization_id").primaryKey().references(() => orgs.id, { onDelete: "restrict" }),
  contactName: text("contact_name").notNull(),
  contactEmail: text("contact_email").notNull(),
  updatedByIdentityId: uuid("updated_by_identity_id").notNull().references(() => identities.id, { onDelete: "restrict" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  check("vendor_rfp_contacts_name_ck", sql`length(btrim(${t.contactName})) between 1 and 200`),
  check("vendor_rfp_contacts_email_ck", sql`${t.contactEmail} = lower(btrim(${t.contactEmail})) and length(${t.contactEmail}) between 3 and 320 and ${t.contactEmail} ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'`),
]).enableRLS();

/**
 * One RFP web form for one vendor on one RFP.
 * `organizationId` is the customer's organization. `recipientId` points at
 * the existing RFP recipient row, so there is at most one form per vendor
 * per RFP version.
 */
export const rfpVendorForms = privateSchema.table("rfp_vendor_forms", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
  recipientId: uuid("recipient_id").notNull(),
  vendorOrganizationId: uuid("vendor_organization_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
  // SHA-256 of the private link token. The token itself is never stored.
  tokenHash: text("token_hash").notNull(),
  libraryVersion: integer("library_version").notNull(),
  // Which topic tabs staff chose, e.g. ["core","payroll"].
  tabKeys: jsonb("tab_keys").notNull(),
  // Customer details shown to the vendor, copied at send time.
  clientOverview: jsonb("client_overview").notNull(),
  // The introduction text and title copied from the approved RFP.
  rfpTitle: text("rfp_title").notNull(),
  rfpIntroduction: text("rfp_introduction").notNull(),
  contactName: text("contact_name").notNull(),
  contactEmail: text("contact_email").notNull(),
  state: text("state").notNull().default("prepared"),
  // Saved answers: { "<question key>": { "answer": "yes", "comment": "..." } }.
  answers: jsonb("answers").notNull().default({}),
  respondentName: text("respondent_name"),
  respondentEmail: text("respondent_email"),
  dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  openedAt: timestamp("opened_at", { withTimezone: true }),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  repliedAt: timestamp("replied_at", { withTimezone: true }),
  createdByIdentityId: uuid("created_by_identity_id").notNull().references(() => identities.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("rfp_vendor_forms_recipient_uq").on(t.recipientId),
  uniqueIndex("rfp_vendor_forms_token_hash_uq").on(t.tokenHash),
  index("rfp_vendor_forms_vendor_idx").on(t.vendorOrganizationId, t.createdAt),
  index("rfp_vendor_forms_organization_idx").on(t.organizationId, t.id),
  foreignKey({ columns: [t.organizationId, t.recipientId], foreignColumns: [rfpRecipients.organizationId, rfpRecipients.id], name: "rfp_vendor_forms_recipient_scope_fk" }).onDelete("restrict"),
  check("rfp_vendor_forms_token_hash_ck", sql`${t.tokenHash} ~ '^[0-9a-f]{64}$'`),
  check("rfp_vendor_forms_state_ck", sql`${t.state} in ('prepared','sent','submitted','replied','declined','no_response')`),
  check("rfp_vendor_forms_tabs_ck", sql`jsonb_typeof(${t.tabKeys}) = 'array' and jsonb_array_length(${t.tabKeys}) between 1 and 50`),
  check("rfp_vendor_forms_overview_ck", sql`jsonb_typeof(${t.clientOverview}) = 'object'`),
  check("rfp_vendor_forms_answers_ck", sql`jsonb_typeof(${t.answers}) = 'object'`),
  check("rfp_vendor_forms_library_ck", sql`${t.libraryVersion} > 0`),
]).enableRLS();

/** Tracking log: every send, follow-up, reply, and status change. */
export const rfpVendorFormEvents = privateSchema.table("rfp_vendor_form_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  formId: uuid("form_id").notNull().references(() => rfpVendorForms.id, { onDelete: "restrict" }),
  kind: text("kind").notNull(),
  note: text("note"),
  providerMessageId: text("provider_message_id"),
  // Empty when the vendor (not a staff member) caused the event.
  actorIdentityId: uuid("actor_identity_id").references(() => identities.id, { onDelete: "restrict" }),
  // When it happened. Staff may enter a past date for a reply or a call.
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("rfp_vendor_form_events_form_idx").on(t.formId, t.createdAt),
  check("rfp_vendor_form_events_kind_ck", sql`${t.kind} in ('email_sent','email_failed','opened','follow_up_email','follow_up_note','submitted','reply_recorded','declined','no_response','reopened','due_changed')`),
  check("rfp_vendor_form_events_note_ck", sql`${t.note} is null or length(${t.note}) between 1 and 2000`),
]).enableRLS();

/** A document the vendor uploaded on the form. The bytes are kept here. */
export const rfpVendorFormFiles = privateSchema.table("rfp_vendor_form_files", {
  id: uuid("id").primaryKey().defaultRandom(),
  formId: uuid("form_id").notNull().references(() => rfpVendorForms.id, { onDelete: "restrict" }),
  // Which requested document this is, e.g. "contract_sample", or "other".
  documentKey: text("document_key").notNull(),
  fileName: text("file_name").notNull(),
  contentType: text("content_type").notNull(),
  byteSize: integer("byte_size").notNull(),
  sha256: text("sha256").notNull(),
  content: bytea("content").notNull(),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("rfp_vendor_form_files_form_idx").on(t.formId, t.uploadedAt),
  check("rfp_vendor_form_files_key_ck", sql`${t.documentKey} ~ '^[a-z][a-z0-9_]{0,63}$'`),
  check("rfp_vendor_form_files_name_ck", sql`length(btrim(${t.fileName})) between 1 and 255 and ${t.fileName} !~ '[[:cntrl:]]' and position('/' in ${t.fileName}) = 0 and position(chr(92) in ${t.fileName}) = 0`),
  check("rfp_vendor_form_files_type_ck", sql`${t.contentType} in ('application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.openxmlformats-officedocument.presentationml.presentation','image/png','image/jpeg')`),
  // 4 MB. The hosting platform refuses request bodies larger than about 4.5 MB.
  check("rfp_vendor_form_files_size_ck", sql`${t.byteSize} between 1 and 4194304 and octet_length(${t.content}) = ${t.byteSize}`),
  check("rfp_vendor_form_files_sha_ck", sql`${t.sha256} ~ '^[0-9a-f]{64}$'`),
]).enableRLS();
