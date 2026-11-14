import { z } from "zod";
import { financeSourceReferenceSchema } from "@/lib/managed-finance-workflow";
import { workspaceDocumentFileManifestSchema } from "@/lib/workspace-document-upload";
import { collectionHashSchema, collectionUuidSchema } from "./managed-collection-ledger";

// Commercial agreement/signed-contract schemas remain unchanged.
export const collectionReceiptSourceSchema = z.strictObject({
  sourceClass: z.literal("collection_receipt"), vendorOrganizationId: collectionUuidSchema,
  customerOrganizationId: collectionUuidSchema, commissionEventId: collectionUuidSchema,
  invoiceId: collectionUuidSchema, preparationId: collectionUuidSchema, calculationId: collectionUuidSchema,
  issuedSourceDigest: collectionHashSchema,
}).refine(value => value.customerOrganizationId !== value.vendorOrganizationId,
  "The receipt customer and vendor must be different organizations");

export const collectionReceiptOriginalReferenceSchema = financeSourceReferenceSchema.safeExtend({
  sourceBinding: collectionReceiptSourceSchema,
}).refine(value => value.organizationId !== value.sourceBinding.customerOrganizationId
  && value.organizationId !== value.sourceBinding.vendorOrganizationId,
  "The receipt belongs to a separately derived internal finance workspace");

export const collectionReceiptUploadPreparationSchema = workspaceDocumentFileManifestSchema.safeExtend({
  organizationId: collectionUuidSchema, documentId: collectionUuidSchema, versionId: collectionUuidSchema,
  expectedVersion: z.number().int().min(0).max(99_999), source: collectionReceiptSourceSchema,
  correlationId: collectionUuidSchema, idempotencyKey: collectionUuidSchema,
}).refine(value => value.organizationId !== value.source.customerOrganizationId
  && value.organizationId !== value.source.vendorOrganizationId,
  "The receipt upload requires the exact internal finance workspace");

export type CollectionReceiptSource = z.output<typeof collectionReceiptSourceSchema>;
export type CollectionReceiptOriginalReference = z.output<typeof collectionReceiptOriginalReferenceSchema>;
