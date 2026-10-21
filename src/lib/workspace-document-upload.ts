import { z } from "zod";

export const workspaceDocumentUploadLimit = 25_000_000;
export const workspaceDocumentQuarantineBucket = "mmhr-document-quarantine";
const uuid = z.uuid().transform((value) => value.toLowerCase());
const formats = {
  pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
} as const;
export const workspaceDocumentFileManifestSchema = z.strictObject({
  fileName: z.string().trim().min(1).max(255).refine((name) => new TextEncoder().encode(name).length <= 255
    && !/[\\/\x00-\x1f\x7f]/.test(name)),
  declaredMimeType: z.enum(["application/pdf", "image/png", "image/jpeg", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]),
  byteSize: z.number().int().min(1).max(workspaceDocumentUploadLimit),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
}).refine((value) => formats[value.fileName.toLowerCase().split(".").pop() as keyof typeof formats] === value.declaredMimeType,
  "Use a PDF, Word, PNG, or JPEG file with the correct file type.");
export const workspaceDocumentUploadPreparationSchema = workspaceDocumentFileManifestSchema.safeExtend({
  organizationId: uuid, documentId: uuid, versionId: uuid,
  expectedVersion: z.number().int().min(0).max(99_999), correlationId: uuid, idempotencyKey: uuid,
});
export const workspaceDocumentUploadCompletionSchema = z.strictObject({
  organizationId: uuid, documentId: uuid, versionId: uuid, expectedRevision: z.literal(1), correlationId: uuid, idempotencyKey: uuid,
});
export type WorkspaceDocumentUploadPreparation = z.output<typeof workspaceDocumentUploadPreparationSchema>;

/** Browser values reserve quarantine only. The worker verifies the original bytes independently. */
export async function createWorkspaceDocumentFileManifest(file: File) {
  if (file.size < 1 || file.size > workspaceDocumentUploadLimit) throw new Error("Choose a file from 1 byte to 25 MB.");
  const extension = file.name.trim().toLowerCase().split(".").pop() ?? "";
  if (!Object.hasOwn(formats, extension)) throw new Error("Choose a PDF, Word, PNG, or JPEG file.");
  // File.type can be empty or depend on OS configuration. This label reserves
  // quarantine only; the worker verifies the original bytes independently.
  const declaredMimeType = formats[extension as keyof typeof formats];
  const bytes = await file.arrayBuffer();
  if (bytes.byteLength !== file.size) throw new Error("The selected file could not be read.");
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  const parsed = workspaceDocumentFileManifestSchema.safeParse({ fileName: file.name, declaredMimeType,
    byteSize: bytes.byteLength, sha256: [...hash].map((value) => value.toString(16).padStart(2, "0")).join("") });
  if (!parsed.success) throw new Error("Choose a PDF, Word, PNG, or JPEG file with a valid name and file type.");
  return parsed.data;
}
