import "server-only";

// This identifies a bounded Word package. The malware scanner must still examine
// the original bytes. No archive entry is extracted or treated as trusted XML.
const MAX_ENTRIES = 1_000;
const MAX_EXPANDED_BYTES = 50_000_000;
const MAX_COMPRESSION_RATIO = 100;
const requiredParts = ["[Content_Types].xml", "_rels/.rels", "word/document.xml"];

export function isBoundedDocxContainer(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 22) return false;
  const data = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = data.length - 22;
  const minimum = Math.max(0, end - 65_535);
  while (end >= minimum && data.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < minimum || end + 22 + data.readUInt16LE(end + 20) !== data.length) return false;
  const count = data.readUInt16LE(end + 10);
  const size = data.readUInt32LE(end + 12);
  const start = data.readUInt32LE(end + 16);
  if (data.readUInt16LE(end + 4) !== 0 || data.readUInt16LE(end + 6) !== 0
    || count === 0 || count > MAX_ENTRIES || data.readUInt16LE(end + 8) !== count
    || start + size !== end || start < 30) return false;

  let cursor = start;
  let expanded = 0;
  const names = new Set<string>();
  const spans: Array<[number, number]> = [];
  for (let entry = 0; entry < count; entry++) {
    if (cursor + 46 > end || data.readUInt32LE(cursor) !== 0x02014b50) return false;
    const flags = data.readUInt16LE(cursor + 8);
    const method = data.readUInt16LE(cursor + 10);
    const compressed = data.readUInt32LE(cursor + 20);
    const uncompressed = data.readUInt32LE(cursor + 24);
    const nameLength = data.readUInt16LE(cursor + 28);
    const extraLength = data.readUInt16LE(cursor + 30);
    const commentLength = data.readUInt16LE(cursor + 32);
    const local = data.readUInt32LE(cursor + 42);
    const next = cursor + 46 + nameLength + extraLength + commentLength;
    if (next > end || nameLength === 0 || nameLength > 255 || data.readUInt16LE(cursor + 34) !== 0
      || (flags & ~0x0808) !== 0 || (method !== 0 && method !== 8)
      || compressed === 0xffffffff || uncompressed === 0xffffffff || local === 0xffffffff
      || local + 30 > start || data.readUInt32LE(local) !== 0x04034b50) return false;
    const nameBytes = data.subarray(cursor + 46, cursor + 46 + nameLength);
    let name: string;
    try { name = new TextDecoder("utf-8", { fatal: true }).decode(nameBytes); }
    catch { return false; }
    if (names.has(name) || name.startsWith("/") || /[\\:\x00-\x1f\x7f]/.test(name)
      || name.split("/").some((part) => part === "." || part === "..")
      || /(?:vbaProject\.bin|\.(?:exe|dll|com|bat|cmd|js|vbs))$/i.test(name)) return false;
    const localNameLength = data.readUInt16LE(local + 26);
    const localExtraLength = data.readUInt16LE(local + 28);
    const body = local + 30 + localNameLength + localExtraLength;
    if (body + compressed > start || localNameLength !== nameLength
      || !data.subarray(local + 30, local + 30 + nameLength).equals(nameBytes)
      || data.readUInt16LE(local + 6) !== flags || data.readUInt16LE(local + 8) !== method) return false;
    if ((flags & 8) === 0 && (data.readUInt32LE(local + 14) !== data.readUInt32LE(cursor + 16)
      || data.readUInt32LE(local + 18) !== compressed || data.readUInt32LE(local + 22) !== uncompressed)) return false;
    if (method === 0 && compressed !== uncompressed) return false;
    const unixMode = (data.readUInt32LE(cursor + 38) >>> 16) & 0xf000;
    if (unixMode !== 0 && unixMode !== 0x8000 && unixMode !== 0x4000) return false;
    expanded += uncompressed;
    if (expanded > MAX_EXPANDED_BYTES || uncompressed > Math.max(1, compressed) * MAX_COMPRESSION_RATIO) return false;
    names.add(name);
    spans.push([local, body + compressed]);
    cursor = next;
  }
  spans.sort((left, right) => left[0] - right[0]);
  if (spans[0]?.[0] !== 0 || spans.some((span, index) => index > 0 && span[0] < spans[index - 1]![1])) return false;
  return cursor === end && requiredParts.every((name) => names.has(name));
}
