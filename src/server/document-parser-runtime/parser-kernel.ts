import { createHash } from "node:crypto";
import { documentParserRequestSchema, documentParserResultSchema, parserResultMatchesRequest,
  type DocumentParserResult } from "../workflows/document-parser-wire-contract";
import { parsePrivatePdf } from "./pdf-parser";
import { parsePrivateDocx } from "./docx-parser";
import { validatePrivateImage } from "./image-parser";
import { DocumentParserFailure } from "./parser-failure";

/** Internal isolated-runtime entry. Business authority and current lease checks
 * remain in the supervisor/worker. This function cannot fetch documents. */
export async function parsePrivateDocument(rawRequest: unknown, input: Uint8Array): Promise<DocumentParserResult> {
  const request = documentParserRequestSchema.parse(rawRequest);
  if (!(input instanceof Uint8Array) || input.byteLength !== request.byteSize
    || createHash("sha256").update(input).digest("hex") !== request.sha256) throw new Error("Invalid parser input");
  const binding = { protocolVersion: 1 as const, requestId: request.requestId,
    profileId: request.profileId, inputSha256: request.sha256 };
  let rawResult: unknown;
  try {
    switch (request.contentType) {
      case "application/pdf": rawResult = { ...binding, outcome: "text", parser: { name: "pdfjs-dist", version: "6.3.289" }, ...await parsePrivatePdf(input) }; break;
      case "application/vnd.openxmlformats-officedocument.wordprocessingml.document": rawResult = { ...binding, outcome: "text", parser: { name: "mammoth", version: "1.13.0" }, ...await parsePrivateDocx(input) }; break;
      case "image/png": case "image/jpeg": rawResult = { ...binding, outcome: "image_validated", parser: { name: "sharp", version: "0.35.5" }, ...await validatePrivateImage(input, request.contentType) }; break;
    }
  } catch (error) {
    // Exception messages, paths, parser warnings, and input text stay private.
    rawResult = { ...binding, outcome: "failed", code: error instanceof DocumentParserFailure ? error.code : "malformed_document" };
  }
  const result = documentParserResultSchema.parse(rawResult);
  if (!parserResultMatchesRequest(result, request)) throw new Error("Invalid parser binding");
  return result;
}
