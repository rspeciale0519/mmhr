import sharp from "sharp";
import { DOCUMENT_PROCESSING_PROFILE } from "../workflows/document-parser-wire-contract";
import { DocumentParserFailure } from "./parser-failure";
import { inspectPrivateImage } from "./image-container";

export async function validatePrivateImage(bytes: Uint8Array, mime: "image/png" | "image/jpeg") {
  // This process handles one input. Global native cache/concurrency settings
  // never change the application's sharp instance in the request process.
  const expected = inspectPrivateImage(bytes, mime);
  sharp.cache(false); sharp.concurrency(1);
  const image = sharp(Buffer.from(bytes), { failOn: "warning", unlimited: false,
    limitInputPixels: DOCUMENT_PROCESSING_PROFILE.maxImagePixels, limitInputChannels: 4,
    sequentialRead: true, animated: false, pages: 1, ignoreIcc: true });
  try {
    const metadata = await image.metadata();
    const format = mime === "image/png" ? "png" : "jpeg";
    if (metadata.width !== expected.width || metadata.height !== expected.height) throw new DocumentParserFailure("malformed_document");
    if (metadata.format !== format) throw new DocumentParserFailure("unsupported_document");
    if ((metadata.pages ?? 1) !== 1) throw new DocumentParserFailure("unsupported_document");
    if (!Number.isSafeInteger(metadata.width) || !Number.isSafeInteger(metadata.height)
      || metadata.width < 1 || metadata.height < 1) throw new DocumentParserFailure("malformed_document");
    if (metadata.width * metadata.height > DOCUMENT_PROCESSING_PROFILE.maxImagePixels) throw new DocumentParserFailure("pixel_limit");
    // Full uint8 decode forces every accepted pixel through the decoder.
    // No resize, OCR, metadata-only success, or pixel output crosses the port.
    const decoded = await image.timeout({ seconds: 25 }).raw().toBuffer({ resolveWithObject: true });
    if (decoded.info.width !== metadata.width || decoded.info.height !== metadata.height
      || decoded.info.channels < 1 || decoded.info.channels > 4
      || decoded.data.byteLength !== decoded.info.width * decoded.info.height * decoded.info.channels) throw new DocumentParserFailure("decode_failed");
    if (decoded.data.byteLength > DOCUMENT_PROCESSING_PROFILE.maxDecodedImageBytes) throw new DocumentParserFailure("expanded_size_limit");
    return { format, width: decoded.info.width, height: decoded.info.height, channels: decoded.info.channels,
      decodedByteSize: decoded.data.byteLength, ocrPerformed: false as const };
  } catch (error) {
    if (error instanceof DocumentParserFailure) throw error;
    throw new DocumentParserFailure("decode_failed");
  } finally { image.destroy(); }
}

