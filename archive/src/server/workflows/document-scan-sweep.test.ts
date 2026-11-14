import { randomUUID } from "node:crypto";
import { describe, expect, test, vi } from "vitest";

import { runDocumentScanSweep } from "./document-scan-sweep";

function fixture(ids: unknown = []) {
  const repository = { listCandidateIds: vi.fn().mockResolvedValue(ids), claim: vi.fn().mockResolvedValue(null),
    leaseIsCurrent: vi.fn(), finish: vi.fn() };
  return { repository, store: { readForScan: vi.fn() }, scanner: { scan: vi.fn() } };
}
describe("bounded durable document scan sweep", () => {
  test("finishes an empty queue without provider or database mutations", async () => {
    const dependencies = fixture();
    await expect(runDocumentScanSweep(dependencies)).resolves.toEqual({ outcome: "completed", items: [] });
    expect(dependencies.repository.claim).not.toHaveBeenCalled(); expect(dependencies.scanner.scan).not.toHaveBeenCalled();
  });
  test.each([null, {}, ["not-an-id"], Array.from({ length: 6 }, randomUUID), ["a", "a"]])("rejects invalid or oversized queue output: case %#", async (ids) => {
    const dependencies = fixture(ids);
    await expect(runDocumentScanSweep(dependencies)).resolves.toEqual({ outcome: "failed", code: "invalid_queue" });
    expect(dependencies.repository.claim).not.toHaveBeenCalled();
  });
  test("rejects duplicate genuine identifiers", async () => {
    const id = randomUUID(), dependencies = fixture([id, id]);
    await expect(runDocumentScanSweep(dependencies)).resolves.toMatchObject({ outcome: "failed", code: "invalid_queue" });
  });
  test("normalizes case before rejecting duplicate identifiers", async () => {
    const id = randomUUID(), dependencies = fixture([id, id.toUpperCase()]);
    await expect(runDocumentScanSweep(dependencies)).resolves.toMatchObject({ outcome: "failed", code: "invalid_queue" });
  });
  test("hides queue provider details and performs no retry", async () => {
    const dependencies = fixture(); dependencies.repository.listCandidateIds.mockRejectedValue(new Error("Private provider details"));
    await expect(runDocumentScanSweep(dependencies)).resolves.toEqual({ outcome: "failed", code: "queue_unavailable" });
    expect(dependencies.repository.listCandidateIds).toHaveBeenCalledTimes(1);
  });
  test("handles competing claims without reading files or bypassing the lease", async () => {
    const ids = [randomUUID(), randomUUID()], dependencies = fixture(ids);
    await expect(runDocumentScanSweep(dependencies)).resolves.toEqual({ outcome: "completed", items: ids.map((versionId) => ({ versionId, result: { outcome: "busy" } })) });
    expect(dependencies.store.readForScan).not.toHaveBeenCalled(); expect(dependencies.repository.claim).toHaveBeenCalledTimes(2);
  });
  test("stops at an unavailable claim instead of blindly retrying or continuing", async () => {
    const ids = [randomUUID(), randomUUID()], dependencies = fixture(ids);
    dependencies.repository.claim.mockRejectedValue(new Error("Private connection details"));
    await expect(runDocumentScanSweep(dependencies)).resolves.toEqual({ outcome: "needs_attention",
      items: [{ versionId: ids[0], result: { outcome: "failed", code: "claim_unavailable" } }] });
    expect(dependencies.repository.claim).toHaveBeenCalledTimes(1);
  });
  test("yields at the time budget and leaves remaining candidates unclaimed", async () => {
    vi.useFakeTimers();
    try {
      const ids = [randomUUID(), randomUUID()], dependencies = fixture(ids);
      dependencies.repository.claim.mockImplementation(async () => { vi.setSystemTime(Date.now()+91_000); return null; });
      await expect(runDocumentScanSweep(dependencies)).resolves.toEqual({ outcome: "yielded", items: [{ versionId: ids[0], result: { outcome: "busy" } }] });
      expect(dependencies.repository.claim).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });
});
