import { createHash, randomUUID } from "node:crypto";
import { describe, expect, test, vi } from "vitest";

import type { RequestSupabaseClient } from "@/server/auth/authorization";
import { DOCUMENT_QUARANTINE_BUCKET } from "./document-store";
import { createSupabaseDocumentStore } from "./supabase-document-store";

const original = Buffer.from("%PDF-1.7\nSynthetic private storage\n%%EOF");
const request = () => ({ organizationId: randomUUID(), documentId: randomUUID(), versionId: randomUUID(),
  fileName: "synthetic-response.pdf", declaredMimeType: "application/pdf", bytes: Buffer.from(original) });
function fixture() {
  const upload = vi.fn<(path: string, bytes: Uint8Array, options: unknown) => Promise<{
    data: { id: string; path: string; fullPath: string }; error: unknown;
  }>>(async (path) => ({
    data: { id: randomUUID(), path, fullPath: `${DOCUMENT_QUARANTINE_BUCKET}/${path}` }, error: null as unknown,
  }));
  const download = vi.fn<(path: string) => Promise<{ data: Blob; error: unknown }>>(
    async () => ({ data: new Blob([original]), error: null }));
  const from = vi.fn(() => ({ upload, download }));
  const client = { storage: { from } } as unknown as RequestSupabaseClient;
  return { store: createSupabaseDocumentStore(client), upload, download, from };
}

describe("Supabase private quarantine adapter", () => {
  test("uses immutable scoped paths and metadata computed from the bytes", async () => {
    const test = fixture();
    const input = request();
    const object = await test.store.putQuarantined(input);
    const path = `${input.organizationId}/${input.documentId}/${input.versionId}`;
    expect(test.from).toHaveBeenCalledWith(DOCUMENT_QUARANTINE_BUCKET);
    expect(test.upload).toHaveBeenCalledWith(path, new Uint8Array(original), {
      contentType: "application/pdf", cacheControl: "0", upsert: false,
    });
    expect(object).toMatchObject({ objectPath: path, storageReference: `quarantine://${path}`,
      state: "quarantined", sha256: createHash("sha256").update(original).digest("hex"), byteSize: original.length });
    expect(Object.isFrozen(object)).toBe(true);
    expect(Object.keys(object)).not.toContain("url");
    await expect(test.store.readForScan(object)).resolves.toEqual(new Uint8Array(original));
  });

  test("rejects client-supplied hashes, paths, identifiers, and invalid content before upload", async () => {
    const test = fixture();
    for (const change of [{ objectPath: "another/path" }, { sha256: "a".repeat(64) },
      { organizationId: "invalid" }, { fileName: "../secret.pdf" }, { bytes: Buffer.from("incorrect header") }]) {
      await expect(test.store.putQuarantined({ ...request(), ...change })).rejects.toThrow("Invalid document upload");
    }
    expect(test.upload).not.toHaveBeenCalled();
  });

  test("preserves the stored snapshot if caller bytes change during upload", async () => {
    const test = fixture();
    const input = request();
    const uploading = test.store.putQuarantined(input);
    input.bytes.fill(0);
    const object = await uploading;
    expect(object.sha256).toBe(createHash("sha256").update(original).digest("hex"));
    expect(test.upload.mock.calls[0]![1]).toEqual(new Uint8Array(original));
  });

  test("does not turn an existing-object error into a successful overwrite", async () => {
    const test = fixture();
    test.upload.mockResolvedValueOnce({ data: null as never, error: { message: "Asset already exists" } });
    await expect(test.store.putQuarantined(request())).rejects.toThrow("Document storage unavailable");
    expect(test.upload).toHaveBeenCalledTimes(1);
    expect(test.upload.mock.calls[0]![2]).toMatchObject({ upsert: false });
  });

  test("rejects a provider response that points to another scope", async () => {
    const test = fixture();
    test.upload.mockResolvedValueOnce({ data: { id: randomUUID(), path: "wrong", fullPath: "wrong" }, error: null });
    await expect(test.store.putQuarantined(request())).rejects.toThrow("Document storage unavailable");
  });

  test("rejects changed object associations before download", async () => {
    const test = fixture(); const object = await test.store.putQuarantined(request());
    for (const change of [{ organizationId: randomUUID() }, { documentId: randomUUID() },
      { versionId: randomUUID() }, { objectPath: "../secret" }, { state: "clean" as never }]) {
      await expect(test.store.readForScan({ ...object, ...change })).rejects.toThrow("Invalid document object");
    }
    expect(test.download).not.toHaveBeenCalled();
  });

  test("rejects missing, truncated, and changed stored content", async () => {
    const test = fixture(); const object = await test.store.putQuarantined(request());
    test.download.mockResolvedValueOnce({ data: null as never, error: { message: "Object unavailable" } });
    await expect(test.store.readForScan(object)).rejects.toThrow("Document storage unavailable");
    test.download.mockResolvedValueOnce({ data: new Blob(["short"]), error: null });
    await expect(test.store.readForScan(object)).rejects.toMatchObject({ code: "INTEGRITY", message: "Document integrity check failed" });
    test.download.mockResolvedValueOnce({ data: new Blob([Buffer.alloc(original.length)]), error: null });
    await expect(test.store.readForScan(object)).rejects.toThrow("Document integrity check failed");
  });

  test("does not expose transport error text", async () => {
    const test = fixture();
    test.upload.mockRejectedValueOnce(new Error("Private provider detail"));
    await expect(test.store.putQuarantined(request())).rejects.toThrow(/^Document storage unavailable$/);
    const object = await test.store.putQuarantined(request());
    test.download.mockRejectedValueOnce(new Error("Private provider detail"));
    await expect(test.store.readForScan(object)).rejects.toThrow(/^Document storage unavailable$/);
  });
});
