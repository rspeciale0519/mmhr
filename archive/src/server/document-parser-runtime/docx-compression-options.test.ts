import { createHash, randomUUID } from "node:crypto";
import { readFileSync, promises as filesystem } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { DOCUMENT_PROCESSING_PROFILE } from "../workflows/document-parser-wire-contract";
import { checkedDocxParts } from "./container-checks";
import { parsePrivateDocument } from "./parser-kernel";
import { syntheticDocx } from "./parser-fixtures";

// These cases are separate from the unchanged original21 and encrypted control.
// Exact upstream fixture bytes establish package provenance, not their producer.
const fixtures = [
  { name: "single-paragraph.docx", sha256: "7d89bf44b4d6940234efb6973d24706c881aa875bb794bfbe54efd92f9c6cf3e", text: "Walking on imported air\n\n", flags: 6 },
  { name: "simple-list.docx", sha256: "ed3c015cf411d07b08bf34264ff709363740b0747af355479088079d0796dfb3", text: "Apple\n\nBanana\n\n", flags: 6 },
  { name: "utf8-bom.docx", sha256: "8b59e5faa28793693ce0801711525f88b1f94f62d150ae9a92d1e70012d786ee", text: "This XML has a byte order mark.\n\n", flags: 2 },
  { name: "empty.docx", sha256: "fd9160a87bcbe94570d998499f1b1ed9b39f381fde1688c2ed2b0b0a6d562bf2", text: "", flags: 0x0808 },
] as const;

function shipped(name: typeof fixtures[number]["name"]): Buffer {
  const fixture = fixtures.find(value => value.name === name)!;
  const bytes = readFileSync(new URL(`./shipped-fixtures/${name}`, import.meta.url));
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(fixture.sha256);
  return bytes;
}

type Entry = { central: number; local: number; flags: number; method: number; descriptor: number };
function entries(bytes: Buffer): Entry[] {
  // All four copied fixtures have a zero-length EOCD comment. Mutations change
  // only selected header words or descriptor CRCs, never archive layout.
  const end = bytes.length - 22;
  expect(bytes.readUInt32LE(end)).toBe(0x06054b50);
  expect(bytes.readUInt16LE(end + 20)).toBe(0);
  const count = bytes.readUInt16LE(end + 10), output: Entry[] = [];
  let central = bytes.readUInt32LE(end + 16);
  for (let index = 0; index < count; index++) {
    expect(bytes.readUInt32LE(central)).toBe(0x02014b50);
    const local = bytes.readUInt32LE(central + 42);
    expect(bytes.readUInt32LE(local)).toBe(0x04034b50);
    const flags = bytes.readUInt16LE(central + 8), method = bytes.readUInt16LE(central + 10);
    expect(bytes.readUInt16LE(local + 6)).toBe(flags);
    expect(bytes.readUInt16LE(local + 8)).toBe(method);
    output.push({ central, local, flags, method,
      descriptor: local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28) + bytes.readUInt32LE(central + 20) });
    central += 46 + bytes.readUInt16LE(central + 28) + bytes.readUInt16LE(central + 30) + bytes.readUInt16LE(central + 32);
  }
  expect(central).toBe(end);
  return output;
}

function setFlags(bytes: Buffer, entry: Entry, flags: number): void {
  bytes.writeUInt16LE(flags, entry.central + 8);
  bytes.writeUInt16LE(flags, entry.local + 6);
}

function parse(bytes: Buffer) {
  return parsePrivateDocument({ protocolVersion: 1, requestId: randomUUID(), profileId: DOCUMENT_PROCESSING_PROFILE.id,
    contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    byteSize: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") }, bytes);
}

describe("separate shipped Mammoth DEFLATE regression drafts", () => {
  it.each(fixtures)("extracts exact shipped $name without external access", async fixture => {
    const bytes = shipped(fixture.name), archive = entries(bytes);
    expect(archive.length).toBeGreaterThan(0);
    expect(archive.every(entry => entry.method === 8 && entry.flags === fixture.flags)).toBe(true);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Forbidden fetch"));
    const readSpy = vi.spyOn(filesystem, "readFile").mockRejectedValue(new Error("Forbidden external file read"));
    try {
      expect(await parse(bytes)).toMatchObject({ outcome: "text", text: fixture.text, pageCount: null,
        parser: { name: "mammoth", version: "1.13.0" } });
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(readSpy).not.toHaveBeenCalled();
    } finally { fetchSpy.mockRestore(); readSpy.mockRestore(); }
  });

  it.each([0, 2, 4, 6])("accepts DEFLATE option bits %i with exact original compressed bytes", async options => {
    const bytes = shipped("single-paragraph.docx"), archive = entries(bytes);
    expect(archive.every(entry => entry.method === 8)).toBe(true);
    for (const entry of archive) setFlags(bytes, entry, (entry.flags & ~6) | options);
    expect(await parse(bytes)).toMatchObject({ outcome: "text", text: fixtures[0].text });
  });

  it.each([2, 4, 6])("denies DEFLATE option bits %i on stored entries", async options => {
    const bytes = syntheticDocx(), archive = entries(bytes);
    expect(archive.every(entry => entry.method === 0)).toBe(true);
    setFlags(bytes, archive[0]!, archive[0]!.flags | options);
    expect(await parse(bytes)).toMatchObject({ outcome: "failed", code: "malformed_document" });
  });

  it.each([0x10, 0x20, 0x40, 0x80, 0x100, 0x200, 0x400, 0x1000, 0x2000, 0x4000, 0x8000])(
    "keeps unsupported flag %i denied on genuine DEFLATE", async unsupported => {
      const bytes = shipped("single-paragraph.docx"), entry = entries(bytes)[0]!;
      setFlags(bytes, entry, entry.flags | unsupported);
      expect(await parse(bytes)).toMatchObject({ outcome: "failed", code: "malformed_document" });
    });

  it.each([1, 0x41])("keeps encrypted flag combination %i denied", async encrypted => {
    const bytes = shipped("single-paragraph.docx"), entry = entries(bytes)[0]!;
    setFlags(bytes, entry, entry.flags | encrypted);
    expect(await parse(bytes)).toMatchObject({ outcome: "failed", code: "malformed_document" });
  });

  it("denies mismatched legal local and central option bits", async () => {
    const bytes = shipped("single-paragraph.docx"), entry = entries(bytes)[0]!;
    bytes.writeUInt16LE((entry.flags & ~6) | 4, entry.central + 8);
    expect(await parse(bytes)).toMatchObject({ outcome: "failed", code: "malformed_document" });
  });

  it("still verifies actual expanded CRC with legal option flags", async () => {
    const bytes = shipped("single-paragraph.docx"), entry = entries(bytes)[0]!;
    expect(entry.flags & 8).toBe(0);
    const invalidCrc = (bytes.readUInt32LE(entry.central + 16) + 1) >>> 0;
    bytes.writeUInt32LE(invalidCrc, entry.central + 16);
    bytes.writeUInt32LE(invalidCrc, entry.local + 14);
    expect(await parse(bytes)).toMatchObject({ outcome: "failed", code: "malformed_document" });
  });

  it.each([0, 2, 4, 6])("preserves signed descriptor validation with DEFLATE option bits %i", options => {
    const bytes = shipped("empty.docx"), archive = entries(bytes);
    expect(archive).toHaveLength(8);
    for (const entry of archive) {
      expect(entry.flags).toBe(0x0808);
      expect(entry.method).toBe(8);
      expect(bytes.readUInt32LE(entry.descriptor)).toBe(0x08074b50);
      setFlags(bytes, entry, entry.flags | options);
    }
    expect(checkedDocxParts(bytes).has("word/document.xml")).toBe(true);
  });

  it("denies a changed signed descriptor CRC after legal flag acceptance", async () => {
    const bytes = shipped("empty.docx"), entry = entries(bytes)[0]!;
    setFlags(bytes, entry, entry.flags | 6);
    expect(bytes.readUInt32LE(entry.descriptor)).toBe(0x08074b50);
    bytes.writeUInt32LE((bytes.readUInt32LE(entry.descriptor + 4) + 1) >>> 0, entry.descriptor + 4);
    expect(await parse(bytes)).toMatchObject({ outcome: "failed", code: "malformed_document" });
  });
});
