import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { DOCUMENT_PROCESSING_PROFILE } from "../workflows/document-parser-wire-contract";
import { boundedPlainText, DocumentParserFailure } from "./parser-failure";

/** Called only inside the isolated parser runtime. No URL/path or password
 * enters PDF.js. Sequential traversal bounds concurrent page allocation. */
export async function parsePrivatePdf(bytes: Uint8Array): Promise<{ text: string; pageCount: number }> {
  const original = Buffer.from(bytes);
  const tail = original.subarray(Math.max(0, original.length - 1_024)).toString("latin1");
  const end = /startxref\s+(\d+)\s+%%EOF\s*$/.exec(tail);
  const offset = end ? Number(end[1]) : -1;
  if (!/^%PDF-[12]\.\d/.test(original.subarray(0, 12).toString("latin1")) || !end
    || !Number.isSafeInteger(offset) || offset < 1 || offset >= original.length
    || !/^(?:xref\b|\d+\s+\d+\s+obj\b)/.test(original.subarray(offset, offset + 64).toString("latin1"))) throw new DocumentParserFailure("malformed_document");
  const loading = getDocument({ data: Uint8Array.from(bytes), verbosity: 0,
    useWorkerFetch: false, useWasm: false, useSystemFonts: false, disableFontFace: true,
    enableXfa: false, stopAtErrors: true, isOffscreenCanvasSupported: false, isImageDecoderSupported: false,
    maxImageSize: DOCUMENT_PROCESSING_PROFILE.maxImagePixels, disableRange: true, disableStream: true, disableAutoFetch: true });
  try {
    const document = await loading.promise;
    if (!Number.isInteger(document.numPages) || document.numPages < 1) throw new DocumentParserFailure("malformed_document");
    if (document.numPages > DOCUMENT_PROCESSING_PROFILE.maxPdfPages) throw new DocumentParserFailure("page_limit");
    const metadata = await document.getMetadata();
    const info: unknown = metadata.info;
    if (!info || typeof info !== "object") throw new DocumentParserFailure("malformed_document");
    if ("EncryptFilterName" in info && info.EncryptFilterName !== null) throw new DocumentParserFailure("encrypted_document");
    if (document.isPureXfa || ("IsXFAPresent" in info && info.IsXFAPresent === true)) throw new DocumentParserFailure("active_content");
    if (await document.hasJSActions() || (await document.getJSActions()) !== null
      || !benignOpenDestination(await document.getOpenAction()) || (await document.getAttachments()) !== null) throw new DocumentParserFailure("active_content");
    const pieces: string[] = [];
    let characters = 0, utf8Bytes = 0;
    const append = (text: string) => {
      const safe = boundedPlainText(text);
      characters += safe.length; utf8Bytes += Buffer.byteLength(safe, "utf8");
      if (characters > DOCUMENT_PROCESSING_PROFILE.maxTextCharacters || utf8Bytes > DOCUMENT_PROCESSING_PROFILE.maxTextUtf8Bytes) throw new DocumentParserFailure("text_limit");
      pieces.push(safe);
    };
    for (let index = 1; index <= document.numPages; index++) {
      const page = await document.getPage(index);
      try {
        if ((await page.getJSActions()) !== null) throw new DocumentParserFailure("active_content");
        // Streaming permits the text bound to stop a page before its entire
        // text array is allocated. The OS bound still protects parser internals.
        const reader = page.streamTextContent({ includeMarkedContent: false, disableNormalization: false }).getReader();
        try {
          while (true) {
            const chunk = await reader.read();
            if (chunk.done) break;
            const content: unknown = chunk.value;
            if (!content || typeof content !== "object" || !("items" in content) || !Array.isArray(content.items)) throw new DocumentParserFailure("malformed_document");
            for (const rawItem of content.items) {
              const item: unknown = rawItem;
              if (!item || typeof item !== "object" || !("str" in item) || typeof item.str !== "string"
                || !("hasEOL" in item) || typeof item.hasEOL !== "boolean") throw new DocumentParserFailure("malformed_document");
              append(item.str); append(item.hasEOL ? "\n" : " ");
            }
          }
        } finally { await reader.cancel(); reader.releaseLock(); }
        append("\n");
      } finally { page.cleanup(); }
    }
    return { text: boundedPlainText(pieces.join("")), pageCount: document.numPages };
  } catch (error) {
    if (error instanceof DocumentParserFailure) throw error;
    if (error && typeof error === "object" && "name" in error && error.name === "PasswordException") throw new DocumentParserFailure("encrypted_document");
    throw new DocumentParserFailure("malformed_document");
  } finally { await loading.destroy(); }
}

// PDF.js exposes reported open actions as a Map. Only an inert explicit page
// destination is accepted. The parser never resolves or performs navigation.
function benignOpenDestination(value: unknown): boolean {
  if (value === null) return true;
  if (!(value instanceof Map) || value.size !== 1 || !value.has("dest")) return false;
  const destination: unknown = value.get("dest");
  if (!Array.isArray(destination) || destination.length < 2 || destination.length > 6) return false;
  return destination.every((item: unknown, index) => {
    if (index === 0) return typeof item === "number" ? Number.isInteger(item) && item >= 0
      : !!item && typeof item === "object" && Object.keys(item).length === 2 && "num" in item && "gen" in item
        && typeof item.num === "number" && Number.isInteger(item.num) && item.num > 0
        && typeof item.gen === "number" && Number.isInteger(item.gen) && item.gen >= 0;
    if (index === 1) return !!item && typeof item === "object" && Object.keys(item).length === 1 && "name" in item
      && typeof item.name === "string" && ["XYZ", "Fit", "FitH", "FitV", "FitR", "FitB", "FitBH", "FitBV"].includes(item.name);
    return item === null || typeof item === "number" && Number.isFinite(item);
  });
}
