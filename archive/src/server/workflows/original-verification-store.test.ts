import { afterEach, describe, expect, test, vi } from "vitest";
import { DOCUMENT_QUARANTINE_BUCKET } from "@/server/workflows/document-store";
import { fixture } from "./stream-test-fixture";

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
describe("machine original store, preserved five synthetic SDK assertions", () => {
  test("uses the existing private bucket, exact path, and installed third-argument signal", async () => {
    const f = fixture();
    await expect(f.store.readOriginal(f.claim, f.controller.signal)).resolves.toEqual(new Uint8Array(f.bytes));
    expect(f.from).toHaveBeenCalledWith(DOCUMENT_QUARANTINE_BUCKET);
    expect(f.download).toHaveBeenCalledWith(`${f.claim.organizationId}/${f.claim.documentId}/${f.claim.versionId}`, {},
      { signal: expect.any(AbortSignal) });
    expect(f.asStream).toHaveBeenCalledOnce(); expect(f.materializeBlob).not.toHaveBeenCalled();
    // A composed signal now adds the finite stored lease. Caller propagation has a separate regression.
  });
  test("does not request bytes for an aborted read", async () => {
    const f = fixture(); f.controller.abort();
    await expect(f.store.readOriginal(f.claim, f.controller.signal)).rejects.toMatchObject({ code: "UNAVAILABLE" });
    expect(f.download).not.toHaveBeenCalled();
  });
  test("rejects a wrong size without Blob arrayBuffer materialization", async () => {
    const f = fixture(); const blob = new Blob(["wrong"]); const materialize = vi.spyOn(blob, "arrayBuffer");
    f.asStream.mockResolvedValue({ error: null, data: blob.stream() });
    await expect(f.store.readOriginal(f.claim, f.controller.signal)).rejects.toMatchObject({ code: "INTEGRITY" });
    expect(materialize).not.toHaveBeenCalled();
  });
  test("removes private provider error details", async () => {
    const f = fixture(); f.asStream.mockRejectedValue(new Error("private token"));
    await expect(f.store.readOriginal(f.claim, f.controller.signal)).rejects.toThrow("Original verification read failed");
  });
  test("rejects a provider denial without reading bytes", async () => {
    const f = fixture(); f.asStream.mockResolvedValue({ error: { message: "private policy details" }, data: null });
    await expect(f.store.readOriginal(f.claim, f.controller.signal)).rejects.toMatchObject({ code: "UNAVAILABLE" });
  });
});
