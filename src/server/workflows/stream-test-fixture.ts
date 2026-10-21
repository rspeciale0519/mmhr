import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { vi } from "vitest";
import { createOriginalVerificationStore } from "./original-verification-store";
import type { OriginalVerificationClaim } from "./original-verification-worker";

export function fixture() {
  const bytes = Buffer.from("%PDF-1.7\nSynthetic read");
  const claim: OriginalVerificationClaim = { jobId: randomUUID(), accessId: randomUUID(), organizationId: randomUUID(),
    documentId: randomUUID(), versionId: randomUUID(), uploadRevision: 4, purpose: "finance_review", leaseToken: randomUUID(),
    revision: 2, claimedAt: new Date().toISOString(), leaseExpiresAt: new Date(Date.now() + 30_000).toISOString(),
    fileName: "synthetic.pdf", contentType: "application/pdf", byteSize: bytes.length, sha256: "a".repeat(64) };
  const asStream = vi.fn(async (): Promise<{ error: unknown; data: ReadableStream<unknown> | null }> =>
    ({ error: null, data: new Blob([bytes]).stream() }));
  const materializeBlob = vi.fn(() => { throw new Error("Blob download must not execute"); });
  const download = vi.fn<(path: string, options: object, parameters: { signal: AbortSignal }) =>
    { asStream: typeof asStream; then: typeof materializeBlob }>(() => ({ asStream, then: materializeBlob }));
  const from = vi.fn(() => ({ download }));
  // This synthetic port proves no genuine Auth, Storage, socket, or provider behavior.
  const store = createOriginalVerificationStore({ storage: { from } } as unknown as SupabaseClient);
  return { claim, bytes, from, download, asStream, materializeBlob, store, controller: new AbortController() };
}
export function chunks(values: unknown[], close = true, cancel: (reason?: unknown) => void | PromiseLike<void> = vi.fn(async () => undefined)) {
  const stream = new ReadableStream<unknown>({
    start(controller) { for (const value of values) controller.enqueue(value); if (close) controller.close(); },
    cancel,
  });
  return { stream, cancel };
}
export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
