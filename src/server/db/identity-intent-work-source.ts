import "server-only";
import { sql } from "drizzle-orm";
import { z } from "zod";

import { MAX_IDENTITY_INTENT_BATCH, type IdentityIntentSweepSource } from "@/server/identity/intent-sweeper";
import { identityIntentRequestSchema } from "@/server/identity/intent-worker-contract";
import type { IdentityIntentSqlExecutor } from "./identity-intent-repository";

const candidateIntentIdSchema = identityIntentRequestSchema.shape.intentId.refine(
  (value) => value !== "00000000-0000-0000-0000-000000000000",
  { message: "Nil identity intent ID is not valid work" },
);
const candidateRowsSchema = z.array(z.strictObject({
  intent_id: candidateIntentIdSchema,
})).max(MAX_IDENTITY_INTENT_BATCH);

export class IdentityIntentWorkSourceError extends Error {
  constructor(readonly code: "UNAVAILABLE" | "INVALID_RESPONSE") {
    super("Identity intent work could not be read");
    this.name = "IdentityIntentWorkSourceError";
  }
}

/** SQL verifies the actual restricted login before returning any candidate. */
export function createIdentityIntentWorkSource(executor: IdentityIntentSqlExecutor): IdentityIntentSweepSource {
  return Object.freeze({
    async listCandidateIds() {
      let rows: unknown;
      try {
        rows = await executor.execute(sql`SELECT intent_id FROM mmhr_private.mmhr_list_identity_intent_candidates()`);
      } catch {
        throw new IdentityIntentWorkSourceError("UNAVAILABLE");
      }
      try {
        const parsed = candidateRowsSchema.safeParse(rows);
        if (parsed.success) {
          const ids = parsed.data.map((row) => row.intent_id);
          if (new Set(ids).size === ids.length) return ids;
        }
      } catch {
        // Even malformed driver objects must not expose their values or errors.
      }
      throw new IdentityIntentWorkSourceError("INVALID_RESPONSE");
    },
  });
}
