import { z } from "zod";
import { securityReasonSchema } from "@/lib/security-reason";
import { proposalQuoteCurrencyCodes } from "@/lib/proposal-quote";
import { compareManagedFinanceInstants, financeSourceReferenceSchema, managedFinanceInstantSchema } from "@/lib/managed-finance-workflow";
import { workspaceDocumentRowSchema } from "@/lib/workspace-documents";

const uuid = z.uuid().transform(value => value.toLowerCase());
const expectedRevision = z.number().int().min(1).max(2_147_483_646);
const revision = z.number().int().min(1).max(2_147_483_647);
const expectedCounter = z.number().int().min(0).max(2_147_483_646);
const counter = z.number().int().min(0).max(2_147_483_647);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const text = z.string().trim().min(1).max(500).refine(value => !/[\x00-\x1f\x7f]/.test(value));
const number = text.refine(value => value.length <= 100);
const metadata = { organizationId: uuid, correlationId: uuid, idempotencyKey: uuid, reason: securityReasonSchema };
const target = { invoiceId: uuid, preparationId: uuid, commissionEventId: uuid };
const sourceKey = (value: z.output<typeof financeSourceReferenceSchema>) => `${value.organizationId}/${value.documentId}/${value.versionId}`;
export const managedInvoiceSourcesSchema = z.array(financeSourceReferenceSchema).min(2).max(10)
  .refine(values => new Set(values.map(sourceKey)).size === values.length, "Invoice sources must be distinct");
const prepare = z.strictObject({ ...metadata, ...target, action: z.literal("prepare_invoice"),
  calculationId: uuid, expectedEventRevision: expectedRevision, expectedInvoiceRevision: expectedCounter,
  expectedSourceDigest: hash, ownerIdentityId: uuid, invoiceNumber: number,
  issueDate: managedFinanceInstantSchema, dueDate: managedFinanceInstantSchema, collectionTerms: text,
  supportingSources: managedInvoiceSourcesSchema,
}).refine(value => compareManagedFinanceInstants(value.dueDate, value.issueDate) >= 0,
  { path: ["dueDate"], message: "Due date cannot precede issue date" });
const reviewSource = financeSourceReferenceSchema.extend({ reviewedAccessId: uuid });
const decision = z.strictObject({ ...metadata, ...target, action: z.enum(["approve_invoice", "reject_invoice"]),
  expectedEventRevision: expectedRevision, expectedInvoiceRevision: expectedRevision, expectedPreparationRevision: z.literal(1),
  expectedSourceDigest: hash, contentsReviewed: z.literal(true), reviewReference: text,
  reviewedSources: z.array(reviewSource).min(2).max(10)
    .refine(values => new Set(values.map(sourceKey)).size === values.length, "Each original requires one review"),
});
const issue = z.strictObject({ ...metadata, ...target, action: z.literal("issue_invoice"),
  expectedEventRevision: expectedRevision, expectedInvoiceRevision: expectedRevision, expectedPreparationRevision: z.literal(2),
  expectedSourceDigest: hash,
});
export const managedInvoiceCommandSchema = z.union([prepare, decision, issue]);
export type ManagedInvoiceCommand = z.output<typeof managedInvoiceCommandSchema>;

export const managedInvoiceResultSchema = z.strictObject({ organizationId: uuid, correlationId: uuid,
  ...target, action: z.enum(["prepare_invoice", "approve_invoice", "reject_invoice", "issue_invoice"]),
  preparationRevision: z.union([z.literal(1), z.literal(2)]), invoiceRevision: revision,
  eventRevision: revision, status: z.enum(["draft", "ready", "issued"]), outcomeCode: z.enum(["recorded", "replayed"]),
});
export function verifyManagedInvoiceResult(value: unknown, request: unknown) {
  const input = managedInvoiceCommandSchema.parse(request), output = managedInvoiceResultSchema.parse(value);
  for (const key of ["organizationId", "correlationId", "invoiceId", "preparationId", "commissionEventId", "action"] as const) {
    if (input[key] !== output[key]) throw new Error("Invalid managed invoice response");
  }
  const expectedInvoice = input.expectedInvoiceRevision + (input.action === "reject_invoice" ? 0 : 1);
  const expectedEvent = input.expectedEventRevision + (input.action === "issue_invoice" ? 1 : 0);
  const expectedStatus = input.action === "approve_invoice" ? "ready" : input.action === "issue_invoice" ? "issued" : "draft";
  if (output.invoiceRevision !== expectedInvoice || output.eventRevision !== expectedEvent
    || output.preparationRevision !== (input.action === "prepare_invoice" ? 1 : 2) || output.status !== expectedStatus) {
    throw new Error("Invalid original managed invoice result");
  }
  return output;
}

export const managedInvoiceDetailRequestSchema = z.strictObject({ organizationId: uuid, correlationId: uuid,
  commissionEventId: uuid, invoiceId: uuid.optional(), afterPreparationId: uuid.optional() });
export const managedInvoiceOwnerRequestSchema = z.strictObject({ organizationId: uuid, correlationId: uuid,
  commissionEventId: uuid, afterId: uuid.optional() });
export const managedInvoiceSourceRequestSchema = z.strictObject({ organizationId: uuid, correlationId: uuid,
  commissionEventId: uuid, calculationId: uuid, supportingSources: managedInvoiceSourcesSchema });
export const managedInvoiceOwnerPageSchema = z.strictObject({ organizationId: uuid, correlationId: uuid,
  commissionEventId: uuid, owners: z.array(z.strictObject({ identityId: uuid, label: z.string().min(1).max(320) })).max(25),
  nextCursor: uuid.nullable() });
export function verifyManagedInvoiceOwners(value: unknown, request: unknown) {
  const input = managedInvoiceOwnerRequestSchema.parse(request), output = managedInvoiceOwnerPageSchema.parse(value);
  if (input.organizationId !== output.organizationId || input.correlationId !== output.correlationId
    || input.commissionEventId !== output.commissionEventId
    || output.owners.some((owner, index) => owner.identityId <= (index === 0 ? input.afterId ?? "" : output.owners[index - 1].identityId))
    || (output.nextCursor !== null && (output.owners.length !== 25 || output.nextCursor !== output.owners[24].identityId))) {
    throw new Error("Invalid managed invoice owner page");
  }
  return output;
}
export const managedInvoiceSourceResultSchema = z.strictObject({ organizationId: uuid, correlationId: uuid,
  commissionEventId: uuid, calculationId: uuid, eventRevision: revision, calculationRevision: revision,
  sourceDigest: hash, amountMinorUnits: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  currency: z.enum(proposalQuoteCurrencyCodes), supportingSources: managedInvoiceSourcesSchema });
export function verifyManagedInvoiceSource(value: unknown, request: unknown) {
  const input = managedInvoiceSourceRequestSchema.parse(request), output = managedInvoiceSourceResultSchema.parse(value);
  if (["organizationId", "correlationId", "commissionEventId", "calculationId"].some(key =>
    input[key as keyof typeof input] !== output[key as keyof typeof output])
    || JSON.stringify(input.supportingSources) !== JSON.stringify(output.supportingSources)) {
    throw new Error("Invalid managed invoice source observation");
  }
  return output;
}

const original = financeSourceReferenceSchema.extend({ fileName: z.string().min(1).max(255),
  currentDocumentVersion: revision, originalVersion: revision,
  document: workspaceDocumentRowSchema.safeExtend({ state: z.enum(["approved", "superseded"]), failureCode: z.null() }),
}).refine(value => value.document.documentId === value.documentId && value.document.versionId === value.versionId
  && value.document.version === value.originalVersion && value.document.fileName === value.fileName
  && value.currentDocumentVersion >= value.originalVersion
  && value.document.isCurrent === (value.currentDocumentVersion === value.originalVersion), "Invalid invoice original metadata");
const invoice = z.strictObject({ invoiceId: uuid, commissionEventId: uuid, vendorOrganizationId: uuid,
  invoiceRevision: revision, status: z.enum(["draft", "ready", "issued"]), currentPreparationId: uuid,
  invoiceNumber: number, issueDate: managedFinanceInstantSchema, dueDate: managedFinanceInstantSchema,
  amountMinorUnits: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), currency: z.enum(proposalQuoteCurrencyCodes) });
const preparation = z.strictObject({ preparationId: uuid, revision: z.union([z.literal(1), z.literal(2)]), state: z.enum(["pending", "approved", "rejected"]),
  ownerIdentityId: uuid, ownerLabel: text, preparedByIdentityId: uuid, preparedByLabel: text, preparedAt: managedFinanceInstantSchema,
  decidedByIdentityId: uuid.nullable(), decidedByLabel: text.nullable(), decidedAt: managedFinanceInstantSchema.nullable(), collectionTerms: text,
  sourceDigest: hash, supportingOriginals: z.array(original).min(2).max(10), sourceCurrent: z.boolean().nullable(),
  ownerCurrent: z.boolean(), reviewerCurrent: z.boolean(), canApprove: z.boolean(), canReject: z.boolean(), canIssue: z.boolean(),
});
export const managedInvoiceDetailSchema = z.strictObject({ organizationId: uuid, correlationId: uuid,
  commissionEventId: uuid, currentActorIdentityId: uuid, eventRevision: revision, eventState: z.enum(["pending_review", "approved", "invoiced", "partially_paid", "paid", "disputed", "adjusted", "voided", "written_off"]),
  calculationId: uuid.nullable(), calculationRevision: counter, mandatorySources: z.array(financeSourceReferenceSchema).max(2),
  invoice: invoice.nullable(), currentPreparation: preparation.nullable(),
  preparations: z.array(z.strictObject({ preparationId: uuid, revision: z.union([z.literal(1), z.literal(2)]), state: z.enum(["pending", "approved", "rejected"]),
    preparedAt: managedFinanceInstantSchema, preparedByLabel: text, invoiceRevisionAfterPrepare: revision })).max(25),
  nextPreparationCursor: uuid.nullable() });
export function verifyManagedInvoiceDetail(value: unknown, request: unknown, expectedActorIdentityId: string) {
  const input = managedInvoiceDetailRequestSchema.parse(request), output = managedInvoiceDetailSchema.parse(value);
  if (input.organizationId !== output.organizationId || input.correlationId !== output.correlationId
    || input.commissionEventId !== output.commissionEventId || (input.invoiceId !== undefined && output.invoice?.invoiceId !== input.invoiceId)
    || output.currentActorIdentityId !== uuid.parse(expectedActorIdentityId)
    || (output.calculationId === null ? output.calculationRevision !== 0 || output.mandatorySources.length !== 0
      : output.calculationRevision === 0 || output.mandatorySources.length !== 2)
    || new Set(output.mandatorySources.map(sourceKey)).size !== output.mandatorySources.length
    || output.preparations.some(row => row.revision !== (row.state === "pending" ? 1 : 2))
    || (output.invoice === null) !== (output.currentPreparation === null)
    || output.invoice !== null && (output.calculationId === null || output.invoice.commissionEventId !== input.commissionEventId
      || output.currentPreparation?.preparationId !== output.invoice.currentPreparationId)
    || output.preparations.some((row, index) => row.preparationId <= (index === 0 ? input.afterPreparationId ?? "" : output.preparations[index - 1].preparationId))
    || output.nextPreparationCursor !== null && (output.preparations.length !== 25
      || output.nextPreparationCursor !== output.preparations[24].preparationId)) throw new Error("Invalid managed invoice detail");
  const p = output.currentPreparation;
  if (p !== null && output.mandatorySources.some(source => !p.supportingOriginals.some(original =>
    sourceKey(source) === sourceKey(original) && source.sha256 === original.sha256))) {
    throw new Error("Invalid managed invoice mandatory originals");
  }
  if (p !== null && (p.state === "pending" ? p.revision !== 1 || p.decidedByIdentityId !== null || p.decidedAt !== null
    : p.revision !== 2 || p.decidedByIdentityId === null || p.decidedByIdentityId === p.preparedByIdentityId || p.decidedAt === null)) {
    throw new Error("Invalid managed invoice independent review");
  }
  if (p !== null && (p.decidedAt !== null && compareManagedFinanceInstants(p.decidedAt, p.preparedAt) < 0
    || new Set(p.supportingOriginals.map(sourceKey)).size !== p.supportingOriginals.length
    || output.invoice !== null && compareManagedFinanceInstants(output.invoice.dueDate, output.invoice.issueDate) < 0
    || p.state === "approved" && output.invoice?.status === "draft"
    || p.state !== "approved" && output.invoice?.status !== "draft")) throw new Error("Invalid managed invoice readiness state");
  if (p !== null && ((p.canApprove || p.canReject || p.canIssue) && output.eventState !== "approved"
    || p.canApprove && (!p.canReject || p.sourceCurrent !== true || !p.ownerCurrent)
    || p.canReject && (p.state !== "pending" || p.preparedByIdentityId === output.currentActorIdentityId || output.invoice?.status !== "draft")
    || p.canIssue && (p.state !== "approved" || output.invoice?.status !== "ready" || p.sourceCurrent !== true || !p.ownerCurrent || !p.reviewerCurrent))) {
    throw new Error("Invalid managed invoice decision availability");
  }
  return output;
}
