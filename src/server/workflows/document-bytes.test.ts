import { createHash } from "node:crypto";
import { describe, expect, test } from "vitest";

import { inspectDocumentBytes } from "./document-bytes";
import { isBoundedDocxContainer } from "./docx-container";
import { MAX_DOCUMENT_SIZE_BYTES } from "./document-safety";

const pdf = Buffer.from("%PDF-1.7\nSynthetic upload\n%%EOF");
const metadata = { fileName: "response.pdf", declaredMimeType: "application/pdf" };
const docxMetadata = { fileName: "response.docx", declaredMimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };
const parts = ["[Content_Types].xml", "_rels/.rels", "word/document.xml"];

function checksum(bytes: Uint8Array): number {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  }
  return (value ^ 0xffffffff) >>> 0;
}

function storedZip(names = parts): Buffer {
  const locals: Buffer[] = [];
  const directories: Buffer[] = [];
  let position = 0;
  for (const name of names) {
    const encoded = Buffer.from(name);
    const content = Buffer.from("<synthetic />");
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(checksum(content), 14);
    local.writeUInt32LE(content.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(encoded.length, 26);
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50);
    directory.writeUInt16LE(20, 4);
    directory.writeUInt16LE(20, 6);
    directory.writeUInt32LE(checksum(content), 16);
    directory.writeUInt32LE(content.length, 20);
    directory.writeUInt32LE(content.length, 24);
    directory.writeUInt16LE(encoded.length, 28);
    directory.writeUInt32LE(position, 42);
    locals.push(local, encoded, content);
    directories.push(directory, encoded);
    position += local.length + encoded.length + content.length;
  }
  const directory = Buffer.concat(directories);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(names.length, 8);
  end.writeUInt16LE(names.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(position, 16);
  return Buffer.concat([...locals, directory, end]);
}

describe("document byte inspection", () => {
  test("computes metadata from immutable original bytes and retains quarantine", () => {
    const input = Buffer.from(pdf);
    const result = inspectDocumentBytes(metadata, input);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected inspected bytes");
    expect(result.document).toMatchObject({ state: "quarantined", contentType: "application/pdf",
      byteSize: pdf.length, sha256: createHash("sha256").update(pdf).digest("hex") });
    input.fill(0);
    result.document.copyBytes().fill(0);
    expect(Buffer.from(result.document.copyBytes())).toEqual(pdf);
  });

  test.each([
    [{ ...metadata, fileName: "../response.pdf" }, pdf, "invalid_metadata"],
    [{ ...metadata, fileName: "response\n.pdf" }, pdf, "invalid_metadata"],
    [{ ...metadata, fileName: "é".repeat(128) + ".pdf" }, pdf, "invalid_metadata"],
    [{ ...metadata, sha256: "a".repeat(64) }, pdf, "invalid_metadata"],
    [metadata, Buffer.alloc(0), "invalid_metadata"],
    [metadata, Buffer.from("not a PDF"), "magic_bytes_mismatch"],
    [{ ...metadata, declaredMimeType: "image/png" }, pdf, "mime_mismatch"],
  ])("rejects invalid metadata or bytes without returning content", (value, bytes, code) => {
    expect(inspectDocumentBytes(value, bytes)).toEqual({ ok: false, code });
  });

  test("enforces the exact byte limit before copying or hashing", () => {
    const boundary = Buffer.alloc(MAX_DOCUMENT_SIZE_BYTES);
    pdf.copy(boundary);
    expect(inspectDocumentBytes(metadata, boundary).ok).toBe(true);
    expect(inspectDocumentBytes(metadata, Buffer.alloc(MAX_DOCUMENT_SIZE_BYTES + 1))).toEqual({ ok: false, code: "size_exceeded" });
  });

  test.each([
    ["response.png", "image/png", "89504e470d0a1a0a"],
    ["response.jpg", "image/jpeg", "ffd8ff"],
    ["response.jpeg", "image/jpeg", "ffd8ff"],
  ])("identifies supported %s headers while requiring a later malware scan", (fileName, declaredMimeType, hex) => {
    const result = inspectDocumentBytes({ fileName, declaredMimeType }, Buffer.from(hex, "hex"));
    expect(result.ok && result.document.state).toBe("quarantined");
  });

  test("requires a bounded Word package, not a renamed arbitrary ZIP", () => {
    expect(inspectDocumentBytes(docxMetadata, storedZip()).ok).toBe(true);
    expect(inspectDocumentBytes(docxMetadata, storedZip(["payload.txt"]))).toEqual({ ok: false, code: "invalid_container" });
    expect(inspectDocumentBytes(docxMetadata, Buffer.from("504b0304", "hex"))).toEqual({ ok: false, code: "invalid_container" });
  });
});

describe("bounded Word package recognition", () => {
  test.each([
    ["duplicate parts", [...parts, "word/document.xml"]],
    ["parent paths", [...parts, "../payload.xml"]],
    ["absolute paths", [...parts, "/payload.xml"]],
    ["Windows paths", [...parts, "C:\\payload.xml"]],
    ["macros", [...parts, "word/vbaProject.bin"]],
    ["executable content", [...parts, "word/payload.exe"]],
  ])("rejects %s", (_name, names) => expect(isBoundedDocxContainer(storedZip(names))).toBe(false));

  test("rejects encryption, unsupported compression, split archives, and excessive expansion", () => {
    for (const corrupt of [
      (bytes: Buffer, start: number) => bytes.writeUInt16LE(1, start + 8),
      (bytes: Buffer, start: number) => bytes.writeUInt16LE(99, start + 10),
      (bytes: Buffer, start: number) => bytes.writeUInt16LE(1, start + 34),
      (bytes: Buffer, start: number) => bytes.writeUInt32LE(50_000_001, start + 24),
      (bytes: Buffer, start: number) => bytes.writeUInt32LE(0xffffffff, start + 42),
    ]) {
      const bytes = storedZip();
      corrupt(bytes, bytes.readUInt32LE(bytes.length - 6));
      expect(isBoundedDocxContainer(bytes)).toBe(false);
    }
  });

  test("rejects inconsistent local names, overlapping entries, and truncated directory records", () => {
    const alteredName = storedZip(); alteredName[30] = 65;
    expect(isBoundedDocxContainer(alteredName)).toBe(false);
    const overlapping = storedZip();
    const start = overlapping.readUInt32LE(overlapping.length - 6);
    overlapping.writeUInt32LE(0, start + 46 + Buffer.byteLength(parts[0]!) + 42);
    expect(isBoundedDocxContainer(overlapping)).toBe(false);
    expect(isBoundedDocxContainer(storedZip().subarray(0, -1))).toBe(false);
  });
});
