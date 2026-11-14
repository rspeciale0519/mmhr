import { randomUUID } from "node:crypto";
import { expect, test } from "vitest";
import { financeDocumentSourceSchema, financeDocumentUploadPreparationSchema } from "./finance-document-upload";
import { financeDocumentAccessSchema, financeDocumentReviewSchema } from "./finance-document-review";
const source = { sourceClass: "agreement", vendorOrganizationId: randomUUID() };
const input = { organizationId: randomUUID(), documentId: randomUUID(), versionId: randomUUID(), expectedVersion: 0,
  fileName: "synthetic.pdf", declaredMimeType: "application/pdf", byteSize: 20, sha256: "a".repeat(64), source,
  correlationId: randomUUID(), idempotencyKey: randomUUID() };
test("accepts explicit source proposals without treating them as verified authority", () => {
  expect(financeDocumentUploadPreparationSchema.parse(input).source).toEqual(source);
  expect(financeDocumentSourceSchema.parse({ sourceClass: "signed_contract", vendorOrganizationId: randomUUID(),
    contractId: randomUUID(), handoffId: randomUUID(), dealId: randomUUID() }).sourceClass).toBe("signed_contract");
});
test.each(["signedAt", "actorIdentityId", "scanEvidence", "approvedAt", "contractValueMinorUnits", "commissionAmountMinorUnits"])(
  "denies caller-supplied %s", field => {
    expect(financeDocumentUploadPreparationSchema.safeParse({ ...input, [field]: "untrusted" }).success).toBe(false);
  });
test.each([{ ...source, contractId: randomUUID() }, { sourceClass: "signed_contract", vendorOrganizationId: randomUUID() },
  { sourceClass: "workspace", vendorOrganizationId: randomUUID() }, { ...source, vendorOrganizationId: "bad" }])(
  "denies missing, mixed and ordinary-workspace source proposals", invalid => {
    expect(financeDocumentUploadPreparationSchema.safeParse({ ...input, source: invalid }).success).toBe(false);
  });
test.each([{ sha256: "b".repeat(63) }, { byteSize: 0 }, { byteSize: 25_000_001 }, { expectedVersion: 100_000 },
  { fileName: "../synthetic.pdf" }, { fileName: "synthetic.exe" }, { declaredMimeType: "image/png" }])(
  "denies unsafe or inconsistent manifests", change => {
    expect(financeDocumentUploadPreparationSchema.safeParse({ ...input, ...change }).success).toBe(false);
  });
test("keeps finance access purposes separate and requires explicit content review", () => {
  const scope = { organizationId: input.organizationId, documentId: input.documentId, versionId: input.versionId,
    correlationId: input.correlationId, idempotencyKey: input.idempotencyKey, expectedRevision: 5 };
  expect(financeDocumentAccessSchema.safeParse({ ...scope, purpose: "approved" }).success).toBe(false);
  expect(financeDocumentAccessSchema.parse({ ...scope, purpose: "finance_original" }).purpose).toBe("finance_original");
  const review = { ...scope, action: "approve", reason: "Synthetic independent content decision", reviewReference: "synthetic:decision",
    contentsReviewed: true, reviewedAccessId: randomUUID() };
  expect(financeDocumentReviewSchema.safeParse(review).success).toBe(true);
  expect(financeDocumentReviewSchema.safeParse({ ...review, contentsReviewed: false }).success).toBe(false);
  expect(financeDocumentReviewSchema.safeParse({ ...review, reviewedAccessId: undefined }).success).toBe(false);
});
