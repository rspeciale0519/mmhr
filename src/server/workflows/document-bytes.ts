import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";

import { isBoundedDocxContainer } from "./docx-container";
import { MAX_DOCUMENT_SIZE_BYTES, validateDocumentSafety, type DocumentValidationErrorCode } from "./document-safety";

const uploadMetadataSchema = z.strictObject({
  fileName: z.string().trim().min(1).max(255).refine((value) =>
    Buffer.byteLength(value, "utf8") <= 255 && !/[\x00-\x1f\x7f]/.test(value)),
  declaredMimeType: z.string().trim().toLowerCase().min(1).max(255),
});

export type InspectedDocument = Readonly<{
  fileName: string;
  contentType: string;
  byteSize: number;
  sha256: string;
  state: "quarantined";
  copyBytes: () => Uint8Array;
}>;
export type DocumentByteInspection =
  | { ok: false; code: DocumentValidationErrorCode | "invalid_container" }
  | { ok: true; document: InspectedDocument };

/** Derives size and hash from a private snapshot, never from client assertions. */
export function inspectDocumentBytes(metadata: unknown, bytes: Uint8Array): DocumentByteInspection {
  const parsed = uploadMetadataSchema.safeParse(metadata);
  if (!parsed.success || !(bytes instanceof Uint8Array) || bytes.byteLength === 0) {
    return { ok: false, code: "invalid_metadata" };
  }
  if (bytes.byteLength > MAX_DOCUMENT_SIZE_BYTES) return { ok: false, code: "size_exceeded" };
  const snapshot = Buffer.from(bytes);
  const sha256 = createHash("sha256").update(snapshot).digest("hex");
  const validated = validateDocumentSafety({ ...parsed.data, sizeBytes: snapshot.byteLength,
    sha256, magicBytes: snapshot.subarray(0, 16).toString("hex") });
  if (!validated.ok) return validated;
  if (validated.extension === "docx" && !isBoundedDocxContainer(snapshot)) {
    return { ok: false, code: "invalid_container" };
  }
  return { ok: true, document: Object.freeze({
    fileName: validated.fileName,
    contentType: validated.declaredMimeType,
    byteSize: snapshot.byteLength,
    sha256,
    state: "quarantined" as const,
    copyBytes: () => Uint8Array.from(snapshot),
  }) };
}
