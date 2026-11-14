import { z } from "zod";

const uuid = z.uuid().transform((value) => value.toLowerCase());
const instant = z.iso.datetime({ offset: true });
export const workspaceDocumentSearchQuerySchema = z.string().trim().min(1).max(120).refine((value) => !/[\x00-\x1f\x7f]/.test(value));
export const workspaceDocumentListSchema = z.strictObject({ organizationId: uuid, correlationId: uuid, afterId: uuid.optional(),
  searchQuery: workspaceDocumentSearchQuerySchema.optional() });
export const workspaceDocumentVersionsSchema = z.strictObject({ organizationId: uuid, correlationId: uuid, documentId: uuid,
  afterVersion: z.number().int().min(0).max(100_000).default(0) });
export const workspaceDocumentHistorySchema = z.strictObject({ organizationId: uuid, correlationId: uuid, documentId: uuid, versionId: uuid,
  afterRevision: z.number().int().min(0).max(2_147_483_646).default(0) });

export const workspaceDocumentRowSchema = z.strictObject({
  documentId: uuid, versionId: uuid, version: z.number().int().min(1).max(100_000), isCurrent: z.boolean(),
  fileName: z.string().min(1).max(255), contentType: z.enum(["application/pdf", "image/png", "image/jpeg",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]), byteSize: z.number().int().min(1).max(25_000_000),
  state: z.enum(["received", "quarantined", "scanning", "ready", "processing", "needs_review", "approved", "rejected", "failed", "superseded"]),
  revision: z.number().int().positive(), failureCode: z.enum(["unsafe_document", "document_integrity", "invalid_document", "processing_failed"]).nullable(),
  createdAt: instant, updatedAt: instant,
}).superRefine((row, ctx) => {
  if (Date.parse(row.updatedAt) < Date.parse(row.createdAt)
    || (row.failureCode !== null && !["rejected", "failed"].includes(row.state))) {
    ctx.addIssue({ code: "custom", message: "Invalid document status" });
  }
});
const page = { organizationId: uuid, correlationId: uuid, canUpload: z.boolean(), items: z.array(workspaceDocumentRowSchema).max(25) };
export const workspaceDocumentPageSchema = z.strictObject({ ...page, nextCursor: uuid.nullable() });
export const workspaceDocumentVersionPageSchema = z.strictObject({ ...page, documentId: uuid,
  currentVersion: z.number().int().min(1).max(100_000), nextVersion: z.number().int().positive().nullable() });
export const workspaceDocumentHistoryPageSchema = z.strictObject({ organizationId: uuid, correlationId: uuid, documentId: uuid, versionId: uuid,
  items: z.array(z.strictObject({ revision: z.number().int().positive(),
    action: z.enum(["reserve", "uploaded", "scan_claimed", "scan_clean", "scan_rejected", "scan_failed", "review_started", "approve", "reject", "retry", "supersede"]),
    occurredAt: instant })).max(25), nextRevision: z.number().int().positive().nullable() });
export type WorkspaceDocumentRow = z.output<typeof workspaceDocumentRowSchema>;
export type WorkspaceDocumentSearchState = { status: "idle" } | { status: "error" }
  | { status: "success"; query: string; page: z.output<typeof workspaceDocumentPageSchema> };
