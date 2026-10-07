import { createHash, randomUUID } from "node:crypto";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { expect, test } from "vitest";
import { DOCUMENT_PROCESSING_PROFILE } from "../workflows/document-parser-wire-contract";
import { parsePrivateDocument } from "./parser-kernel";
import { syntheticEncryptedPdf } from "./encrypted-pdf-fixture";

test("opens the actual encrypted fixture only for the test control, then rejects it in the application parser", async () => {
  const fixture = syntheticEncryptedPdf();
  const loading = getDocument({ data: Uint8Array.from(fixture.bytes), password: fixture.validationPassword, verbosity: 0,
    useWorkerFetch: false, useWasm: false, useSystemFonts: false, disableFontFace: true, stopAtErrors: true });
  try {
    const document = await loading.promise;
    expect(document.numPages).toBe(1);
    const page = await document.getPage(1);
    try {
      const text = await page.getTextContent();
      expect(text.items.filter(item => "str" in item).map(item => "str" in item ? item.str : "").join(" ")).toContain("Synthetic encrypted text");
    } finally { page.cleanup(); }
  } finally { await loading.destroy(); }
  // The production parser accepts no password and must preserve this failure.
  expect(await parsePrivateDocument({ protocolVersion: 1, requestId: randomUUID(), profileId: DOCUMENT_PROCESSING_PROFILE.id,
    contentType: "application/pdf", byteSize: fixture.bytes.length, sha256: createHash("sha256").update(fixture.bytes).digest("hex") }, fixture.bytes))
    .toMatchObject({ outcome: "failed", code: "encrypted_document" });
});
