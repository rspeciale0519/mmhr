import "server-only";

import { z } from "zod";
import { MAX_DOCUMENT_SIZE_BYTES } from "@/server/workflows/document-safety";
import { ORIGINAL_VERIFICATION_CLOSE_MS } from "./original-verification-execution";
import { reportOriginalVerificationStreamDiagnostic } from "./original-verification-stream-diagnostic";
import { OriginalVerificationReadError, type OriginalVerificationClaim } from "./original-verification-worker";

type DownloadResult = Readonly<{ data: ReadableStream<unknown> | null; error: unknown }>;
type Download = (signal: AbortSignal) => PromiseLike<DownloadResult>;
const instant = z.iso.datetime({ offset: true });
const readError = () => new OriginalVerificationReadError("UNAVAILABLE");
class CleanupReadError extends OriginalVerificationReadError {
  readonly cleanupFailed = true;
  constructor(code: "UNAVAILABLE" | "INTEGRITY" = "UNAVAILABLE") { super(code); }
}

/** Observes late settlement without permitting late bytes to enter the output buffer. */
function interruptible<T>(operation: PromiseLike<T>, signal: AbortSignal, late?: (value: T) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const abort = () => {
      if (settled) return;
      settled = true; signal.removeEventListener("abort", abort); reject(readError());
    };
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    void Promise.resolve(operation).then((value) => {
      if (settled) { late?.(value); return; }
      settled = true; signal.removeEventListener("abort", abort); resolve(value);
    }, () => {
      if (settled) return;
      settled = true; signal.removeEventListener("abort", abort); reject(readError());
    }).catch(() => reportOriginalVerificationStreamDiagnostic("late_settlement"));
  });
}

/** Bounds waiting, not the provider's physical termination. Rejections stay sanitized. */
async function cancelBounded(cancel: () => PromiseLike<unknown>): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.resolve().then(cancel),
      new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new CleanupReadError()), ORIGINAL_VERIFICATION_CLOSE_MS); }),
    ]);
  } catch { throw new CleanupReadError(); }
  finally { if (timer !== undefined) clearTimeout(timer); }
}

function cleanLateHeaders(result: DownloadResult): void {
  if (!result?.data) return;
  // The read already settled. This constant diagnostic retains cleanup failure without private error details.
  void cancelBounded(() => result.data!.cancel()).catch(() => {
    reportOriginalVerificationStreamDiagnostic("late_cleanup");
  });
}

/** Fixed-size copy with independent lease admission; no Blob or whole-body materialization. */
export async function readOriginalVerificationStream(
  claim: OriginalVerificationClaim, callerSignal: AbortSignal, download: Download,
): Promise<Uint8Array> {
  const expectedSize = claim?.byteSize;
  if (!Number.isSafeInteger(expectedSize) || expectedSize < 1 || expectedSize > MAX_DOCUMENT_SIZE_BYTES) {
    throw new OriginalVerificationReadError("INTEGRITY");
  }
  const wallNow = Date.now(), monotonicNow = globalThis.performance.now();
  const claimedAt = claim.claimedAt, leaseExpiresAt = claim.leaseExpiresAt;
  if (!instant.safeParse(claimedAt).success || !instant.safeParse(leaseExpiresAt).success) throw readError();
  const claimed = Date.parse(claimedAt), expires = Date.parse(leaseExpiresAt);
  if (!Number.isFinite(wallNow) || !Number.isFinite(monotonicNow) || !Number.isFinite(claimed) || !Number.isFinite(expires)
    || claimed > wallNow || expires <= wallNow || expires <= claimed || expires - claimed > 60_000 || callerSignal.aborted) throw readError();
  const remaining = Math.min(60_000, expires - wallNow);
  const monotonicDeadline = monotonicNow + remaining;
  const owned = new AbortController();
  const signal = AbortSignal.any([callerSignal, owned.signal]);
  const timer = setTimeout(() => owned.abort(), remaining);
  const current = () => {
    if (signal.aborted || Date.now() >= expires || globalThis.performance.now() >= monotonicDeadline) {
      owned.abort(); throw readError();
    }
  };
  let reader: ReadableStreamDefaultReader<unknown> | undefined;
  let stream: ReadableStream<unknown> | undefined;
  let done = false;
  let primary: unknown;
  let output: Uint8Array | undefined;
  try {
    current();
    const result = await interruptible(download(signal), signal, cleanLateHeaders);
    stream = result.data ?? undefined;
    current();
    if (result.error || !stream) throw readError();
    reader = stream.getReader();
    output = new Uint8Array(expectedSize);
    let offset = 0;
    while (true) {
      current();
      const chunk = await interruptible(reader.read(), signal);
      current();
      if (chunk.done === true) { done = true; break; }
      if (chunk.done !== false || !(chunk.value instanceof Uint8Array) || chunk.value.byteLength === 0
        || chunk.value.byteLength > expectedSize - offset) throw new OriginalVerificationReadError("INTEGRITY");
      output.set(chunk.value, offset);
      offset += chunk.value.byteLength;
    }
    if (offset !== expectedSize) throw new OriginalVerificationReadError("INTEGRITY");
    current();
  } catch (error) {
    primary = error instanceof OriginalVerificationReadError ? error : readError();
  } finally {
    owned.abort();
    clearTimeout(timer);
    let cleanupFailed = false;
    if (reader) {
      if (!done) {
        try { await cancelBounded(() => reader!.cancel()); }
        catch { cleanupFailed = true; }
      }
      try { reader.releaseLock(); }
      catch { cleanupFailed = true; }
    } else if (stream) {
      try { await cancelBounded(() => stream!.cancel()); }
      catch { cleanupFailed = true; }
    }
    if (cleanupFailed) primary = new CleanupReadError(primary instanceof OriginalVerificationReadError ? primary.code : "UNAVAILABLE");
  }
  if (primary) throw primary;
  if (!output) throw readError();
  return output;
}
