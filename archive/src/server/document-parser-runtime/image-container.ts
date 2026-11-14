import { DOCUMENT_PROCESSING_PROFILE } from "../workflows/document-parser-wire-contract";
import { crc32 } from "./container-checks";
import { DocumentParserFailure } from "./parser-failure";

function fail(): never { throw new DocumentParserFailure("malformed_document"); }
function dimensions(width: number, height: number) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) fail();
  if (width * height > DOCUMENT_PROCESSING_PROFILE.maxImagePixels) throw new DocumentParserFailure("pixel_limit");
  return { width, height };
}

/** Structural checks precede native decode. CRC and exact end boundaries reject
 * tolerated truncated/trailing PNG data; successful validation still requires
 * sharp to decode every pixel. No metadata-only success is permitted. */
export function inspectPrivateImage(bytes: Uint8Array, mime: "image/png" | "image/jpeg"): { width: number; height: number } {
  const data = Buffer.from(bytes);
  if (mime === "image/png") {
    if (!data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) fail();
    let position = 8, result: { width: number; height: number } | undefined, seenData = false, ended = false;
    while (position < data.length) {
      if (position + 12 > data.length) fail();
      const length = data.readUInt32BE(position), end = position + 12 + length;
      if (end > data.length) fail();
      const type = data.subarray(position + 4, position + 8).toString("ascii");
      if (!/^[A-Za-z]{4}$/.test(type) || crc32(data.subarray(position + 4, end - 4)) !== data.readUInt32BE(end - 4)) fail();
      if (type === "acTL" || type === "fcTL" || type === "fdAT") throw new DocumentParserFailure("unsupported_document");
      if (position === 8 && type !== "IHDR") fail();
      if (type === "IHDR") {
        if (result || position !== 8 || length !== 13) fail();
        result = dimensions(data.readUInt32BE(position + 8), data.readUInt32BE(position + 12));
      }
      if (type === "IDAT") seenData = true;
      if (type === "IEND") {
        if (length !== 0 || !seenData || end !== data.length) fail();
        ended = true;
      }
      position = end;
    }
    if (!result || !ended) fail();
    return result;
  }
  if (data.length < 4 || data.readUInt16BE(0) !== 0xffd8 || data.readUInt16BE(data.length - 2) !== 0xffd9) fail();
  let position = 2, result: { width: number; height: number } | undefined;
  while (position < data.length - 2) {
    if (data[position++] !== 0xff) fail();
    while (data[position] === 0xff) position++;
    const marker = data[position++];
    if (marker === undefined || marker === 0 || marker === 0xd8 || marker === 0xd9) fail();
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (position + 2 > data.length) fail();
    const length = data.readUInt16BE(position);
    if (length < 2 || position + length > data.length) fail();
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      if (result || length < 8) fail();
      result = dimensions(data.readUInt16BE(position + 5), data.readUInt16BE(position + 3));
    }
    if (marker === 0xda) {
      if (!result) fail();
      return result; // Entropy, restarts, later scans, and EOI are checked by full native decode.
    }
    position += length;
  }
  fail();
}

