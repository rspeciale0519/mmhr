import { createHash, randomUUID, webcrypto } from "node:crypto";
import { afterEach, expect, test, vi } from "vitest";
import { createWorkspaceDocumentFileManifest, workspaceDocumentFileManifestSchema, workspaceDocumentUploadCompletionSchema,
  workspaceDocumentUploadPreparationSchema, workspaceDocumentQuarantineBucket } from "./workspace-document-upload";
import { DOCUMENT_QUARANTINE_BUCKET } from "@/server/workflows/document-store";

const manifest = { fileName: "synthetic.pdf", declaredMimeType: "application/pdf", byteSize: 12, sha256: "a".repeat(64) };
const preparation = { ...manifest, organizationId: randomUUID(), documentId: randomUUID(), versionId: randomUUID(), expectedVersion: 0,
  correlationId: randomUUID(), idempotencyKey: randomUUID() };
afterEach(() => vi.unstubAllGlobals());
test("matches the fixed private bucket and permits only a bounded manifest", () => {
  expect(workspaceDocumentQuarantineBucket).toBe(DOCUMENT_QUARANTINE_BUCKET);
  expect(workspaceDocumentUploadPreparationSchema.parse(preparation)).toEqual(preparation);
  expect(workspaceDocumentFileManifestSchema.parse({ ...manifest, byteSize: 25_000_000 })).toMatchObject({ byteSize: 25_000_000 });
});
test.each([{ byteSize: 0 }, { byteSize: 25_000_001 }, { byteSize: 1.5 }, { sha256: "forged" },
  { fileName: "../synthetic.pdf" }, { fileName: "folder\\synthetic.pdf" }, { fileName: "synthetic\n.pdf" },
  { fileName: "é".repeat(128) + ".pdf" }, { fileName: "synthetic.exe" }, { declaredMimeType: "image/png" },
  { actorIdentityId: randomUUID() }, { scanState: "clean" }, { approved: true }, { storageReference: "https://example.invalid" }])(
  "rejects invalid metadata and caller-supplied authority", (change) => {
    expect(workspaceDocumentUploadPreparationSchema.safeParse({ ...preparation, ...change }).success).toBe(false);
  });
test.each(["organizationId", "documentId", "versionId", "correlationId", "idempotencyKey"])("requires valid %s", (name) => {
  expect(workspaceDocumentUploadPreparationSchema.safeParse({ ...preparation, [name]: "invalid" }).success).toBe(false);
});
test("derives a digest from the selected immutable File bytes", async () => {
  vi.stubGlobal("crypto", webcrypto);
  const bytes = Uint8Array.from(Buffer.from("%PDF-1.7\nsynthetic"));
  const file = { name: "Synthetic.PDF", type: "application/pdf", size: bytes.length, arrayBuffer: async () => bytes.buffer } as File;
  await expect(createWorkspaceDocumentFileManifest(file)).resolves.toEqual({ fileName: file.name, declaredMimeType: file.type,
    byteSize: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
});
test.each([
  ["Synthetic.PDF", "", "application/pdf"],
  ["synthetic.docx", "application/octet-stream", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  ["synthetic.PNG", "text/plain", "image/png"],
  ["synthetic.jpg", "image/pjpeg", "image/jpeg"],
  ["synthetic.jpeg", "", "image/jpeg"],
])("reserves %s without trusting browser type %s", async (name, type, declaredMimeType) => {
  vi.stubGlobal("crypto", webcrypto);
  const bytes = Uint8Array.from([1, 2, 3]);
  const file = { name, type, size: bytes.length, arrayBuffer: async () => bytes.buffer } as File;
  await expect(createWorkspaceDocumentFileManifest(file)).resolves.toEqual({ fileName: name, declaredMimeType,
    byteSize: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
});
test.each(["synthetic.exe", "synthetic.constructor", "synthetic.__proto__", "synthetic.toString"])(
  "rejects unsupported %s before reading bytes", async (name) => {
    const arrayBuffer = vi.fn();
    await expect(createWorkspaceDocumentFileManifest({ name, type: "application/pdf", size: 12, arrayBuffer } as unknown as File)).rejects.toThrow();
    expect(arrayBuffer).not.toHaveBeenCalled();
  });
test.each([0, 25_000_001])("rejects size %s before reading the file", async (size) => {
  const arrayBuffer = vi.fn(); await expect(createWorkspaceDocumentFileManifest({ size, arrayBuffer } as unknown as File)).rejects.toThrow();
  expect(arrayBuffer).not.toHaveBeenCalled();
});
test("rejects changed file length and injected completion authority", async () => {
  await expect(createWorkspaceDocumentFileManifest({ name: "synthetic.pdf", type: "application/pdf", size: 2,
    arrayBuffer: async () => new ArrayBuffer(1) } as File)).rejects.toThrow("The selected file could not be read.");
  const input = { organizationId: preparation.organizationId, documentId: preparation.documentId, versionId: preparation.versionId,
    expectedRevision: 1, correlationId: preparation.correlationId, idempotencyKey: preparation.idempotencyKey };
  expect(workspaceDocumentUploadCompletionSchema.safeParse({ ...input, scanState: "clean" }).success).toBe(false);
  expect(workspaceDocumentUploadCompletionSchema.safeParse({ ...input, expectedRevision: 2 }).success).toBe(false);
});
