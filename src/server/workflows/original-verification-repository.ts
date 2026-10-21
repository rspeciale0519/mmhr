import "server-only";

import { sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { OriginalVerificationExecutionContext } from "./original-verification-execution";

import { originalCompletionSchema, type OriginalVerificationClaim, type OriginalVerificationRepository, type OriginalVerificationCompletion } from "./original-verification-worker";

export type OriginalVerificationExecutor = Readonly<{
  execute(query: SQL, context?: OriginalVerificationExecutionContext): PromiseLike<unknown>;
}>;
const uuid = z.uuid();
const leaseSchema = z.strictObject({ jobId: uuid, leaseToken: uuid, revision: z.literal(2) });
const candidatesSchema = z.array(z.strictObject({ job_id: uuid })).max(5);
export class OriginalVerificationRepositoryError extends Error {
  constructor(readonly code: "INVALID_INPUT" | "UNAVAILABLE" | "INVALID_RESPONSE") {
    super("Original verification request failed"); this.name = "OriginalVerificationRepositoryError";
  }
}
/** The injected executor uses only the dedicated verifier login. No pool or credentials are created here. */
export function createOriginalVerificationRepository(executor: OriginalVerificationExecutor):
OriginalVerificationRepository & { listCandidateIds(): Promise<string[]> } {
  async function execute(query: SQL, context?: OriginalVerificationExecutionContext): Promise<unknown> {
    try { return await executor.execute(query, context); }
    catch { throw new OriginalVerificationRepositoryError("UNAVAILABLE"); }
  }
  async function field(query: SQL, key: string, context?: OriginalVerificationExecutionContext): Promise<unknown> {
    const rows = await execute(query, context);
    if (!Array.isArray(rows) || rows.length !== 1 || typeof rows[0] !== "object" || rows[0] === null
      || Object.keys(rows[0]).length !== 1 || !(key in rows[0])) throw new OriginalVerificationRepositoryError("INVALID_RESPONSE");
    return (rows[0] as Record<string, unknown>)[key];
  }
  function lease(claim: OriginalVerificationClaim) {
    const parsed = leaseSchema.safeParse({ jobId: claim.jobId, leaseToken: claim.leaseToken, revision: claim.revision });
    if (!parsed.success) throw new OriginalVerificationRepositoryError("INVALID_INPUT");
    return parsed.data;
  }
  function leaseContext(claim: OriginalVerificationClaim, context?: OriginalVerificationExecutionContext) {
    const deadlineAt = Math.min(Date.parse(claim.leaseExpiresAt), context?.deadlineAt ?? Infinity);
    if (!Number.isFinite(deadlineAt)) throw new OriginalVerificationRepositoryError("INVALID_INPUT");
    return { signal: context?.signal, deadlineAt };
  }
  return Object.freeze({
    async listCandidateIds(context?: OriginalVerificationExecutionContext) {
      const rows = candidatesSchema.safeParse(await execute(sql`SELECT job_id FROM mmhr_private.r7_original_verification_candidates_v1()`, context));
      if (!rows.success || new Set(rows.data.map((row) => row.job_id)).size !== rows.data.length) {
        throw new OriginalVerificationRepositoryError("INVALID_RESPONSE");
      }
      return rows.data.map((row) => row.job_id);
    },
    async claim(jobId: string, context?: OriginalVerificationExecutionContext) {
      if (!uuid.safeParse(jobId).success) throw new OriginalVerificationRepositoryError("INVALID_INPUT");
      return field(sql`SELECT mmhr_private.r7_original_verification_claim_v1(${jobId}::uuid) AS claim`, "claim", context);
    },
    async leaseIsCurrent(claim: OriginalVerificationClaim, context?: OriginalVerificationExecutionContext) {
      const value = lease(claim);
      const result = await field(sql`SELECT mmhr_private.r7_original_verification_lease_current_v1(${value.jobId}::uuid,
        ${value.leaseToken}::uuid,${value.revision}::integer) AS checked`, "checked", leaseContext(claim, context));
      if (typeof result !== "boolean") throw new OriginalVerificationRepositoryError("INVALID_RESPONSE");
      return result;
    },
    async finish(claim: OriginalVerificationClaim, completion: OriginalVerificationCompletion, context?: OriginalVerificationExecutionContext) {
      const value = lease(claim);
      const parsed = originalCompletionSchema.safeParse(completion);
      if (!parsed.success) throw new OriginalVerificationRepositoryError("INVALID_INPUT");
      return field(sql`SELECT mmhr_private.r7_original_verification_finish_v1(${value.jobId}::uuid,${value.leaseToken}::uuid,
        ${value.revision}::integer,${JSON.stringify(parsed.data)}::jsonb) AS result`, "result", leaseContext(claim, context));
    },
  });
}
