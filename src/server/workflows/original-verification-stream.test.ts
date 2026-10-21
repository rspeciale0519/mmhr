import { afterEach, describe, expect, test, vi } from "vitest";
import { MAX_DOCUMENT_SIZE_BYTES } from "@/server/workflows/document-safety";
import { ORIGINAL_VERIFICATION_CLOSE_MS } from "./original-verification-execution";
import { runOriginalVerification, type OriginalVerificationClaim, type OriginalVerificationCompletion } from "./original-verification-worker";
import { chunks, deferred, fixture } from "./stream-test-fixture";
import { ORIGINAL_VERIFICATION_DIAGNOSTIC_FAILURE_LIMIT, originalVerificationDiagnosticFailureCount, reportOriginalVerificationStreamDiagnostic } from "./original-verification-stream-diagnostic";

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
const fakeClock = () => vi.useFakeTimers({ toFake: ["Date", "performance", "setTimeout", "clearTimeout"] });
describe("original stream, synthetic SDK and Web Stream boundaries", () => {
  test.each([0, -1, 1.5, NaN, Infinity, MAX_DOCUMENT_SIZE_BYTES + 1, Number.MAX_SAFE_INTEGER, "1", undefined])(
    "rejects invalid runtime size before the SDK: %s", async (byteSize) => {
      const f = fixture();
      await expect(f.store.readOriginal({ ...f.claim, byteSize } as unknown as OriginalVerificationClaim, f.controller.signal))
        .rejects.toMatchObject({ code: "INTEGRITY" });
      expect(f.from).not.toHaveBeenCalled(); expect(f.download).not.toHaveBeenCalled();
    });
  test.each(["expired", "future_claim", "long_lease", "invalid_claim", "invalid_expiry", "nonpositive_lease"])(
    "denies the runtime lease before the SDK: %s", async (kind) => {
      const f = fixture(), now = Date.now();
      const claim = { ...f.claim };
      if (kind === "expired") claim.leaseExpiresAt = new Date(now).toISOString();
      if (kind === "future_claim") claim.claimedAt = new Date(now + 1000).toISOString();
      if (kind === "long_lease") claim.leaseExpiresAt = new Date(now + 60_001).toISOString();
      if (kind === "invalid_claim") claim.claimedAt = "invalid";
      if (kind === "invalid_expiry") claim.leaseExpiresAt = "infinity";
      if (kind === "nonpositive_lease") claim.leaseExpiresAt = claim.claimedAt;
      await expect(f.store.readOriginal(claim, f.controller.signal)).rejects.toMatchObject({ code: "UNAVAILABLE" });
      expect(f.download).not.toHaveBeenCalled();
    });
  test.each([1, MAX_DOCUMENT_SIZE_BYTES])("admits valid size %s without changing its cap", async (byteSize) => {
    const f = fixture(); f.asStream.mockResolvedValue({ error: { message: "denied" }, data: null });
    await expect(f.store.readOriginal({ ...f.claim, byteSize }, f.controller.signal)).rejects.toMatchObject({ code: "UNAVAILABLE" });
    expect(f.download).toHaveBeenCalledOnce();
  });
  test("accepts the exact 60-second stored lease without extending it", async () => {
    fakeClock(); const f = fixture(); f.claim = { ...f.claim, leaseExpiresAt: new Date(Date.now() + 60_000).toISOString() };
    await expect(f.store.readOriginal(f.claim, f.controller.signal)).resolves.toEqual(new Uint8Array(f.bytes));
  });
  test("copies multiple chunks into one exact private buffer and releases the reader", async () => {
    const f = fixture(), body = chunks([f.bytes.subarray(0, 3), f.bytes.subarray(3)]);
    f.asStream.mockResolvedValue({ data: body.stream, error: null });
    const result = await f.store.readOriginal(f.claim, f.controller.signal);
    f.bytes.fill(0);
    expect(result.subarray(0, 3)).toEqual(new Uint8Array([37, 80, 68]));
    expect(result.byteLength).toBe(f.claim.byteSize); expect(body.stream.locked).toBe(false); expect(body.cancel).not.toHaveBeenCalled();
  });
  test.each(["oversized_first", "extra_after_exact", "short_eof", "empty_eof", "empty_chunk", "non_bytes"])(
    "rejects the stream boundary: %s", async (kind) => {
      const f = fixture();
      const values = kind === "oversized_first" ? [new Uint8Array(f.claim.byteSize + 1)]
        : kind === "extra_after_exact" ? [f.bytes, new Uint8Array([1])]
        : kind === "short_eof" ? [f.bytes.subarray(0, 1)] : kind === "empty_eof" ? []
        : kind === "empty_chunk" ? [new Uint8Array(0)] : ["private body"];
      const open = ["oversized_first", "extra_after_exact", "empty_chunk", "non_bytes"].includes(kind);
      const body = chunks(values, !open); f.asStream.mockResolvedValue({ data: body.stream, error: null });
      await expect(f.store.readOriginal(f.claim, f.controller.signal)).rejects.toMatchObject({ code: "INTEGRITY" });
      expect(body.stream.locked).toBe(false);
      if (open) expect(body.cancel).toHaveBeenCalledOnce(); else expect(body.cancel).not.toHaveBeenCalled();
    });
  test("interrupts pending headers and cancels a late body without reading it", async () => {
    const f = fixture(), headers = deferred<{ data: ReadableStream<unknown>; error: null }>(), body = chunks([], false);
    f.asStream.mockReturnValue(headers.promise);
    const result = f.store.readOriginal(f.claim, f.controller.signal);
    const check = expect(result).rejects.toMatchObject({ code: "UNAVAILABLE" });
    f.controller.abort(); await check;
    expect(f.download.mock.calls[0]![2].signal.aborted).toBe(true);
    headers.resolve({ data: body.stream, error: null });
    await vi.waitFor(() => expect(body.cancel).toHaveBeenCalledOnce());
    expect(body.stream.locked).toBe(false);
  });
  test("propagates caller abort to the SDK and interrupts a pending body read", async () => {
    const f = fixture(), body = chunks([], false); f.asStream.mockResolvedValue({ data: body.stream, error: null });
    const result = f.store.readOriginal(f.claim, f.controller.signal);
    const check = expect(result).rejects.toMatchObject({ code: "UNAVAILABLE" });
    await vi.waitFor(() => expect(body.stream.locked).toBe(true));
    f.controller.abort(); await check;
    expect(f.download.mock.calls[0]![2].signal.aborted).toBe(true);
    expect(body.cancel).toHaveBeenCalledOnce(); expect(body.stream.locked).toBe(false);
  });
  test("settles stalled headers at the stored deadline with an arbitrary live caller signal", async () => {
    fakeClock(); const f = fixture(); f.claim = { ...f.claim, leaseExpiresAt: new Date(Date.now() + 20).toISOString() };
    f.asStream.mockReturnValue(new Promise(() => undefined));
    const result = f.store.readOriginal(f.claim, f.controller.signal), check = expect(result).rejects.toMatchObject({ code: "UNAVAILABLE" });
    await vi.advanceTimersByTimeAsync(20); await check;
    expect(f.controller.signal.aborted).toBe(false); expect(f.download.mock.calls[0]![2].signal.aborted).toBe(true);
  });
  test("a wall-clock rewind cannot extend the admitted monotonic read budget", async () => {
    fakeClock(); const f = fixture(); f.claim = { ...f.claim, leaseExpiresAt: new Date(Date.now() + 20).toISOString() };
    f.asStream.mockReturnValue(new Promise(() => undefined));
    const result = f.store.readOriginal(f.claim, f.controller.signal), check = expect(result).rejects.toMatchObject({ code: "UNAVAILABLE" });
    vi.setSystemTime(Date.now() - 60_000);
    await vi.advanceTimersByTimeAsync(20); await check;
    expect(f.download.mock.calls[0]![2].signal.aborted).toBe(true);
  });
  test("rejects a forward wall-clock jump after headers and cleans the unclaimed stream", async () => {
    fakeClock(); const f = fixture(), body = chunks([], false), headers = deferred<{ data: ReadableStream<unknown>; error: null }>();
    f.asStream.mockReturnValue(headers.promise);
    const result = f.store.readOriginal(f.claim, f.controller.signal), check = expect(result).rejects.toMatchObject({ code: "UNAVAILABLE" });
    vi.setSystemTime(Date.now() + 60_000); headers.resolve({ data: body.stream, error: null }); await check;
    expect(body.cancel).toHaveBeenCalledOnce(); expect(body.stream.locked).toBe(false);
  });
  test("makes owned cancellation failure visible without provider details", async () => {
    const f = fixture(), cancel = vi.fn(async () => { throw new Error("private cancellation token"); });
    const body = chunks([new Uint8Array(f.claim.byteSize + 1)], false, cancel);
    f.asStream.mockResolvedValue({ data: body.stream, error: null });
    await expect(f.store.readOriginal(f.claim, f.controller.signal)).rejects.toMatchObject({ code: "INTEGRITY", cleanupFailed: true });
    expect(body.stream.locked).toBe(false);
  });
  test("bounds a cancellation promise that never settles and releases the reader", async () => {
    fakeClock(); const f = fixture(), cancel = vi.fn(() => new Promise<void>(() => undefined));
    const body = chunks([new Uint8Array(f.claim.byteSize + 1)], false, cancel);
    f.asStream.mockResolvedValue({ data: body.stream, error: null });
    const result = f.store.readOriginal(f.claim, f.controller.signal), check = expect(result).rejects.toMatchObject({ code: "INTEGRITY", cleanupFailed: true });
    await vi.advanceTimersByTimeAsync(ORIGINAL_VERIFICATION_CLOSE_MS); await check;
    expect(body.stream.locked).toBe(false);
  });
  test("makes release failure visible rather than returning valid bytes", async () => {
    const f = fixture(), body = chunks([f.bytes]), reader = body.stream.getReader();
    vi.spyOn(body.stream, "getReader").mockReturnValue(reader);
    const release = vi.spyOn(reader, "releaseLock").mockImplementation(() => { throw new Error("private release details"); });
    f.asStream.mockResolvedValue({ data: body.stream, error: null });
    await expect(f.store.readOriginal(f.claim, f.controller.signal)).rejects.toMatchObject({ cleanupFailed: true, code: "UNAVAILABLE" });
    release.mockRestore(); reader.releaseLock();
  });
  test("reports late-header cleanup failure through a constant diagnostic", async () => {
    const f = fixture(), headers = deferred<{ data: ReadableStream<unknown>; error: null }>();
    const body = chunks([], false, vi.fn(async () => { throw new Error("private cleanup detail"); }));
    const diagnostic = vi.spyOn(console, "error").mockImplementation(() => undefined);
    f.asStream.mockReturnValue(headers.promise);
    const result = f.store.readOriginal(f.claim, f.controller.signal), check = expect(result).rejects.toMatchObject({ code: "UNAVAILABLE" });
    f.controller.abort(); await check; headers.resolve({ data: body.stream, error: null });
    await vi.waitFor(() => expect(diagnostic).toHaveBeenCalledWith("Original verification late stream cleanup failed"));
    expect(diagnostic).toHaveBeenCalledOnce();
  });
  test("never records verification or retries after the actual store read expires", async () => {
    fakeClock(); const f = fixture(), body = chunks([], false);
    f.claim = { ...f.claim, leaseExpiresAt: new Date(Date.now() + 20).toISOString() };
    f.asStream.mockResolvedValue({ data: body.stream, error: null });
    const repository = { claim: vi.fn(async () => f.claim), leaseIsCurrent: vi.fn(async () => true), finish: vi.fn(async () => null) };
    const result = runOriginalVerification(f.claim.jobId, { store: f.store, repository });
    await vi.advanceTimersByTimeAsync(20);
    await expect(result).resolves.toEqual({ outcome: "lease_lost" });
    expect(repository.finish).not.toHaveBeenCalled(); expect(f.download).toHaveBeenCalledOnce();
  });
  test("discards a reader result that arrives after caller abort without copying late bytes", async () => {
    const f = fixture(), body = chunks([], false), reader = body.stream.getReader();
    const pending = deferred<ReadableStreamReadResult<unknown>>();
    vi.spyOn(body.stream, "getReader").mockReturnValue(reader);
    const read = vi.spyOn(reader, "read").mockReturnValue(pending.promise);
    f.asStream.mockResolvedValue({ data: body.stream, error: null });
    const copy = vi.spyOn(Uint8Array.prototype, "set");
    const result = f.store.readOriginal(f.claim, f.controller.signal), check = expect(result).rejects.toMatchObject({ code: "UNAVAILABLE" });
    await vi.waitFor(() => expect(read).toHaveBeenCalledOnce()); f.controller.abort(); await check;
    pending.resolve({ done: false, value: f.bytes });
    await Promise.resolve(); await Promise.resolve();
    expect(copy).not.toHaveBeenCalled(); expect(read).toHaveBeenCalledOnce();
    expect(body.cancel).toHaveBeenCalledOnce(); expect(body.stream.locked).toBe(false);
  });
  test("cleans an unexpected body even when the provider also returns a denial", async () => {
    const f = fixture(), body = chunks([], false);
    f.asStream.mockResolvedValue({ data: body.stream, error: { message: "private denial" } });
    await expect(f.store.readOriginal(f.claim, f.controller.signal)).rejects.toMatchObject({ code: "UNAVAILABLE" });
    expect(body.cancel).toHaveBeenCalledOnce(); expect(body.stream.locked).toBe(false);
  });
  test("does not leak a stream read failure or return partial bytes", async () => {
    const f = fixture(), body = new ReadableStream<unknown>({ start(controller) { controller.error(new Error("private byte-read token")); } });
    f.asStream.mockResolvedValue({ data: body, error: null });
    const error = await f.store.readOriginal(f.claim, f.controller.signal).then(() => null, (reason: unknown) => reason);
    expect(error).toMatchObject({ code: "UNAVAILABLE", message: "Original verification read failed" });
    expect(body.locked).toBe(false);
  });
  test("uses the admitted size snapshot if a direct caller mutates its claim during headers", async () => {
    const f = fixture(), expectedSize = f.claim.byteSize;
    f.asStream.mockImplementation(async () => {
      Object.assign(f.claim, { byteSize: MAX_DOCUMENT_SIZE_BYTES + 1 });
      return { data: new Blob([f.bytes]).stream(), error: null };
    });
    const result = await f.store.readOriginal(f.claim, f.controller.signal);
    expect(result.byteLength).toBe(expectedSize); expect(result).toEqual(new Uint8Array(f.bytes));
  });
  test("settles stalled body reads at the stored deadline without caller cancellation", async () => {
    fakeClock(); const f = fixture(), body = chunks([], false);
    f.claim = { ...f.claim, leaseExpiresAt: new Date(Date.now() + 20).toISOString() };
    f.asStream.mockResolvedValue({ data: body.stream, error: null });
    const result = f.store.readOriginal(f.claim, f.controller.signal), check = expect(result).rejects.toMatchObject({ code: "UNAVAILABLE" });
    await vi.advanceTimersByTimeAsync(20); await check;
    expect(f.controller.signal.aborted).toBe(false); expect(f.download.mock.calls[0]![2].signal.aborted).toBe(true);
    expect(body.cancel).toHaveBeenCalledOnce(); expect(body.stream.locked).toBe(false);
  });
  test("denies a native prelocked stream without releasing another owner's reader", async () => {
    const f = fixture(), body = chunks([], false), otherReader = body.stream.getReader();
    const release = vi.spyOn(otherReader, "releaseLock");
    f.asStream.mockResolvedValue({ data: body.stream, error: null });
    try {
      await expect(f.store.readOriginal(f.claim, f.controller.signal)).rejects.toMatchObject({ code: "UNAVAILABLE", cleanupFailed: true });
      expect(body.stream.locked).toBe(true);
      expect(release).not.toHaveBeenCalled(); expect(body.cancel).not.toHaveBeenCalled();
    } finally {
      release.mockRestore(); await otherReader.cancel(); otherReader.releaseLock();
    }
  });
  test("contains a throwing late-header callback with a fixed terminal diagnostic", async () => {
    const f = fixture(), headers = deferred<{ data: ReadableStream<unknown>; error: null }>();
    const diagnostic = vi.spyOn(console, "error").mockImplementation(() => undefined);
    f.asStream.mockReturnValue(headers.promise);
    const result = f.store.readOriginal(f.claim, f.controller.signal), check = expect(result).rejects.toMatchObject({ code: "UNAVAILABLE" });
    f.controller.abort(); await check;
    const lateResult = { get data(): ReadableStream<unknown> { throw new Error("private callback token"); }, error: null };
    headers.resolve(lateResult);
    await vi.waitFor(() => expect(diagnostic).toHaveBeenCalledWith("Original verification late settlement failed"));
    expect(diagnostic).toHaveBeenCalledOnce();
    await expect(result).rejects.toMatchObject({ code: "UNAVAILABLE", message: "Original verification read failed" });
  });
  test("contains a throwing diagnostic sink and retains bounded internal failure evidence", async () => {
    const f = fixture(), headers = deferred<{ data: ReadableStream<unknown>; error: null }>();
    const body = chunks([], false, vi.fn(async () => { throw new Error("private cancellation token"); }));
    const before = originalVerificationDiagnosticFailureCount();
    const diagnostic = vi.spyOn(console, "error").mockImplementation(() => { throw new Error("private sink token"); });
    f.asStream.mockReturnValue(headers.promise);
    const result = f.store.readOriginal(f.claim, f.controller.signal), check = expect(result).rejects.toMatchObject({ code: "UNAVAILABLE" });
    f.controller.abort(); await check; headers.resolve({ data: body.stream, error: null });
    await vi.waitFor(() => expect(diagnostic).toHaveBeenCalledOnce());
    expect(diagnostic).toHaveBeenCalledWith("Original verification late stream cleanup failed");
    expect(originalVerificationDiagnosticFailureCount()).toBe(Math.min(ORIGINAL_VERIFICATION_DIAGNOSTIC_FAILURE_LIMIT, before + 1));
    await expect(result).rejects.toMatchObject({ code: "UNAVAILABLE", message: "Original verification read failed" });
  });
  test("observes cancellation rejection after the late cleanup wait already timed out", async () => {
    fakeClock(); const f = fixture(), headers = deferred<{ data: ReadableStream<unknown>; error: null }>();
    const cancellation = deferred<void>(), cancel = vi.fn(() => cancellation.promise), body = chunks([], false, cancel);
    const diagnostic = vi.spyOn(console, "error").mockImplementation(() => undefined);
    f.asStream.mockReturnValue(headers.promise);
    const result = f.store.readOriginal(f.claim, f.controller.signal), check = expect(result).rejects.toMatchObject({ code: "UNAVAILABLE" });
    f.controller.abort(); await check; headers.resolve({ data: body.stream, error: null });
    await vi.advanceTimersByTimeAsync(0); expect(cancel).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(ORIGINAL_VERIFICATION_CLOSE_MS);
    expect(diagnostic).toHaveBeenCalledExactlyOnceWith("Original verification late stream cleanup failed");
    cancellation.reject(new Error("private delayed cancellation token"));
    await vi.advanceTimersByTimeAsync(0);
    expect(diagnostic).toHaveBeenCalledExactlyOnceWith("Original verification late stream cleanup failed");
    await expect(result).rejects.toMatchObject({ code: "UNAVAILABLE" });
  });
  test("saturates diagnostic failure evidence without storing private sink errors", () => {
    const before = originalVerificationDiagnosticFailureCount();
    const diagnostic = vi.spyOn(console, "error").mockImplementation(() => { throw new Error("private sink token"); });
    for (let count = 0; count <= ORIGINAL_VERIFICATION_DIAGNOSTIC_FAILURE_LIMIT; count += 1) {
      expect(() => reportOriginalVerificationStreamDiagnostic("late_settlement")).not.toThrow();
    }
    expect(originalVerificationDiagnosticFailureCount()).toBe(ORIGINAL_VERIFICATION_DIAGNOSTIC_FAILURE_LIMIT);
    expect(originalVerificationDiagnosticFailureCount()).toBeGreaterThanOrEqual(before);
    expect(diagnostic).toHaveBeenCalledTimes(ORIGINAL_VERIFICATION_DIAGNOSTIC_FAILURE_LIMIT + 1);
    expect(diagnostic.mock.calls.every((args) => args.length === 1 && args[0] === "Original verification late settlement failed")).toBe(true);
  });
  test("the actual worker records document_integrity after overflow and cancellation rejection without retry", async () => {
    const f = fixture(), cancel = vi.fn(async () => { throw new Error("private cancellation token"); });
    const body = chunks([new Uint8Array(f.claim.byteSize + 1)], false, cancel);
    f.asStream.mockResolvedValue({ data: body.stream, error: null });
    const repository = {
      claim: vi.fn(async (): Promise<unknown> => f.claim),
      leaseIsCurrent: vi.fn(async (): Promise<unknown> => true),
      finish: vi.fn(async (_claim: OriginalVerificationClaim, completion: OriginalVerificationCompletion): Promise<unknown> =>
        ({ jobId: f.claim.jobId, accessId: f.claim.accessId, state: completion.state, revision: 3, outcomeCode: "recorded" })),
    };
    await expect(runOriginalVerification(f.claim.jobId, { repository, store: f.store }))
      .resolves.toEqual({ outcome: "recorded", jobId: f.claim.jobId, state: "failed" });
    expect(repository.finish).toHaveBeenCalledOnce();
    expect(repository.finish.mock.calls[0]![1]).toEqual({ state: "failed", failureCode: "document_integrity" });
    expect(repository.finish).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ state: "verified" }), expect.anything());
    expect(repository.claim).toHaveBeenCalledOnce(); expect(repository.leaseIsCurrent).toHaveBeenCalledOnce();
    expect(f.download).toHaveBeenCalledOnce(); expect(f.asStream).toHaveBeenCalledOnce();
    expect(cancel).toHaveBeenCalledOnce(); expect(body.stream.locked).toBe(false);
  });
  test("the actual worker records document_integrity after short EOF and release failure without retry", async () => {
    const f = fixture(), body = chunks([f.bytes.subarray(0, 1)]), reader = body.stream.getReader();
    vi.spyOn(body.stream, "getReader").mockReturnValue(reader);
    const release = vi.spyOn(reader, "releaseLock").mockImplementation(() => { throw new Error("private release token"); });
    f.asStream.mockResolvedValue({ data: body.stream, error: null });
    const repository = {
      claim: vi.fn(async (): Promise<unknown> => f.claim),
      leaseIsCurrent: vi.fn(async (): Promise<unknown> => true),
      finish: vi.fn(async (_claim: OriginalVerificationClaim, completion: OriginalVerificationCompletion): Promise<unknown> =>
        ({ jobId: f.claim.jobId, accessId: f.claim.accessId, state: completion.state, revision: 3, outcomeCode: "recorded" })),
    };
    try {
      await expect(runOriginalVerification(f.claim.jobId, { repository, store: f.store }))
        .resolves.toEqual({ outcome: "recorded", jobId: f.claim.jobId, state: "failed" });
      expect(repository.finish).toHaveBeenCalledOnce();
      expect(repository.finish.mock.calls[0]![1]).toEqual({ state: "failed", failureCode: "document_integrity" });
      expect(repository.finish).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ state: "verified" }), expect.anything());
      expect(repository.claim).toHaveBeenCalledOnce(); expect(repository.leaseIsCurrent).toHaveBeenCalledOnce();
      expect(f.download).toHaveBeenCalledOnce(); expect(f.asStream).toHaveBeenCalledOnce();
      expect(release).toHaveBeenCalledOnce(); expect(body.cancel).not.toHaveBeenCalled();
    } finally {
      release.mockRestore(); reader.releaseLock();
    }
    expect(body.stream.locked).toBe(false);
  });
  test("aborts the owned SDK signal before rejecting cancellation without changing caller or integrity", async () => {
    const f = fixture(), observed: { sdkAborted?: boolean; callerAborted?: boolean } = {};
    const cancel = vi.fn(async () => {
      observed.sdkAborted = f.download.mock.calls[0]![2].signal.aborted;
      observed.callerAborted = f.controller.signal.aborted;
      throw new Error("private cancellation token");
    });
    const body = chunks([new Uint8Array(f.claim.byteSize + 1)], false, cancel);
    f.asStream.mockResolvedValue({ data: body.stream, error: null });
    await expect(f.store.readOriginal(f.claim, f.controller.signal))
      .rejects.toMatchObject({ code: "INTEGRITY", cleanupFailed: true, message: "Original verification read failed" });
    expect(cancel).toHaveBeenCalledOnce();
    expect(observed).toEqual({ sdkAborted: true, callerAborted: false });
    expect(f.controller.signal.aborted).toBe(false);
    expect(f.download.mock.calls[0]![2].signal.aborted).toBe(true);
    expect(body.stream.locked).toBe(false);
  });
});
