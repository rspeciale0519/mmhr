import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  bigint,
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
import { deals } from "./crm-workflow";

export const commissionStructures = pgTable("commission_structures", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
  vendorOrganizationId: uuid("vendor_organization_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
  effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull(),
  effectiveTo: timestamp("effective_to", { withTimezone: true }),
  calculationType: text("calculation_type").notNull(),
  rateBasisPoints: integer("rate_basis_points"),
  flatAmountMinorUnits: bigint("flat_amount_minor_units", { mode: "number" }),
  currency: text("currency").notNull(),
  sourceAgreementId: uuid("source_agreement_id").notNull(),
  revision: integer("revision").notNull(),
  createdByIdentityId: uuid("created_by_identity_id").notNull().references(() => identities.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("commission_structures_organization_id_uq").on(t.organizationId, t.id),
  index("commission_structures_vendor_effective_idx").on(t.organizationId, t.vendorOrganizationId, t.effectiveFrom),
  check("commission_structures_scope_ck", sql`${t.organizationId} <> ${t.vendorOrganizationId}`),
  check("commission_structures_type_ck", sql`${t.calculationType} in ('contract_value_rate', 'flat_amount')`),
  check("commission_structures_currency_ck", sql`${t.currency} ~ '^[A-Z]{3}$'`),
  check("commission_structures_revision_ck", sql`${t.revision} > 0`),
]);

export const commissionEvents = pgTable("commission_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
  contractId: uuid("contract_id").notNull(),
  dealId: uuid("deal_id").notNull(),
  vendorOrganizationId: uuid("vendor_organization_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
  structureId: uuid("structure_id").notNull(),
  idempotencyKey: uuid("idempotency_key").notNull(),
  signedAt: timestamp("signed_at", { withTimezone: true }).notNull(),
  currency: text("currency").notNull(),
  contractValueMinorUnits: bigint("contract_value_minor_units", { mode: "number" }).notNull(),
  commissionAmountMinorUnits: bigint("commission_amount_minor_units", { mode: "number" }).notNull(),
  calculationRevision: integer("calculation_revision").notNull(),
  state: text("state").notNull().default("pending_review"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("commission_events_organization_id_uq").on(t.organizationId, t.id),
  uniqueIndex("commission_events_idempotency_uq").on(t.organizationId, t.idempotencyKey),
  foreignKey({ columns: [t.organizationId, t.dealId], foreignColumns: [deals.organizationId, deals.id], name: "commission_events_deal_scope_fk" }),
  foreignKey({ columns: [t.organizationId, t.structureId], foreignColumns: [commissionStructures.organizationId, commissionStructures.id], name: "commission_events_structure_scope_fk" }),
  check("commission_events_currency_ck", sql`${t.currency} ~ '^[A-Z]{3}$'`),
  check("commission_events_amount_ck", sql`${t.contractValueMinorUnits} >= 0 and ${t.commissionAmountMinorUnits} >= 0`),
  check("commission_events_revision_ck", sql`${t.calculationRevision} > 0`),
]);

export const commissionEventHistory = pgTable("commission_event_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
  commissionEventId: uuid("commission_event_id").notNull(),
  fromState: text("from_state").notNull(),
  toState: text("to_state").notNull(),
  actorIdentityId: uuid("actor_identity_id").notNull().references(() => identities.id, { onDelete: "restrict" }),
  reason: text("reason").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  correlationId: uuid("correlation_id").notNull(),
}, (t) => [
  index("commission_event_history_scope_time_idx").on(t.organizationId, t.commissionEventId, t.occurredAt),
  foreignKey({ columns: [t.organizationId, t.commissionEventId], foreignColumns: [commissionEvents.organizationId, commissionEvents.id], name: "commission_event_history_scope_fk" }),
]);

export const commissionPayments = pgTable("commission_payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
  commissionEventId: uuid("commission_event_id").notNull(),
  amountMinorUnits: bigint("amount_minor_units", { mode: "number" }).notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
  state: text("state").notNull().default("received"),
  externalReference: text("external_reference"),
  recordedByIdentityId: uuid("recorded_by_identity_id").notNull().references(() => identities.id, { onDelete: "restrict" }),
}, (t) => [
  uniqueIndex("commission_payments_organization_id_uq").on(t.organizationId, t.id),
  foreignKey({ columns: [t.organizationId, t.commissionEventId], foreignColumns: [commissionEvents.organizationId, commissionEvents.id], name: "commission_payments_scope_fk" }),
  check("commission_payments_amount_ck", sql`${t.amountMinorUnits} > 0`),
  check("commission_payments_state_ck", sql`${t.state} in ('received', 'reversed')`),
]);

export const financeInvoices = pgTable("finance_invoices", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
  commissionEventId: uuid("commission_event_id").notNull(),
  vendorOrganizationId: uuid("vendor_organization_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
  currency: text("currency").notNull(),
  amountMinorUnits: bigint("amount_minor_units", { mode: "number" }).notNull(),
  status: text("status").notNull().default("draft"),
  invoiceNumber: text("invoice_number"),
  issueDate: timestamp("issue_date", { withTimezone: true }),
  dueDate: timestamp("due_date", { withTimezone: true }),
  supportingDocumentReferences: jsonb("supporting_document_references").notNull().default([]),
  createdByIdentityId: uuid("created_by_identity_id").notNull().references(() => identities.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("finance_invoices_organization_id_uq").on(t.organizationId, t.id),
  foreignKey({ columns: [t.organizationId, t.commissionEventId], foreignColumns: [commissionEvents.organizationId, commissionEvents.id], name: "finance_invoices_scope_fk" }),
  check("finance_invoices_currency_ck", sql`${t.currency} ~ '^[A-Z]{3}$'`),
  check("finance_invoices_amount_ck", sql`${t.amountMinorUnits} >= 0`),
  check("finance_invoices_status_ck", sql`${t.status} in ('draft', 'ready', 'issued', 'voided')`),
  check("finance_invoices_dates_ck", sql`${t.dueDate} is null or ${t.issueDate} is null or ${t.dueDate} >= ${t.issueDate}`),
]);

export const financeDisputes = pgTable("finance_disputes", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
  commissionEventId: uuid("commission_event_id").notNull(),
  openedByIdentityId: uuid("opened_by_identity_id").notNull().references(() => identities.id, { onDelete: "restrict" }),
  openedAt: timestamp("opened_at", { withTimezone: true }).notNull(),
  reasonCode: text("reason_code").notNull(),
  reason: text("reason").notNull(),
  status: text("status").notNull().default("open"),
  resolvedByIdentityId: uuid("resolved_by_identity_id").references(() => identities.id, { onDelete: "restrict" }),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolution: text("resolution"),
}, (t) => [
  uniqueIndex("finance_disputes_organization_id_uq").on(t.organizationId, t.id),
  foreignKey({ columns: [t.organizationId, t.commissionEventId], foreignColumns: [commissionEvents.organizationId, commissionEvents.id], name: "finance_disputes_scope_fk" }),
  check("finance_disputes_reason_code_ck", sql`${t.reasonCode} in ('amount', 'eligibility', 'duplicate', 'payment', 'other')`),
  check("finance_disputes_status_ck", sql`${t.status} in ('open', 'resolved', 'rejected')`),
]);

export const financeAdjustments = pgTable("finance_adjustments", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
  commissionEventId: uuid("commission_event_id").notNull(),
  direction: text("direction").notNull(),
  amountMinorUnits: bigint("amount_minor_units", { mode: "number" }).notNull(),
  reason: text("reason").notNull(),
  approvedByIdentityId: uuid("approved_by_identity_id").notNull().references(() => identities.id, { onDelete: "restrict" }),
  approvedAt: timestamp("approved_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("finance_adjustments_organization_id_uq").on(t.organizationId, t.id),
  foreignKey({ columns: [t.organizationId, t.commissionEventId], foreignColumns: [commissionEvents.organizationId, commissionEvents.id], name: "finance_adjustments_scope_fk" }),
  check("finance_adjustments_direction_ck", sql`${t.direction} in ('increase', 'decrease')`),
  check("finance_adjustments_amount_ck", sql`${t.amountMinorUnits} > 0`),
]);

export const financeHandoffs = pgTable("finance_handoffs", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => orgs.id, { onDelete: "restrict" }),
  destinationReference: text("destination_reference").notNull(),
  sourceEventIds: jsonb("source_event_ids").notNull(),
  approvedByIdentityId: uuid("approved_by_identity_id").notNull().references(() => identities.id, { onDelete: "restrict" }),
  approvedAt: timestamp("approved_at", { withTimezone: true }).notNull(),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("finance_handoffs_organization_id_uq").on(t.organizationId, t.id),
  check("finance_handoffs_source_ck", sql`jsonb_typeof(${t.sourceEventIds}) = 'array'`),
]);
