import { posix } from "node:path";
import { inflateRawSync } from "node:zlib";
import { DOCUMENT_PROCESSING_PROFILE } from "../workflows/document-parser-wire-contract";
import { DocumentParserFailure } from "./parser-failure";

const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  let current = value;
  for (let bit = 0; bit < 8; bit++) current = (current >>> 1) ^ ((current & 1) ? 0xedb88320 : 0);
  return current >>> 0;
});
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff]!;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function invalid(): never { throw new DocumentParserFailure("malformed_document"); }
const MAX_EXPANDED = DOCUMENT_PROCESSING_PROFILE.maxDocxExpandedBytes;

/** Checks actual decompression and CRCs before Mammoth's default ZIP reader.
 * No entry becomes a filesystem path. The fixed profile accepts UTF-8 XML. */
export function checkedDocxParts(input: Uint8Array): Map<string, Buffer> {
  const data = Buffer.from(input);
  if (data.length < 22) invalid();
  let end = data.length - 22;
  while (end >= Math.max(0, data.length - 65_557) && data.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < 0 || end + 22 > data.length || data.readUInt32LE(end) !== 0x06054b50
    || end + 22 + data.readUInt16LE(end + 20) !== data.length) invalid();
  const count = data.readUInt16LE(end + 10), centralSize = data.readUInt32LE(end + 12), start = data.readUInt32LE(end + 16);
  if (data.readUInt16LE(end + 4) !== 0 || data.readUInt16LE(end + 6) !== 0 || data.readUInt16LE(end + 8) !== count
    || count < 1 || count > DOCUMENT_PROCESSING_PROFILE.maxArchiveEntries || start + centralSize !== end || start < 30) invalid();
  const parts = new Map<string, Buffer>();
  const spans: Array<[number, number]> = [];
  let cursor = start, expanded = 0;
  for (let index = 0; index < count; index++) {
    if (cursor + 46 > end || data.readUInt32LE(cursor) !== 0x02014b50) invalid();
    const flags = data.readUInt16LE(cursor + 8), method = data.readUInt16LE(cursor + 10), crc = data.readUInt32LE(cursor + 16);
    const compressed = data.readUInt32LE(cursor + 20), uncompressed = data.readUInt32LE(cursor + 24);
    const nameLength = data.readUInt16LE(cursor + 28), extra = data.readUInt16LE(cursor + 30), comment = data.readUInt16LE(cursor + 32);
    const local = data.readUInt32LE(cursor + 42), next = cursor + 46 + nameLength + extra + comment;
    // APPNOTE6.3.10 section4.4.4: bits1/2 describe DEFLATE options only.
    // Encryption and every other unsupported flag remain denied.
    const allowedFlags = method === 8 ? 0x080e : 0x0808;
    if (next > end || nameLength < 1 || nameLength > 255 || (flags & ~allowedFlags) !== 0 || ![0, 8].includes(method)
      || data.readUInt16LE(cursor + 34) !== 0 || compressed === 0xffffffff || uncompressed === 0xffffffff || local === 0xffffffff
      || local + 30 > start || data.readUInt32LE(local) !== 0x04034b50) invalid();
    let name: string;
    try { name = new TextDecoder("utf-8", { fatal: true }).decode(data.subarray(cursor + 46, cursor + 46 + nameLength)); }
    catch { invalid(); }
    if (parts.has(name) || name.startsWith("/") || /[\\:\x00-\x1f\x7f]/.test(name)
      || name.split("/").some(part => part === "." || part === "..")) invalid();
    if (/(?:vbaProject\.bin|\.(?:exe|dll|com|bat|cmd|js|vbs))$/i.test(name)) throw new DocumentParserFailure("active_content");
    const unixMode = (data.readUInt32LE(cursor + 38) >>> 16) & 0xf000;
    if (![0, 0x8000, 0x4000].includes(unixMode)) invalid();
    const localNameLength = data.readUInt16LE(local + 26), localExtra = data.readUInt16LE(local + 28);
    const body = local + 30 + localNameLength + localExtra;
    if (body + compressed > start || localNameLength !== nameLength
      || !data.subarray(local + 30, local + 30 + nameLength).equals(data.subarray(cursor + 46, cursor + 46 + nameLength))
      || data.readUInt16LE(local + 6) !== flags || data.readUInt16LE(local + 8) !== method) invalid();
    if ((flags & 8) === 0 && (data.readUInt32LE(local + 14) !== crc || data.readUInt32LE(local + 18) !== compressed
      || data.readUInt32LE(local + 22) !== uncompressed)) invalid();
    if (method === 0 && compressed !== uncompressed) invalid();
    expanded += uncompressed;
    if (expanded > MAX_EXPANDED || uncompressed > Math.max(1, compressed) * DOCUMENT_PROCESSING_PROFILE.maxInflationRatio) throw new DocumentParserFailure("expanded_size_limit");
    let part: Buffer;
    try { part = method === 0 ? Buffer.from(data.subarray(body, body + compressed))
      : inflateRawSync(data.subarray(body, body + compressed), { maxOutputLength: Math.max(1, uncompressed) }); }
    catch { invalid(); }
    if (part.length !== uncompressed || crc32(part) !== crc) invalid();
    let limit = body + compressed;
    if ((flags & 8) !== 0) {
      if (limit + 12 > start) invalid();
      if (data.readUInt32LE(limit) === 0x08074b50) limit += 4;
      if (limit + 12 > start || data.readUInt32LE(limit) !== crc || data.readUInt32LE(limit + 4) !== compressed
        || data.readUInt32LE(limit + 8) !== uncompressed) invalid();
      limit += 12;
    }
    spans.push([local, limit]); parts.set(name, part); cursor = next;
  }
  spans.sort((a, b) => a[0] - b[0]);
  if (cursor !== end || spans[0]?.[0] !== 0 || spans[spans.length - 1]?.[1] !== start
    || spans.some((span, index) => index > 0 && span[0] !== spans[index - 1]![1])
    || !["[Content_Types].xml", "_rels/.rels", "word/document.xml"].every(name => parts.has(name))) invalid();
  for (const [name, part] of parts) {
    if (!/\.(?:xml|rels)$/i.test(name)) continue;
    const xml = checkedXml(part);
    if (/macroEnabled|vbaProject|oleObject|activeX/i.test(xml)) throw new DocumentParserFailure("active_content");
    if (name.endsWith(".rels")) checkRelationships(name, xml, parts);
  }
  return parts;
}

function checkedXml(bytes: Uint8Array): string {
  let xml: string;
  try { xml = new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, ""); }
  catch { throw new DocumentParserFailure("unsupported_document"); }
  if (/<!\s*(?:DOCTYPE|ENTITY)/i.test(xml)) throw new DocumentParserFailure("unsafe_relationship");
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(xml)) invalid();
  const declaration = /^\s*<\?xml\s+([^?]*)\?>/.exec(xml);
  if (declaration && /encoding\s*=\s*(['"])(?!utf-?8\1)[^'"]+\1/i.test(declaration[1]!)) throw new DocumentParserFailure("unsupported_document");
  return xml;
}

function attributes(source: string): Map<string, string> {
  const values = new Map<string, string>(); let consumed = 0;
  const attribute = /([A-Za-z_][A-Za-z0-9_.:-]*)\s*=\s*(['"])([^'"<>]*)\2/g;
  for (const match of source.matchAll(attribute)) {
    if (source.slice(consumed, match.index).trim() || values.has(match[1]!)) invalid();
    values.set(match[1]!, decodeAttribute(match[3]!)); consumed = match.index! + match[0].length;
  }
  if (source.slice(consumed).trim()) invalid();
  return values;
}

function checkRelationships(name: string, original: string, parts: Map<string, Buffer>): void {
  // Never fetch or execute document-controlled relationship targets.
  // DOCTYPE/custom entities remain denied before attribute decoding.
  // Only the bounded XML attribute decoder below resolves entities.
  const xml = original.replace(/^\s*<\?xml[^?]*\?>/, "").replace(/<!--[\s\S]*?-->/g, "").trim();
  const root = /^<Relationships\s+([^>]+)>([\s\S]*)<\/Relationships>$/.exec(xml)
    ?? /^<Relationships\s+([^>]+)\s*\/>$/.exec(xml);
  if (!root || attributes(root[1]!).get("xmlns") !== "http://schemas.openxmlformats.org/package/2006/relationships") invalid();
  const content = root[2] ?? "", ids = new Set<string>(); let consumed = 0;
  const relationship = /<Relationship\s+([^>]+)\s*\/>/g;
  for (const match of content.matchAll(relationship)) {
    if (content.slice(consumed, match.index).trim()) invalid();
    const value = attributes(match[1]!), id = value.get("Id"), target = value.get("Target"), type = value.get("Type");
    if (!id || ids.has(id) || !target || !type || [...value.keys()].some(key => !["Id", "Type", "Target", "TargetMode"].includes(key))) invalid();
    if (value.get("TargetMode") === "External") {
      if (name !== "word/_rels/document.xml.rels" || type !== "http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink"
        || target.length > 2_048 || !/^(?:https?:\/\/|mailto:)/i.test(target) || /[\\\x00-\x20\x7f]/.test(target)) throw new DocumentParserFailure("unsafe_relationship");
      ids.add(id); consumed = match.index! + match[0].length; continue;
    }
    if (value.has("TargetMode") && value.get("TargetMode") !== "Internal") throw new DocumentParserFailure("unsafe_relationship");
    if (target.startsWith("//") || /[:\\\x00-\x1f\x7f?#]/.test(target)) throw new DocumentParserFailure("unsafe_relationship");
    if (/(?:oleObject|aFChunk|attachedTemplate|package|control)$/.test(type)) throw new DocumentParserFailure("active_content");
    const directory = name === "_rels/.rels" ? "" : name.replace(/\/_rels\/[^/]+\.rels$/, "");
    // A single leading slash names a package part, never a filesystem path.
    const resolved = posix.normalize(target.startsWith("/") ? target.slice(1) : posix.join(directory, target));
    if (resolved.startsWith("../") || resolved.startsWith("/") || !parts.has(resolved)) throw new DocumentParserFailure("unsafe_relationship");
    ids.add(id); consumed = match.index! + match[0].length;
  }
  if (content.slice(consumed).trim()) invalid();
}


function decodeAttribute(input: string): string {
  const named: Readonly<Record<string, string>> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
  if (/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;)/.test(input)) throw new DocumentParserFailure("unsafe_relationship");
  return input.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);/g, (_, entity: string) => {
    if (entity in named) return named[entity]!;
    const point = entity.startsWith("#x") ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    if (!Number.isInteger(point) || point < 0x20 || point > 0x10ffff || point >= 0xd800 && point <= 0xdfff || point === 0x7f) throw new DocumentParserFailure("unsafe_relationship");
    return String.fromCodePoint(point);
  });
}

