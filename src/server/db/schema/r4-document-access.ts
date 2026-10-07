import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, pgSchema, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { identities, orgs } from "./identity";
import { workflowDocumentUploads } from "./r4-document-uploads";

const privateSchema = pgSchema("mmhr_private");

/** The capability still requires its original live session and current document authority. */
export const documentAccessGrants = privateSchema.table("document_access_grants", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
  documentId: uuid("document_id").notNull(),
  versionId: uuid("version_id").notNull(),
  revision: integer("revision").notNull(),
  purpose: text("purpose").notNull(),
  actorIdentityId: uuid("actor_identity_id").notNull().references(() => identities.id, { onDelete: "restrict" }),
  sessionId: uuid("session_id").notNull(),
  accessToken: text("access_token").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  correlationId: uuid("correlation_id").notNull(),
}, (t) => [
  foreignKey({ columns: [t.organizationId, t.versionId], foreignColumns: [workflowDocumentUploads.organizationId, workflowDocumentUploads.versionId],
    name: "document_access_grants_version_scope_fk" }).onDelete("restrict"),
  index("document_access_grants_session_version_idx").on(t.sessionId, t.versionId, t.expiresAt),
  check("document_access_grants_revision_ck", sql`${t.revision} between 1 and 2147483646`),
  check("document_access_grants_purpose_ck", sql`${t.purpose} in ('review', 'approved')`),
  check("document_access_grants_token_ck", sql`${t.accessToken} ~ '^[0-9a-f]{64}$'`),
  check("document_access_grants_lifetime_ck", sql`${t.expiresAt} = ${t.createdAt} + interval '60 seconds'`),
]).enableRLS();
