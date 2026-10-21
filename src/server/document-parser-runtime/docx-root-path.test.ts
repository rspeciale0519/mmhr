import { createHash, randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { promises as filesystem } from "node:fs";
import { DOCUMENT_PROCESSING_PROFILE } from "../workflows/document-parser-wire-contract";
import { checkedDocxParts } from "./container-checks";
import { parsePrivateDocument } from "./parser-kernel";
import { syntheticDocx, syntheticZip } from "./parser-fixtures";
function parse(bytes: Buffer) {
  return parsePrivateDocument({ protocolVersion: 1, requestId: randomUUID(), profileId: DOCUMENT_PROCESSING_PROFILE.id,
    contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    byteSize: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") }, bytes);
}
const targets = [["/word/document.xml",true],["/word/../word/document.xml",true],["//word/document.xml",false],["/../word/document.xml",false],["/word/../../word/document.xml",false],["/C:/word/document.xml",false],["file:///word/document.xml",false],["/missing.xml",false],["/word/document.xml?x=1",false],["/word/document.xml#fragment",false],["\\word\\document.xml",false]] as const;
for (const [target, accepted] of targets) {
  it("internal package target " + JSON.stringify(target), async () => {
    const parts = checkedDocxParts(syntheticDocx("Root path text"));
    const bytes = syntheticZip([...parts].map(([name, body]) => [name, name === "_rels/.rels"
      ? body.toString("utf8").replace('Target="word/document.xml"', 'Target="' + target + '"') : body.toString("utf8")]));
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Forbidden fetch"));
    const readSpy = vi.spyOn(filesystem, "readFile").mockRejectedValue(new Error("Forbidden external file read"));
    try {
      expect(await parse(bytes)).toMatchObject(accepted ? { outcome: "text", text: "Root path text\n\n" }
        : { outcome: "failed", code: "unsafe_relationship" });
      expect(fetchSpy).not.toHaveBeenCalled(); expect(readSpy).not.toHaveBeenCalled();
    } finally { fetchSpy.mockRestore(); readSpy.mockRestore(); }
  });
}
it("maps empty DOCX paragraphs to empty text", async () => {
  expect(await parse(syntheticDocx(""))).toMatchObject({ outcome: "text", text: "" });
});
it("maps ASCII blank DOCX paragraphs to empty text", async () => {
  expect(await parse(syntheticDocx("  "))).toMatchObject({ outcome: "text", text: "" });
});
it("preserves spacing around nonempty DOCX text", async () => {
  expect(await parse(syntheticDocx("  Kept text  "))).toMatchObject({ outcome: "text", text: "  Kept text  \n\n" });
});
