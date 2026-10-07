import "server-only";

import { sql, type SQL } from "drizzle-orm";
import { z } from "zod";

import type { DocumentScanClaim, DocumentScanCompletion, DocumentScanRepository } from "@/server/workflows/document-scan-worker";

export type DocumentScanSqlExecutor = Readonly<{ execute(query: SQL): PromiseLike<unknown> }>;
const uuid = z.uuid();
const leaseSchema = z.strictObject({ versionId: uuid, leaseToken: uuid, revision: z.number().int().positive() });
const candidatesSchema = z.array(z.strictObject({ version_id: uuid })).max(5);

export class DocumentScanRepositoryError extends Error {
  constructor(readonly code: "INVALID_INPUT" | "UNAVAILABLE" | "INVALID_RESPONSE") {
    super("Document processing storage request failed"); this.name = "DocumentScanRepositoryError";
  }
}

/** Inject the dedicated restricted executor. This adapter never selects a database or creates a pool. */
export function createDocumentScanRepository(executor: DocumentScanSqlExecutor): DocumentScanRepository & { listCandidateIds(): Promise<string[]> } {
  async function execute(query: SQL): Promise<unknown> {
    try { return await executor.execute(query); }
    catch { throw new DocumentScanRepositoryError("UNAVAILABLE"); }
  }
  async function field(query: SQL, key: string): Promise<unknown> {
    const rows = await execute(query);
    if (!Array.isArray(rows) || rows.length !== 1 || typeof rows[0] !== "object" || rows[0] === null
      || Object.keys(rows[0]).length !== 1 || !(key in rows[0])) throw new DocumentScanRepositoryError("INVALID_RESPONSE");
    return (rows[0] as Record<string, unknown>)[key];
  }
  function lease(claim: DocumentScanClaim) {
    const parsed = leaseSchema.safeParse({ versionId: claim.versionId, leaseToken: claim.leaseToken, revision: claim.revision });
    if (!parsed.success) throw new DocumentScanRepositoryError("INVALID_INPUT");
    return parsed.data;
  }
  return Object.freeze({
    async listCandidateIds() {
      const parsed = candidatesSchema.safeParse(await execute(sql`SELECT version_id FROM mmhr_private.r4_list_document_scan_candidates()`));
      if (!parsed.success || new Set(parsed.data.map((row) => row.version_id)).size !== parsed.data.length) {
        throw new DocumentScanRepositoryError("INVALID_RESPONSE");
      }
      return parsed.data.map((row) => row.version_id);
    },
    async claim(versionId: string) {
      if (!uuid.safeParse(versionId).success) throw new DocumentScanRepositoryError("INVALID_INPUT");
      return field(sql`SELECT mmhr_private.r4_claim_document_scan(${versionId}::uuid) AS claim`, "claim");
    },
    async leaseIsCurrent(claim: DocumentScanClaim) {
      const value = lease(claim);
      const checked = await field(sql`SELECT mmhr_private.r4_document_scan_lease_is_current(${value.versionId}::uuid,
        ${value.leaseToken}::uuid,${value.revision}::integer) AS checked`, "checked");
      if (typeof checked !== "boolean") throw new DocumentScanRepositoryError("INVALID_RESPONSE");
      return checked;
    },
    async finish(claim: DocumentScanClaim, completion: DocumentScanCompletion) {
      const value = lease(claim);
      return field(sql`SELECT mmhr_private.r4_finish_document_scan(${value.versionId}::uuid,${value.leaseToken}::uuid,
        ${value.revision}::integer,${JSON.stringify(completion)}::jsonb) AS result`, "result");
    },
  });
}
