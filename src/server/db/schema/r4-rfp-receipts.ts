import { sql } from "drizzle-orm";
import { check, jsonb, pgSchema, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { identities, orgs } from "./identity";
import { rfpRecipients, rfpVersions } from "./workflow-foundation";
import { securityCommandReceipts } from "./security-commands";

const privateSchema = pgSchema("mmhr_private");
export const rfpReceiptConfirmations = privateSchema.table("rfp_receipt_confirmations", {
  id: uuid("id").primaryKey(), recipientId: uuid("recipient_id").notNull().references(() => rfpRecipients.id, { onDelete: "restrict" }),
  customerOrganizationId: uuid("customer_organization_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
  vendorOrganizationId: uuid("vendor_organization_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
  rfpVersionId: uuid("rfp_version_id").notNull().references(() => rfpVersions.id, { onDelete: "restrict" }),
  actorIdentityId: uuid("actor_identity_id").notNull().references(() => identities.id, { onDelete: "restrict" }),
  request: jsonb("original_request").notNull(), result: jsonb("original_result").notNull(),
  receiptId: uuid("receipt_id").notNull().references(() => securityCommandReceipts.id, { onDelete: "restrict" }),
  correlationId: uuid("correlation_id").notNull(), acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }).notNull(),
}, table => [
  uniqueIndex("rfp_receipt_confirmations_recipient_uq").on(table.recipientId),
  uniqueIndex("rfp_receipt_confirmations_receipt_uq").on(table.receiptId),
  check("rfp_receipt_confirmations_request_ck", sql`jsonb_typeof(${table.request}) = 'object' and octet_length(${table.request}::text) <= 2000`),
  check("rfp_receipt_confirmations_result_ck", sql`jsonb_typeof(${table.result}) = 'object' and octet_length(${table.result}::text) <= 2000`),
  check("rfp_receipt_confirmations_time_ck", sql`isfinite(${table.acknowledgedAt})`),
]);
