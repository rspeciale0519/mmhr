import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { receiptTimingHttp, receiptTimingQuery, withReceiptTimingRestoration } from "./r4-rfp-receipt-timing-controls";

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe("Owned receipt timing cancellation and restoration", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test("passes the actual HTTP signal and clears its deadline after success", async () => {
    let signal: AbortSignal | undefined;
    const value = await receiptTimingHttp(current => { signal = current; return Promise.resolve({ saved: true }); }, 100);
    expect(value).toEqual({ saved: true }); expect(signal?.aborted).toBe(true); expect(vi.getTimerCount()).toBe(0);
  });
  test("preserves an HTTP rejection and clears owned timers", async () => {
    const error = new Error("Synthetic HTTP failure"); let signal: AbortSignal | undefined;
    const result = await receiptTimingHttp(current => { signal = current; return Promise.reject(error); }, 100).catch(value => value);
    expect(result).toBe(error); expect(signal?.aborted).toBe(true); expect(vi.getTimerCount()).toBe(0);
  });
  test("protects synchronous dispatch failures with the same signal cleanup", async () => {
    const error = new Error("Synthetic dispatch failure"); let signal: AbortSignal | undefined;
    const result = await receiptTimingHttp(current => { signal = current; throw error; }, 100).catch(value => value);
    expect(result).toBe(error); expect(signal?.aborted).toBe(true); expect(vi.getTimerCount()).toBe(0);
  });
  test("aborts the HTTP request and retains its original settled rejection", async () => {
    const pending = deferred<unknown>(), cancellation = new Error("Synthetic abort rejection"); let signal: AbortSignal | undefined;
    const result = receiptTimingHttp(current => {
      signal = current; current.addEventListener("abort", () => pending.reject(cancellation), { once: true }); return pending.promise;
    }, 100).catch(error => error);
    await vi.advanceTimersByTimeAsync(100);
    const error = await result;
    expect(error).toBeInstanceOf(AggregateError);
    if (!(error instanceof AggregateError)) throw error;
    expect(error.errors).toContain(cancellation);
    expect(error.message).toContain("cancellation settled"); expect(signal?.aborted).toBe(true); expect(vi.getTimerCount()).toBe(0);
  });
  test("rejects a late HTTP success after its deadline", async () => {
    const pending = deferred<string>();
    const result = receiptTimingHttp(signal => {
      signal.addEventListener("abort", () => pending.resolve("late success"), { once: true }); return pending.promise;
    }, 100).catch(error => error);
    await vi.advanceTimersByTimeAsync(100);
    const error = await result;
    expect(error).toBeInstanceOf(AggregateError); expect(error.message).toContain("deadline failed"); expect(vi.getTimerCount()).toBe(0);
  });
  test("fails when the original HTTP request does not settle after abort", async () => {
    const pending = deferred<unknown>(); let signal: AbortSignal | undefined;
    const result = receiptTimingHttp(current => { signal = current; return pending.promise; }, 100).catch(error => error);
    await vi.advanceTimersByTimeAsync(1100);
    const error = await result;
    expect(error).toBeInstanceOf(AggregateError);
    if (!(error instanceof AggregateError)) throw error;
    expect(error.message).toContain("remains unresolved");
    expect(signal?.aborted).toBe(true); expect(vi.getTimerCount()).toBe(0);
    pending.resolve(null); await pending.promise;
  });
  test("does not cancel a successful owner query", async () => {
    const cancel = vi.fn(), pending = Object.assign(Promise.resolve(7), { cancel });
    expect(await receiptTimingQuery(pending, "synthetic owner", 100)).toBe(7);
    expect(cancel).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });
  test("uses real query cancellation and observes the original query rejection", async () => {
    const pending = deferred<number>(), cancellation = new Error("Synthetic SQL cancellation");
    const cancel = vi.fn(() => pending.reject(cancellation));
    const result = receiptTimingQuery(Object.assign(pending.promise, { cancel }), "synthetic owner", 100).catch(error => error);
    await vi.advanceTimersByTimeAsync(100);
    const error = await result;
    expect(error).toBeInstanceOf(AggregateError); expect(error.errors).toContain(cancellation);
    expect(cancel).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });
  test("rejects unresolved owner cancellation without accepting a late result", async () => {
    const pending = deferred<number>(), cancel = vi.fn();
    const result = receiptTimingQuery(Object.assign(pending.promise, { cancel }), "synthetic owner", 100).catch(error => error);
    await vi.advanceTimersByTimeAsync(1100);
    const error = await result;
    expect(error).toBeInstanceOf(AggregateError); expect(error.message).toContain("remains unresolved");
    expect(cancel).toHaveBeenCalledTimes(2); expect(vi.getTimerCount()).toBe(0);
    pending.resolve(9); await pending.promise;
  });
  test("retains cancellation exceptions and the original query settlement", async () => {
    const pending = deferred<number>(), cancellation = new Error("Synthetic cancel transport failure");
    const cancel = vi.fn(() => { pending.reject(cancellation); throw cancellation; });
    const result = receiptTimingQuery(Object.assign(pending.promise, { cancel }), "synthetic owner", 100).catch(error => error);
    await vi.advanceTimersByTimeAsync(100);
    const error = await result;
    expect(error).toBeInstanceOf(AggregateError); expect(error.errors).toContain(cancellation);
    expect(error.errors.some((item: unknown) => item instanceof AggregateError && item.errors.includes(cancellation))).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
  test("restores state after a successful assertion", async () => {
    const restore = vi.fn(async () => {});
    await withReceiptTimingRestoration(async () => {}, restore); expect(restore).toHaveBeenCalledOnce();
  });
  test("preserves the primary assertion after successful restoration", async () => {
    const primary = new Error("Synthetic assertion failure"), restore = vi.fn(async () => {});
    const result = await withReceiptTimingRestoration(async () => { throw primary; }, restore).catch(error => error);
    expect(result).toBe(primary); expect(restore).toHaveBeenCalledOnce();
  });
  test("retains the assertion and restoration failures together", async () => {
    const primary = new Error("Synthetic assertion failure"), cleanup = new Error("Synthetic restoration failure");
    const result = await withReceiptTimingRestoration(async () => { throw primary; }, async () => { throw cleanup; }).catch(error => error);
    expect(result).toBeInstanceOf(AggregateError); expect(result.errors).toEqual([primary, cleanup]);
  });
  test("fails if restoration fails after a successful assertion", async () => {
    const cleanup = new Error("Synthetic restoration failure");
    const result = await withReceiptTimingRestoration(async () => {}, async () => { throw cleanup; }).catch(error => error);
    expect(result).toBe(cleanup);
  });
});
