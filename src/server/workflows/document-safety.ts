import { z } from "zod";

export const documentStates = [
  "received",
  "quarantined",
  "scanning",
  "ready",
  "processing",
  "needs_review",
  "approved",
  "rejected",
  "failed",
  "superseded",
] as const;

export type DocumentState = (typeof documentStates)[number];

export const MAX_DOCUMENT_SIZE_BYTES = 25_000_000;
export const MAX_SIGNED_URL_LIFETIME_SECONDS = 15 * 60;

const supportedFormats = {
  pdf: { mimeType: "application/pdf", magic: ["255044462d"] },
  png: { mimeType: "image/png", magic: ["89504e470d0a1a0a"] },
  jpg: { mimeType: "image/jpeg", magic: ["ffd8ff"] },
  jpeg: { mimeType: "image/jpeg", magic: ["ffd8ff"] },
  docx: { mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", magic: ["504b0304"] },
} as const;

const fileNameSchema = z.string().trim().min(1).max(255).refine(
  (value) => !/[\\/]/.test(value) && value !== "." && value !== ".." && !value.includes("\0"),
  "A document name must be a file name without a path",
);

const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/i, "A SHA-256 digest is required").transform((value) => value.toLowerCase());

const hexBytesSchema = z.string().regex(/^(?:[0-9a-f]{2})+$/i, "Magic bytes must be hexadecimal").transform((value) => value.toLowerCase());

export const documentSafetyInputSchema = z.strictObject({
  fileName: fileNameSchema,
  declaredMimeType: z.string().trim().toLowerCase().min(1).max(255),
  sizeBytes: z.number().int().positive(),
  sha256: sha256Schema,
  magicBytes: hexBytesSchema,
});

export type DocumentSafetyInput = z.input<typeof documentSafetyInputSchema>;
export type ParsedDocumentSafetyInput = z.output<typeof documentSafetyInputSchema>;

export type DocumentValidationErrorCode =
  | "invalid_metadata"
  | "unsupported_extension"
  | "mime_mismatch"
  | "size_exceeded"
  | "magic_bytes_mismatch";

export type DocumentValidationResult =
  | { ok: false; code: DocumentValidationErrorCode }
  | {
      ok: true;
      state: "quarantined";
      fileName: string;
      extension: keyof typeof supportedFormats;
      declaredMimeType: string;
      sizeBytes: number;
      sha256: string;
    };

function extensionFor(fileName: string): keyof typeof supportedFormats | null {
  const extension = fileName.toLowerCase().split(".").pop();
  return extension && extension in supportedFormats
    ? (extension as keyof typeof supportedFormats)
    : null;
}

/**
 * Validates metadata before a file can leave private quarantine storage.
 * This function does not scan content and does not approve downstream use.
 */
export function validateDocumentSafety(input: DocumentSafetyInput): DocumentValidationResult {
  const parsed = documentSafetyInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_metadata" };

  const value = parsed.data;
  const extension = extensionFor(value.fileName);
  if (!extension) return { ok: false, code: "unsupported_extension" };

  const format = supportedFormats[extension];
  if (value.declaredMimeType !== format.mimeType) return { ok: false, code: "mime_mismatch" };
  if (value.sizeBytes > MAX_DOCUMENT_SIZE_BYTES) return { ok: false, code: "size_exceeded" };
  if (!format.magic.some((prefix) => value.magicBytes.startsWith(prefix))) {
    return { ok: false, code: "magic_bytes_mismatch" };
  }

  return {
    ok: true,
    state: "quarantined",
    fileName: value.fileName,
    extension,
    declaredMimeType: value.declaredMimeType,
    sizeBytes: value.sizeBytes,
    sha256: value.sha256,
  };
}

const transitions: Readonly<Record<DocumentState, readonly DocumentState[]>> = {
  received: ["quarantined", "failed"],
  quarantined: ["scanning", "rejected", "failed"],
  scanning: ["ready", "rejected", "failed"],
  ready: ["processing", "superseded"],
  processing: ["approved", "needs_review", "rejected", "failed"],
  needs_review: ["approved", "rejected", "failed"],
  approved: ["superseded"],
  rejected: [],
  failed: [],
  superseded: [],
};

export function canTransitionDocument(from: DocumentState, to: DocumentState): boolean {
  return transitions[from]?.includes(to) ?? false;
}

export function isAllowedSignedUrlLifetime(seconds: number): boolean {
  return Number.isInteger(seconds) && seconds > 0 && seconds <= MAX_SIGNED_URL_LIFETIME_SECONDS;
}
