import type { parserFailureCodes } from "../workflows/document-parser-wire-contract";
import { DOCUMENT_PROCESSING_PROFILE } from "../workflows/document-parser-wire-contract";
export class DocumentParserFailure extends Error {
  constructor(readonly code: (typeof parserFailureCodes)[number]) { super(code); this.name = "DocumentParserFailure"; }
}
export function boundedPlainText(value: string): string {
  if (/[\uD800-\uDFFF]/u.test(value)) throw new DocumentParserFailure("malformed_document");
  const normalized = value.replace(/\r\n?/g, "\n");
  if (normalized.length > DOCUMENT_PROCESSING_PROFILE.maxTextCharacters
    || Buffer.byteLength(normalized, "utf8") > DOCUMENT_PROCESSING_PROFILE.maxTextUtf8Bytes) throw new DocumentParserFailure("text_limit");
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(normalized)) throw new DocumentParserFailure("malformed_document");
  return normalized;
}

