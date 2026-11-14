import { z } from "zod";

// Draft only. These values describe the proposed first processing profile.
// They are fixed server configuration, never document or browser input.
export const DOCUMENT_PROCESSING_PROFILE = Object.freeze({
  id: "private-document-processing-v1" as const,
  maxInputBytes: 25_000_000,
  maxPdfPages: 500,
  maxDocxExpandedBytes: 50_000_000,
  maxArchiveEntries: 1_000,
  maxInflationRatio: 100,
  maxTextCharacters: 1_000_000,
  maxTextUtf8Bytes: 2_000_000,
  maxImagePixels: 20_000_000,
  maxDecodedImageBytes: 80_000_000,
  maxOutputBytes: 6_100_000,
  maxMemoryBytes: 536_870_912,
  maxWallTimeMs: 30_000,
  maxProcesses: 8,
});

const uuid = z.uuid().transform(value => value.toLowerCase());
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
export const processingContentTypeSchema = z.enum([
  "application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "image/png", "image/jpeg",
]);

// Child transport contains no organization, session, Storage path, URL, lease,
// credentials, user filenames, or business authority.
export const documentParserRequestSchema = z.strictObject({
  protocolVersion: z.literal(1), requestId: uuid,
  profileId: z.literal(DOCUMENT_PROCESSING_PROFILE.id),
  contentType: processingContentTypeSchema,
  byteSize: z.number().int().min(1).max(DOCUMENT_PROCESSING_PROFILE.maxInputBytes), sha256,
});
export type DocumentParserRequest = Readonly<z.output<typeof documentParserRequestSchema>>;

const plainText = z.string().max(DOCUMENT_PROCESSING_PROFILE.maxTextCharacters).refine(value =>
  Buffer.byteLength(value, "utf8") <= DOCUMENT_PROCESSING_PROFILE.maxTextUtf8Bytes
  && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value)
  && !/[\uD800-\uDFFF]/u.test(value)
  && !value.includes("\r"), "Invalid bounded plain text");
const resultBinding = { protocolVersion: z.literal(1), requestId: uuid,
  profileId: z.literal(DOCUMENT_PROCESSING_PROFILE.id), inputSha256: sha256 };

export const parserFailureCodes = [
  "malformed_document", "encrypted_document", "unsupported_document", "unsafe_relationship", "active_content",
  "page_limit", "text_limit", "pixel_limit", "expanded_size_limit", "decode_failed",
] as const;
export const documentParserResultSchema = z.discriminatedUnion("outcome", [
  z.strictObject({ ...resultBinding, outcome: z.literal("text"),
    parser: z.discriminatedUnion("name", [
      z.strictObject({ name: z.literal("pdfjs-dist"), version: z.literal("6.3.289") }),
      z.strictObject({ name: z.literal("mammoth"), version: z.literal("1.13.0") }),
    ]), text: plainText,
    pageCount: z.number().int().min(1).max(DOCUMENT_PROCESSING_PROFILE.maxPdfPages).nullable(),
  }),
  z.strictObject({ ...resultBinding, outcome: z.literal("image_validated"),
    parser: z.strictObject({ name: z.literal("sharp"), version: z.literal("0.35.5") }),
    format: z.enum(["png", "jpeg"]), width: z.number().int().min(1).max(DOCUMENT_PROCESSING_PROFILE.maxImagePixels),
    height: z.number().int().min(1).max(DOCUMENT_PROCESSING_PROFILE.maxImagePixels),
    channels: z.number().int().min(1).max(4),
    decodedByteSize: z.number().int().min(1).max(DOCUMENT_PROCESSING_PROFILE.maxDecodedImageBytes),
    ocrPerformed: z.literal(false),
  }),
  z.strictObject({ ...resultBinding, outcome: z.literal("failed"), code: z.enum(parserFailureCodes) }),
]).superRefine((value, context) => {
  if (value.outcome === "text" && (value.parser.name === "pdfjs-dist") !== (value.pageCount !== null)) {
    context.addIssue({ code: "custom", message: "Parser page count does not match format" });
  }
  if (value.outcome === "image_validated" && (value.width * value.height > DOCUMENT_PROCESSING_PROFILE.maxImagePixels
    || value.decodedByteSize !== value.width * value.height * value.channels)) {
    context.addIssue({ code: "custom", message: "Invalid full image decode result" });
  }
});
export type DocumentParserResult = Readonly<z.output<typeof documentParserResultSchema>>;
export type DocumentParserSuccess = Exclude<DocumentParserResult, { outcome: "failed" }>;

export const supervisorFailureCodes = [
  "invalid_input", "document_integrity", "isolation_unavailable", "parser_timeout", "memory_limit",
  "worker_crash", "output_limit", "invalid_result", "cleanup_unverified",
] as const;
export type DocumentParserSupervisorResult =
  | Readonly<{ outcome: "completed"; result: DocumentParserResult }>
  | Readonly<{ outcome: "failed"; code: (typeof supervisorFailureCodes)[number] }>;
export type DocumentProcessingCompletion = DocumentParserSupervisorResult
  | Readonly<{ outcome: "failed"; code: "storage_unavailable" }>;

export function parserResultMatchesRequest(result: DocumentParserResult, request: DocumentParserRequest): boolean {
  if (result.requestId !== request.requestId || result.inputSha256 !== request.sha256 || result.profileId !== request.profileId) return false;
  if (result.outcome === "failed") return true;
  if (result.outcome === "text") return request.contentType === (result.parser.name === "pdfjs-dist"
    ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  return request.contentType === (result.format === "png" ? "image/png" : "image/jpeg");
}


