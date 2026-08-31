import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { z } from "zod";

import {
  identityIntentClaimSchema, identityIntentOutcomeSchema, identityIntentRequestSchema,
  type IdentityIntentRepository,
} from "@/server/identity/intent-worker-contract";

export type IdentityIntentSqlExecutor = Readonly<{
  execute(query: SQL): PromiseLike<unknown>;
}>;

const claimRowsSchema = z.array(z.strictObject({ claim: identityIntentClaimSchema.nullable() })).length(1);
const resultRowsSchema = z.array(z.strictObject({ result: z.enum(["recorded", "stale_lease"]) })).length(1);
const resultInputSchema = identityIntentRequestSchema.extend({
  leaseToken: identityIntentClaimSchema.options[0].shape.leaseToken,
  outcome: identityIntentOutcomeSchema.refine((outcome) => outcome.outcome !== "failed"
    || outcome.retry !== "safe" || outcome.code === "provider_rejected"),
});

export class IdentityIntentRepositoryError extends Error {
  constructor(readonly code: "INVALID_INPUT" | "UNAVAILABLE" | "INVALID_RESPONSE") {
    super(code === "INVALID_INPUT" ? "Identity intent input is invalid" : "Identity intent storage could not be accessed");
    this.name = "IdentityIntentRepositoryError";
  }
}

/**
 * The server composition root must inject the restricted worker executor.
 * This adapter never creates a pool, chooses a database role, or retries SQL.
 * SQL owns claim eligibility, lease fencing, operation checks, and atomic audit.
 */
export function createIdentityIntentRepository(executor: IdentityIntentSqlExecutor): IdentityIntentRepository {
  async function execute<T>(query: SQL, schema: z.ZodType<T>): Promise<T> {
    let rows: unknown;
    try {
      rows = await executor.execute(query);
    } catch {
      // A lost acknowledgement can follow a committed claim or result. Never
      // repeat the call or expose SQL, connection details, or provider metadata.
      throw new IdentityIntentRepositoryError("UNAVAILABLE");
    }
    const parsed = schema.safeParse(rows);
    if (!parsed.success) throw new IdentityIntentRepositoryError("INVALID_RESPONSE");
    return parsed.data;
  }

  function parseIntentId(intentId: string): string {
    const parsed = identityIntentRequestSchema.safeParse({ intentId });
    if (!parsed.success) throw new IdentityIntentRepositoryError("INVALID_INPUT");
    return parsed.data.intentId;
  }

  async function readClaim(query: SQL, intentId: string) {
    const rows = await execute(query, claimRowsSchema);
    const claim = rows[0]!.claim;
    if (claim !== null && claim.intentId !== intentId) throw new IdentityIntentRepositoryError("INVALID_RESPONSE");
    return claim;
  }

  return {
    async claimForDispatch(intentId) {
      const id = parseIntentId(intentId);
      return readClaim(sql`SELECT mmhr_private.mmhr_claim_identity_intent(${id}::uuid) AS claim`, id);
    },
    async claimForReconciliation(intentId) {
      const id = parseIntentId(intentId);
      return readClaim(sql`SELECT mmhr_private.mmhr_claim_identity_intent_reconciliation(${id}::uuid) AS claim`, id);
    },
    async recordResult(intentId, leaseToken, outcome) {
      const parsed = resultInputSchema.safeParse({ intentId, leaseToken, outcome });
      if (!parsed.success) throw new IdentityIntentRepositoryError("INVALID_INPUT");
      const result = parsed.data;
      const rows = await execute(sql`SELECT mmhr_private.mmhr_record_identity_intent_result(
        ${result.intentId}::uuid, ${result.leaseToken}::text, ${JSON.stringify(result.outcome)}::jsonb
      ) AS result`, resultRowsSchema);
      return rows[0]!.result;
    },
  };
}
