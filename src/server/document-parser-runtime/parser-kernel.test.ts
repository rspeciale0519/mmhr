import { createHash, randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { promises as filesystem } from "node:fs";
import sharp from "sharp";
import { DOCUMENT_PROCESSING_PROFILE } from "../workflows/document-parser-wire-contract";
import { parsePrivateDocument } from "./parser-kernel";
import { syntheticDocx, syntheticPdf, syntheticPng, pngChunk, syntheticZip } from "./parser-fixtures";

// Authored only. Root review must clear actual native/format execution. These
// tests prove parsing behavior, never isolation, RLS, human review, or launch.
function parse(bytes: Buffer, contentType: "application/pdf" | "application/vnd.openxmlformats-officedocument.wordprocessingml.document" | "image/png" | "image/jpeg") {
  return parsePrivateDocument({ protocolVersion: 1, requestId: randomUUID(), profileId: DOCUMENT_PROCESSING_PROFILE.id,
    contentType, byteSize: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") }, bytes);
}
const docx = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
describe("private format adapter drafts", () => {
  it("extracts actual PDF plain text with its page count", async () => {
    expect(await parse(syntheticPdf(), "application/pdf")).toMatchObject({ outcome: "text", pageCount: 1, parser: { name: "pdfjs-dist", version: "6.3.289" }, text: expect.stringContaining("Private synthetic text") });
  });
  it("extracts actual DOCX text without HTML", async () => {
    expect(await parse(syntheticDocx("Private <instruction> text"), docx)).toMatchObject({ outcome: "text", pageCount: null, text: expect.stringContaining("Private <instruction> text") });
  });
  it("fully decodes actual PNG pixels without OCR", async () => {
    expect(await parse(syntheticPng(), "image/png")).toMatchObject({ outcome: "image_validated", width: 1, height: 1, channels: 3, decodedByteSize: 3, ocrPerformed: false });
  });
  it("fully decodes a genuinely encoded JPEG", async () => {
    const bytes = await sharp(Buffer.from([255, 0, 0]), { raw: { width: 1, height: 1, channels: 3 } }).jpeg().toBuffer();
    expect(await parse(bytes, "image/jpeg")).toMatchObject({ outcome: "image_validated", format: "jpeg", width: 1, height: 1, ocrPerformed: false });
  });
  it("rejects a truncated PDF envelope", async () => {
    expect(await parse(syntheticPdf().subarray(0, 200), "application/pdf")).toMatchObject({ outcome: "failed", code: "malformed_document" });
  });
  it("rejects an actual 501-page PDF before text traversal", async () => {
    expect(await parse(syntheticPdf("Bounded", 501), "application/pdf")).toMatchObject({ outcome: "failed", code: "page_limit" });
  });
  it("rejects external DOCX image relationships before Mammoth", async () => {
    expect(await parse(syntheticDocx("Private", '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="https://example.invalid/private" TargetMode="External"/>'), docx)).toMatchObject({ outcome: "failed", code: "unsafe_relationship" });
  });
  it("rejects DOCX entity declarations", async () => {
    const bytes = syntheticZip([["[Content_Types].xml", "<!DOCTYPE x [<!ENTITY p SYSTEM 'file:///private'>]><x/>"], ["_rels/.rels", '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>'], ["word/document.xml", "<x/>"]]);
    expect(await parse(bytes, docx)).toMatchObject({ outcome: "failed", code: "unsafe_relationship" });
  });
  it("rejects changed DOCX content with the original CRC", async () => {
    const bytes = syntheticDocx(); bytes[100] ^= 1;
    expect(await parse(bytes, docx)).toMatchObject({ outcome: "failed", code: "malformed_document" });
  });
  it("bounds actual DOCX text", async () => {
    expect(await parse(syntheticDocx("a".repeat(1_000_001)), docx)).toMatchObject({ outcome: "failed", code: "text_limit" });
  });
  it("rejects invalid PNG CRC before native decoding", async () => {
    const bytes = syntheticPng(); bytes[29] ^= 1;
    expect(await parse(bytes, "image/png")).toMatchObject({ outcome: "failed", code: "malformed_document" });
  });
  it("rejects oversized PNG dimensions deterministically", async () => {
    expect(await parse(syntheticPng(20_000_001, 1), "image/png")).toMatchObject({ outcome: "failed", code: "pixel_limit" });
  });
  it("rejects animated PNG", async () => {
    const bytes = syntheticPng(), control = Buffer.alloc(8); control.writeUInt32BE(1);
    expect(await parse(Buffer.concat([bytes.subarray(0, 33), pngChunk("acTL", control), bytes.subarray(33)]), "image/png")).toMatchObject({ outcome: "failed", code: "unsupported_document" });
  });
  it("rejects malformed compressed pixel content after valid framing", async () => {
    const bytes = syntheticPng();
    const broken = Buffer.concat([bytes.subarray(0, 33), pngChunk("IDAT", Buffer.from([1, 2, 3])), pngChunk("IEND", Buffer.alloc(0))]);
    expect(await parse(broken, "image/png")).toMatchObject({ outcome: "failed", code: "decode_failed" });
  });
});

it("accepts inert PDF page navigation without performing it", async () => {
  expect(await parse(syntheticPdf("Safe destination", 1, "destination"), "application/pdf"))
    .toMatchObject({ outcome: "text", pageCount: 1, text: expect.stringContaining("Safe destination") });
});
it.each(["named", "javascript"] as const)("rejects PDF %s actions", async action => {
  expect(await parse(syntheticPdf("Untrusted action", 1, action), "application/pdf")).toMatchObject({ outcome: "failed", code: "active_content" });
});
it("returns hyperlink display text without fetching or reading an external file", async () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Forbidden fetch"));
  const fileSpy = vi.spyOn(filesystem, "readFile").mockRejectedValue(new Error("Forbidden file read"));
  try {
    const bytes = syntheticDocx("Visible link label", '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.invalid/?first=1&amp;second=2" TargetMode="External"/>', true);
    const result = await parse(bytes, docx);
    expect(result).toMatchObject({ outcome: "text", text: expect.stringContaining("Visible link label") });
    if (result.outcome !== "text") throw new Error("Expected actual text result");
    expect(result.text).not.toContain("example.invalid"); expect(fetchSpy).not.toHaveBeenCalled(); expect(fileSpy).not.toHaveBeenCalled();
  } finally { fetchSpy.mockRestore(); fileSpy.mockRestore(); }
});
it.each(["file:///private", "javascript:alert(1)", "https://example.invalid/?x=&unknown;"])("rejects unsafe or unknown hyperlink attributes %s", async target => {
  expect(await parse(syntheticDocx("Display", `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${target}" TargetMode="External"/>`, true), docx))
    .toMatchObject({ outcome: "failed", code: "unsafe_relationship" });
});
