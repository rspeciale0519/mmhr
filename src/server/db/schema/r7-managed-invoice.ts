import { sql } from "drizzle-orm";
import { bigint, check, foreignKey, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { identities, orgs } from "./identity";
import { commissionEvents, financeInvoices } from "./r7-finance";
import { managedCommissionCalculations } from "./r7-managed-finance";
import { securityCommandReceipts } from "./security-commands";

export const managedInvoicePreparations = pgTable("managed_invoice_preparations", {
  id: uuid("id").primaryKey(), organizationId: uuid("organization_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
  invoiceId: uuid("invoice_id").notNull(), commissionEventId: uuid("commission_event_id").notNull(), calculationId: uuid("calculation_id").notNull(),
  expectedEventRevision: integer("expected_event_revision").notNull(), expectedInvoiceRevision: integer("expected_invoice_revision").notNull(),
  ownerIdentityId: uuid("owner_identity_id").notNull().references(() => identities.id, { onDelete: "restrict" }),
  amountMinorUnits: bigint("amount_minor_units", { mode: "number" }).notNull(), currency: text("currency").notNull(),
  invoiceNumber: text("invoice_number").notNull(), issueDate: timestamp("issue_date", { withTimezone: true, mode: "string" }).notNull(),
  dueDate: timestamp("due_date", { withTimezone: true, mode: "string" }).notNull(), collectionTerms: text("collection_terms").notNull(),
  supportingSources: jsonb("supporting_sources").notNull(), sourceObservation: jsonb("source_observation").notNull(), sourceDigest: text("source_digest").notNull(),
  state: text("state").notNull().default("pending"), revision: integer("revision").notNull().default(1),
  preparedByIdentityId: uuid("prepared_by_identity_id").notNull().references(() => identities.id, { onDelete: "restrict" }),
  preparedAt: timestamp("prepared_at", { withTimezone: true }).notNull(), correlationId: uuid("correlation_id").notNull(),
  prepareReceiptId: uuid("prepare_receipt_id").notNull().references(() => securityCommandReceipts.id, { onDelete: "restrict" }),
  prepareRequest: jsonb("prepare_request").notNull(), prepareRequestDigest: text("prepare_request_digest").notNull(),
  decidedByIdentityId: uuid("decided_by_identity_id").references(() => identities.id, { onDelete: "restrict" }),
  decidedAt: timestamp("decided_at", { withTimezone: true }), decisionReceiptId: uuid("decision_receipt_id").references(() => securityCommandReceipts.id, { onDelete: "restrict" }),
  decisionRequest: jsonb("decision_request"), decisionRequestDigest: text("decision_request_digest"), decisionCorrelationId: uuid("decision_correlation_id"),
}, table => [
  uniqueIndex("managed_invoice_preparations_scope_uq").on(table.organizationId, table.invoiceId, table.id),
  uniqueIndex("managed_invoice_preparations_lineage_uq").on(table.invoiceId, table.expectedInvoiceRevision),
  foreignKey({ columns: [table.organizationId, table.invoiceId, table.commissionEventId], foreignColumns: [financeInvoices.organizationId, financeInvoices.id, financeInvoices.commissionEventId], name: "managed_invoice_preparations_invoice_fk" }).onDelete("restrict"),
  foreignKey({ columns: [table.organizationId, table.commissionEventId], foreignColumns: [commissionEvents.organizationId, commissionEvents.id], name: "managed_invoice_preparations_event_fk" }).onDelete("restrict"),
  foreignKey({ columns: [table.organizationId, table.commissionEventId, table.calculationId], foreignColumns: [managedCommissionCalculations.organizationId, managedCommissionCalculations.commissionEventId, managedCommissionCalculations.id], name: "managed_invoice_preparations_calculation_fk" }).onDelete("restrict"),
  check("managed_invoice_preparations_value_ck", sql`${table.amountMinorUnits} between 0 and 9007199254740991 and ${table.currency} ~ '^[A-Z]{3}$'
    and ${table.expectedEventRevision} > 0 and ${table.expectedInvoiceRevision} >= 0 and ${table.dueDate} >= ${table.issueDate}`),
  check("managed_invoice_preparations_evidence_ck", sql`${table.sourceDigest} ~ '^[a-f0-9]{64}$' and ${table.prepareRequestDigest} ~ '^[a-f0-9]{64}$'
    and jsonb_typeof(${table.supportingSources}) = 'array' and jsonb_array_length(${table.supportingSources}) between 2 and 10
    and jsonb_typeof(${table.sourceObservation}) = 'object' and jsonb_typeof(${table.prepareRequest}) = 'object'
    and octet_length(${table.sourceObservation}::text) <= 400000 and octet_length(${table.prepareRequest}::text) <= 100000`),
  check("managed_invoice_preparations_decision_ck", sql`(${table.state} = 'pending' and ${table.revision} = 1
    and ${table.decidedByIdentityId} is null and ${table.decidedAt} is null and ${table.decisionReceiptId} is null
    and ${table.decisionRequest} is null and ${table.decisionRequestDigest} is null and ${table.decisionCorrelationId} is null)
    or (${table.state} in ('approved','rejected') and ${table.revision} = 2 and ${table.decidedByIdentityId} is not null
    and ${table.decidedByIdentityId} <> ${table.preparedByIdentityId} and ${table.decidedAt} >= ${table.preparedAt}
    and ${table.decidedAt} is not null and ${table.decisionReceiptId} is not null and jsonb_typeof(${table.decisionRequest}) = 'object'
    and ${table.decisionRequestDigest} is not null and ${table.decisionRequestDigest} ~ '^[a-f0-9]{64}$' and ${table.decisionCorrelationId} is not null)`),
]);

export const managedInvoiceEvents = pgTable("managed_invoice_events", {
  id: uuid("id").primaryKey().defaultRandom(), organizationId: uuid("organization_id").notNull(), invoiceId: uuid("invoice_id").notNull(),
  preparationId: uuid("preparation_id").notNull(), action: text("action").notNull(),
  actorIdentityId: uuid("actor_identity_id").notNull().references(() => identities.id, { onDelete: "restrict" }),
  receiptId: uuid("receipt_id").notNull().references(() => securityCommandReceipts.id, { onDelete: "restrict" }), correlationId: uuid("correlation_id").notNull(),
  request: jsonb("request").notNull(), requestDigest: text("request_digest").notNull(),
  invoiceSnapshot: jsonb("invoice_snapshot").notNull(), preparationSnapshot: jsonb("preparation_snapshot").notNull(), result: jsonb("result").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
}, table => [
  uniqueIndex("managed_invoice_events_receipt_uq").on(table.receiptId),
  uniqueIndex("managed_invoice_events_action_uq").on(table.preparationId, table.action),
  index("managed_invoice_events_scope_idx").on(table.organizationId, table.invoiceId, table.occurredAt),
  foreignKey({ columns: [table.organizationId, table.invoiceId, table.preparationId], foreignColumns: [managedInvoicePreparations.organizationId, managedInvoicePreparations.invoiceId, managedInvoicePreparations.id], name: "managed_invoice_events_preparation_fk" }).onDelete("restrict"),
  check("managed_invoice_events_action_ck", sql`${table.action} in ('prepare_invoice','approve_invoice','reject_invoice','issue_invoice')`),
  check("managed_invoice_events_evidence_ck", sql`${table.requestDigest} ~ '^[a-f0-9]{64}$' and jsonb_typeof(${table.request}) = 'object'
    and jsonb_typeof(${table.invoiceSnapshot}) = 'object' and jsonb_typeof(${table.preparationSnapshot}) = 'object'
    and jsonb_typeof(${table.result}) = 'object' and octet_length(${table.request}::text) <= 100000
    and octet_length(${table.invoiceSnapshot}::text) <= 100000 and octet_length(${table.preparationSnapshot}::text) <= 600000`),
]);
