import "server-only";

import { PgDialect } from "drizzle-orm/pg-core";
import { sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { originalCompletionSchema } from "./original-verification-worker";
import { ORIGINAL_VERIFICATION_CLOSE_MS, ORIGINAL_VERIFICATION_QUERY_MS,
  OriginalVerificationExecutionError, type OriginalVerificationExecutionContext } from "./original-verification-execution";

export type OwnedOriginalVerifierTransport = Readonly<{
  execute(text: string, parameters: readonly (string | number)[]): PromiseLike<unknown>;
  /** Destroy owned sockets, observe their close events, and end only this dedicated client. */
  terminate(): Promise<void>;
}>;

const identitySql = `SELECT current_user AS role, session_user AS session,
  current_setting('statement_timeout') AS statement_timeout,
  (r.rolcanlogin AND r.rolinherit AND NOT r.rolsuper AND NOT r.rolcreatedb
    AND NOT r.rolcreaterole AND NOT r.rolreplication AND NOT r.rolbypassrls
    AND r.rolvaliduntil > clock_timestamp() AND r.rolvaliduntil <= clock_timestamp() + interval '10 minutes'
    AND (SELECT count(*) FROM pg_catalog.pg_auth_members WHERE member = r.oid) = 1
    AND EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles p ON p.oid = m.roleid
      WHERE m.member = r.oid AND p.rolname = 'mmhr_original_verifier'
        AND NOT m.admin_option AND m.inherit_option AND m.set_option)) AS safe_role
  FROM pg_catalog.pg_roles r WHERE r.rolname = session_user`;
const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
const queries = new Map<string, number>([
  ["SELECT job_id FROM mmhr_private.r7_original_verification_candidates_v1()", 0],
  ["SELECT mmhr_private.r7_original_verification_claim_v1($1::uuid) AS claim", 1],
  ["SELECT mmhr_private.r7_original_verification_lease_current_v1($1::uuid, $2::uuid,$3::integer) AS checked", 3],
  ["SELECT mmhr_private.r7_original_verification_finish_v1($1::uuid,$2::uuid, $3::integer,$4::jsonb) AS result", 4],
].map(([text, count]): [string, number] => [normalize(String(text)), Number(count)]));
const uuid = z.uuid();

/** No credentials, global pool, SQL retries, or role changes are accepted by this adapter. */
export function createOriginalVerificationExecutor(transport: OwnedOriginalVerifierTransport) {
  let state: "ready" | "busy" | "poisoned" | "closed" = "ready";
  let cleanupState: "not_started" | "pending" | "complete" | "failed" = "not_started";
  let cleanup: Promise<void> | undefined;
  let interrupt: ((code: "ABORTED" | "DEADLINE" | "CLOSED") => void) | undefined;
  function terminate(): Promise<void> {
    if (cleanup) return cleanup;
    cleanupState = "pending";
    cleanup = new Promise<void>((resolve, reject) => {
      let complete = false;
      const timer = setTimeout(() => {
        complete = true; cleanupState = "failed";
        reject(new OriginalVerificationExecutionError("CLEANUP_FAILED"));
      }, ORIGINAL_VERIFICATION_CLOSE_MS);
      Promise.resolve().then(() => transport.terminate()).then(() => {
        if (complete) return;
        complete = true; clearTimeout(timer); cleanupState = "complete"; resolve();
      }, () => {
        if (complete) return;
        complete = true; clearTimeout(timer); cleanupState = "failed";
        reject(new OriginalVerificationExecutionError("CLEANUP_FAILED"));
      });
    });
    // The work request rejects independently. Cleanup failure remains visible through close/status.
    void cleanup.catch(() => undefined);
    return cleanup;
  }
  function dispatch(text: string, parameters: readonly (string | number)[], context: OriginalVerificationExecutionContext = {}) {
    if (state === "busy") return Promise.reject(new OriginalVerificationExecutionError("BUSY"));
    if (state !== "ready") return Promise.reject(new OriginalVerificationExecutionError("CLOSED"));
    if (context.deadlineAt !== undefined && !Number.isFinite(context.deadlineAt)) {
      return Promise.reject(new OriginalVerificationExecutionError("INVALID_INPUT"));
    }
    if (context.signal?.aborted) return Promise.reject(new OriginalVerificationExecutionError("ABORTED"));
    const deadline = Math.min(context.deadlineAt ?? Infinity, Date.now() + ORIGINAL_VERIFICATION_QUERY_MS);
    const remaining = Math.min(ORIGINAL_VERIFICATION_QUERY_MS, deadline - Date.now());
    if (remaining <= 0) return Promise.reject(new OriginalVerificationExecutionError("DEADLINE"));
    const monotonicDeadline = performance.now() + remaining;
    state = "busy";
    return new Promise<unknown>((resolve, reject) => {
      let settled = false;
      function release() {
        clearTimeout(timer); context.signal?.removeEventListener("abort", aborted); interrupt = undefined;
      }
      function stop(code: "ABORTED" | "DEADLINE" | "CLOSED" | "UNAVAILABLE") {
        if (settled) return;
        settled = true; state = "poisoned"; release();
        void terminate(); reject(new OriginalVerificationExecutionError(code));
      }
      const aborted = () => stop("ABORTED");
      const timer = setTimeout(() => stop("DEADLINE"), remaining);
      interrupt = stop;
      context.signal?.addEventListener("abort", aborted, { once: true });
      if (context.signal?.aborted) { stop("ABORTED"); return; }
      Promise.resolve().then(() => {
        if (settled) return undefined;
        return transport.execute(text, parameters);
      }).then((rows) => {
        if (settled) return;
        if (Date.now() >= deadline || performance.now() >= monotonicDeadline) { stop("DEADLINE"); return; }
        settled = true; state = "ready"; release(); resolve(rows);
      }, () => stop("UNAVAILABLE"));
    });
  }
  return Object.freeze({
    async verifyConnection(loginName: string) {
      if (!/^mmhr_original_verifier_[a-f0-9]{32}$/.test(loginName)) throw new OriginalVerificationExecutionError("INVALID_INPUT");
      const rows = await dispatch(identitySql, []);
      const identity = z.array(z.strictObject({ role: z.literal(loginName), session: z.literal(loginName),
        statement_timeout: z.literal("8s"), safe_role: z.literal(true) })).length(1).safeParse(rows);
      if (!identity.success) {
        state = "poisoned"; void terminate(); throw new OriginalVerificationExecutionError("UNAVAILABLE");
      }
    },
    async execute(query: SQL, context?: OriginalVerificationExecutionContext): Promise<unknown> {
      let compiled: ReturnType<PgDialect["sqlToQuery"]>;
      try { compiled = new PgDialect().sqlToQuery(query); }
      catch { throw new OriginalVerificationExecutionError("INVALID_INPUT"); }
      const count = queries.get(normalize(compiled.sql));
      const p = compiled.params;
      if (count === undefined || p.length !== count
        || (count > 0 && !uuid.safeParse(p[0]).success)
        || (count > 1 && (!uuid.safeParse(p[1]).success || p[2] !== 2))) {
        throw new OriginalVerificationExecutionError("INVALID_INPUT");
      }
      if (count === 4) {
        try {
          if (typeof p[3] !== "string" || Buffer.byteLength(p[3], "utf8") > 1024) throw new Error();
          originalCompletionSchema.parse(JSON.parse(p[3]));
        } catch { throw new OriginalVerificationExecutionError("INVALID_INPUT"); }
      }
      return dispatch(compiled.sql, p as (string | number)[], context);
    },
    async close() {
      if (state === "busy") interrupt?.("CLOSED");
      else if (state === "ready") state = "closed";
      await terminate();
    },
    status: () => Object.freeze({ state, cleanupState }),
  });
}

/** Verify the complete SQL-side login/producer policy without granting access to its private helper. */
export async function verifyOriginalVerificationCandidates(executor: ReturnType<typeof createOriginalVerificationExecutor>) {
  const rows = z.array(z.strictObject({ job_id: uuid })).max(5).safeParse(
    await executor.execute(sql`SELECT job_id FROM mmhr_private.r7_original_verification_candidates_v1()`));
  if (!rows.success || new Set(rows.data.map((row) => row.job_id)).size !== rows.data.length) {
    throw new OriginalVerificationExecutionError("UNAVAILABLE");
  }
}
