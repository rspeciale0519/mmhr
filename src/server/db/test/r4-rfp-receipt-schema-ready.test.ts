import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { PostgrestClient } from "@supabase/postgrest-js";
import { waitForRfpReceiptStatusSchema } from "./r4-rfp-receipt-schema-ready";

function clock() {
  return { now: () => Date.now(), schedule: vi.fn((callback: () => void, milliseconds: number) => {
    const timer = setTimeout(callback, milliseconds);
    return () => clearTimeout(timer);
  }) };
}

describe("additive receipt status RPC readiness", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(0); });
  afterEach(() => { expect(vi.getTimerCount()).toBe(0); vi.useRealTimers(); });
  test("accepts only a recognized anonymous permission denial", async () => {
    const time = clock(), probe = vi.fn(async () => ({ error: { code: "42501" } }));
    await waitForRfpReceiptStatusSchema(probe, time);
    expect(probe).toHaveBeenCalledTimes(1); expect(time.schedule).toHaveBeenCalledTimes(1);
  });
  test("retries only schema-cache misses before accepting the protected RPC", async () => {
    const time = clock(), probe = vi.fn().mockResolvedValueOnce({ error: { code: "PGRST202" } })
      .mockResolvedValueOnce({ error: { code: "PGRST202" } }).mockResolvedValue({ error: { code: "42501" } });
    const pending = waitForRfpReceiptStatusSchema(probe, time);
    await vi.advanceTimersByTimeAsync(500); await pending;
    expect(probe).toHaveBeenCalledTimes(3); expect(time.now()).toBe(500);
  });
  test.each(["22023", "PGRST301", "08006"])("fails immediately for unexpected code %s", async code => {
    const time = clock(), probe = vi.fn(async () => ({ error: { code } }));
    await expect(waitForRfpReceiptStatusSchema(probe, time)).rejects.toThrow("RFP receipt status schema readiness failed");
    expect(probe).toHaveBeenCalledTimes(1); expect(time.schedule).toHaveBeenCalledTimes(1);
  });
  test("rejects an unexpected successful anonymous response", async () => {
    const time = clock(), probe = vi.fn(async () => ({ error: null }));
    await expect(waitForRfpReceiptStatusSchema(probe, time)).rejects.toThrow("RFP receipt status schema readiness failed");
    expect(probe).toHaveBeenCalledTimes(1); expect(time.schedule).toHaveBeenCalledTimes(1);
  });
  test("keeps the existing 30-second readiness bound", async () => {
    const time = clock(), probe = vi.fn(async () => ({ error: { code: "PGRST202" } }));
    const rejected = expect(waitForRfpReceiptStatusSchema(probe, time)).rejects.toThrow("RFP receipt status schema did not become ready");
    await vi.advanceTimersByTimeAsync(30_000); await rejected;
    expect(time.now()).toBe(30_000); expect(probe).toHaveBeenCalledTimes(120);
  });
  test("rejects a denial that arrives after the readiness deadline", async () => {
    const time = clock(), probe = vi.fn(async () => {
      await new Promise(resolve => setTimeout(resolve, 30_000)); return { error: { code: "42501" } };
    });
    const rejected = expect(waitForRfpReceiptStatusSchema(probe, time)).rejects.toThrow("RFP receipt status schema did not become ready");
    await vi.advanceTimersByTimeAsync(30_000); await rejected;
    expect(probe).toHaveBeenCalledTimes(1);
  });
  test("preserves a transport failure without retry", async () => {
    const time = clock(), error = new Error("Synthetic transport failure"), probe = vi.fn(async () => { throw error; });
    await expect(waitForRfpReceiptStatusSchema(probe, time)).rejects.toBe(error);
    expect(probe).toHaveBeenCalledTimes(1); expect(time.schedule).toHaveBeenCalledTimes(1);
  });
  test("passes the owned signal to the installed RPC fetch and cancels a stalled request", async () => {
    const time = clock(); let active = 0; const observed: AbortSignal[] = [], supplied: AbortSignal[] = [];
    const fetcher = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal; if (!signal) throw new Error("Synthetic fetch signal missing");
      observed.push(signal); active++;
      signal.addEventListener("abort", () => { active--; reject(signal.reason); }, { once: true });
    }));
    const client = new PostgrestClient("http://127.0.0.1:1/rest/v1", { fetch: fetcher });
    const rejected = expect(waitForRfpReceiptStatusSchema(signal => {
      supplied.push(signal);
      return client.rpc("mmhr_get_rfp_receipt_status", { payload: { organizationId: "00000000-0000-4000-8000-000000000001", view: "vendor" },
        correlation_id: "00000000-0000-4000-8000-000000000002" }).abortSignal(signal);
    }, time)).rejects.toThrow("RFP receipt status schema did not become ready");
    await vi.advanceTimersByTimeAsync(0); expect(active).toBe(1); expect(observed[0]).toBe(supplied[0]);
    await vi.advanceTimersByTimeAsync(30_000); await rejected;
    expect(observed[0]?.aborted).toBe(true); expect(active).toBe(0); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  test("consumes a late transport rejection after deadline cancellation", async () => {
    const time = clock(); let rejectLate: (error: Error) => void = () => {}; const signals: AbortSignal[] = [];
    const rejected = expect(waitForRfpReceiptStatusSchema(current => {
      signals.push(current);
      return new Promise<{ error: { code: string } | null }>((_resolve, reject) => { rejectLate = reject; });
    }, time)).rejects.toThrow("RFP receipt status schema did not become ready");
    await vi.advanceTimersByTimeAsync(30_000); await rejected;
    expect(signals[0]?.aborted).toBe(true);
    rejectLate(new Error("Synthetic late transport failure"));
    await vi.advanceTimersByTimeAsync(0);
  });
  test("does not accept a late permission denial after cancellation", async () => {
    const time = clock(); let resolveLate: (value: { error: { code: string } }) => void = () => {};
    const rejected = expect(waitForRfpReceiptStatusSchema(() => new Promise<{ error: { code: string } }>(resolve => { resolveLate = resolve; }), time))
      .rejects.toThrow("RFP receipt status schema did not become ready");
    await vi.advanceTimersByTimeAsync(30_000); await rejected;
    resolveLate({ error: { code: "42501" } }); await vi.advanceTimersByTimeAsync(0);
  });
  test("retains an unexpected database code as the readiness failure cause", async () => {
    const error = { code: "22023" }, time = clock();
    await expect(waitForRfpReceiptStatusSchema(async () => ({ error }), time)).rejects.toMatchObject({ cause: error });
  });
});
