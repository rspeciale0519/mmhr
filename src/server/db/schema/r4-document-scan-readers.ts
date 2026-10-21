import { sql } from "drizzle-orm";
import { check, integer, pgSchema, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { workflowDocumentUploads } from "./r4-document-uploads";

const privateSchema = pgSchema("mmhr_private");

/** Owner-provisioned machine identities. No application identity or client table grant is permitted. */
export const documentScanReaders = privateSchema.table("document_scan_readers", {
  subjectId: uuid("subject_id").primaryKey(),
  sessionId: uuid("session_id").notNull(),
  loginName: text("login_name").notNull(),
  activatedAt: timestamp("activated_at", { withTimezone: true }).notNull().defaultNow(),
  validUntil: timestamp("valid_until", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
}, (t) => [
  uniqueIndex("document_scan_readers_login_uq").on(t.loginName),
  check("document_scan_readers_login_ck", sql`${t.loginName} ~ '^mmhr_document_worker_[0-9a-f]{32}$'`),
  check("document_scan_readers_lifetime_ck", sql`${t.validUntil} > ${t.activatedAt} and ${t.validUntil} <= ${t.activatedAt} + interval '10 minutes'`),
  check("document_scan_readers_revocation_ck", sql`${t.revokedAt} is null or ${t.revokedAt} >= ${t.activatedAt}`),
]).enableRLS();

/** Current capability, not history. Immutable upload events retain every claim and its token. */
export const documentScanLeaseOwners = privateSchema.table("document_scan_lease_owners", {
  versionId: uuid("version_id").primaryKey().references(() => workflowDocumentUploads.versionId, { onDelete: "restrict" }),
  loginName: text("login_name").notNull(),
  leaseToken: uuid("lease_token").notNull(),
  revision: integer("revision").notNull(),
  leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }).notNull(),
  boundAt: timestamp("bound_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  check("document_scan_lease_owners_login_ck", sql`${t.loginName} ~ '^mmhr_document_worker_[0-9a-f]{32}$'`),
  check("document_scan_lease_owners_revision_ck", sql`${t.revision} > 0`),
  check("document_scan_lease_owners_lifetime_ck", sql`${t.leaseExpiresAt} > ${t.boundAt} and ${t.leaseExpiresAt} <= ${t.boundAt} + interval '5 minutes'`),
]).enableRLS();
