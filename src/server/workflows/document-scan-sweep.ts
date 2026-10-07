import "server-only";

import { z } from "zod";

import { runDocumentScan, type DocumentScanRepository, type DocumentScanWorkerResult } from "./document-scan-worker";
import type { DocumentScanner } from "./document-scanner";
import type { DocumentStore } from "./document-store";

const candidateSchema = z.array(z.uuid().transform((id) => id.toLowerCase())).max(5).refine((ids) => new Set(ids).size === ids.length);
type ScanDependencies = {
  repository: DocumentScanRepository & { listCandidateIds(): Promise<unknown> };
  store: Pick<DocumentStore, "readForScan">;
  scanner: DocumentScanner;
};
export type DocumentScanSweepResult =
  | Readonly<{ outcome: "failed"; code: "queue_unavailable" | "invalid_queue" }>
  | Readonly<{ outcome: "completed" | "needs_attention" | "yielded";
      items: ReadonlyArray<Readonly<{ versionId: string; result: DocumentScanWorkerResult }>> }>;

/** Read the bounded durable queue once. Per-job lease and retry decisions stay in PostgreSQL. */
export async function runDocumentScanSweep(dependencies: ScanDependencies): Promise<DocumentScanSweepResult> {
  let candidates: unknown;
  try { candidates = await dependencies.repository.listCandidateIds(); }
  catch { return { outcome: "failed", code: "queue_unavailable" }; }
  const parsed = candidateSchema.safeParse(candidates);
  if (!parsed.success) return { outcome: "failed", code: "invalid_queue" };
  const items: Array<Readonly<{ versionId: string; result: DocumentScanWorkerResult }>> = [];
  const deadline = Date.now() + 90_000;
  for (const versionId of parsed.data) {
    if (Date.now() >= deadline) return Object.freeze({ outcome: "yielded", items: Object.freeze(items) });
    const result = await runDocumentScan(versionId, dependencies);
    items.push(Object.freeze({ versionId, result: Object.freeze(result) }));
    // Unknown completion may already have committed. Stop without retrying it
    // or processing more work through an uncertain authority/provider boundary.
    if (result.outcome === "failed") return Object.freeze({ outcome: "needs_attention", items: Object.freeze(items) });
  }
  return Object.freeze({ outcome: "completed", items: Object.freeze(items) });
}
