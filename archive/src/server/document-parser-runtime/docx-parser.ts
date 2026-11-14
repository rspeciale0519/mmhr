import mammoth from "mammoth";
import { checkedDocxParts } from "./container-checks";
import { boundedPlainText, DocumentParserFailure } from "./parser-failure";

export async function parsePrivateDocx(bytes: Uint8Array): Promise<{ text: string; pageCount: null }> {
  checkedDocxParts(bytes);
  try {
    // Mammoth1.13 extractRawText accepts one argument only. Its actual reader
    // supplies no externalFileAccess option, so external Files.read is denied.
    // Passing only Buffer also prevents a document path/base directory.
    const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    if (result.messages.some(message => message.type === "error")) throw new DocumentParserFailure("malformed_document");
    if (result.messages.length !== 0) throw new DocumentParserFailure("unsupported_document");
    const text = boundedPlainText(result.value);
    // Empty Word paragraphs produce separators even when no text exists.
    return { text: /^[ \t\n]*$/.test(text) ? "" : text, pageCount: null };
  } catch (error) {
    if (error instanceof DocumentParserFailure) throw error;
    throw new DocumentParserFailure("malformed_document");
  }
}
