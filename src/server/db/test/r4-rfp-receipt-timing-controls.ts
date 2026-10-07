import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { expect } from "vitest";
import type { SecurityCommandApiFixtures } from "@/server/auth/security-command-api-fixtures";

export type ReceiptTimingPolicy = {
  database: string; transactionIsolation: string; statementTimeout: string; lockTimeout: string;
  statementMs: number; lockMs: number; expiryMs: number; requestMs: number;
};
type Settled<T> = { ok: true; value: T } | { ok: false; error: unknown };
function observe<T>(pending: PromiseLike<T>): Promise<Settled<T>> {
  return Promise.resolve(pending).then(value => ({ ok: true, value }), error => ({ ok: false, error }));
}
async function bounded<T>(pending: Promise<T>, milliseconds: number, label: string, cancel: () => void): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([pending, new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        const deadline = new Error(`Owned receipt ${label} deadline exceeded`);
        try { cancel(); reject(deadline); }
        catch (error) { reject(new AggregateError([deadline, error], "Owned deadline cancellation failed")); }
      }, milliseconds);
    })]);
  } finally { if (timer !== undefined) clearTimeout(timer); }
}
class UnsettledOwnerOperation extends AggregateError {}
async function settled<T>(pending: Promise<Settled<T>>, budget: number, label: string, cancel: () => void): Promise<T> {
  let result: Settled<T>;
  try { result = await bounded(pending, budget, label, cancel); }
  catch (deadline) {
    let drained: Settled<T>;
    try { drained = await bounded(pending, 1000, `${label} cancellation settlement`, cancel); }
    catch (error) { throw new UnsettledOwnerOperation([deadline, error], `Owned ${label} cancellation remains unresolved`); }
    throw new AggregateError(drained.ok ? [deadline] : [deadline, drained.error], `Owned ${label} deadline failed; cancellation settled`);
  }
  if (!result.ok) throw result.error;
  return result.value;
}
async function query<T>(pending: PromiseLike<T> & { cancel(): void }, label: string, budget = 2000): Promise<T> {
  return settled(observe(pending), budget, label, () => pending.cancel());
}
function timeout(value: unknown): number {
  if (typeof value !== "string") throw new Error("Owned API timeout setting is missing");
  const match = /^(0|[1-9][0-9]*)(ms|s|min|h|d)?$/.exec(value);
  if (!match) throw new Error("Owned API timeout setting is invalid");
  const units: Record<string, number> = { "": 1, ms: 1, s: 1000, min: 60000, h: 3600000, d: 86400000 };
  const result = Number(match[1]) * units[match[2] ?? ""]!;
  if (!Number.isSafeInteger(result)) throw new Error("Owned API timeout setting is outside the supported range");
  return result;
}

// This probe exists only in the verified disposable fixture. It changes no deployed command or timeout policy.
export async function readReceiptTimingPolicy(fixture: SecurityCommandApiFixtures, client: SupabaseClient): Promise<ReceiptTimingPolicy> {
  if (!/^mmhr-r1-commandapi-[0-9a-f]{8}$/.test(fixture.projectId) || !fixture.isolation.apiLoopbackOnly) {
    throw new Error("Owned receipt timing probe requires the isolated API fixture");
  }
  // Register the exact owned name before CREATE, including an uncertain CREATE result.
  const name = `mmhr_receipt_timing_${randomUUID().replaceAll("-", "")}`;
  if (!/^mmhr_receipt_timing_[0-9a-f]{32}$/.test(name)) throw new Error("Owned timing probe name is invalid");
  const controller = new AbortController(); let policy: ReceiptTimingPolicy | undefined, primary: unknown, failed = false;
  let rpcPending: Promise<Settled<{ data: unknown; error: { code?: string } | null }>> | undefined;
  let phase = "database", creationUnresolved = false, unresolvedOwner = false;
  const cleanup: unknown[] = [];
  try {
    const [owner] = await query(fixture.owner<{ database: string }[]>`SELECT current_database() database`, "probe database");
    if (!owner || owner.database !== "postgres") throw new Error("Owned timing probe database is invalid");
    phase = "creation";
    let cancelCreation: () => void = () => {};
    const creation = observe(fixture.owner.begin(async sql => {
      const create = sql.unsafe(`CREATE FUNCTION public.${name}() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
        SELECT jsonb_build_object('statementTimeout',current_setting('statement_timeout'),'lockTimeout',current_setting('lock_timeout'),
          'transactionIsolation',current_setting('transaction_isolation'))
        WHERE current_database()='postgres' AND current_user='authenticated'
        $$`);
      cancelCreation = () => create.cancel();
      try { await query(create, "probe creation"); }
      catch (error) { creationUnresolved = error instanceof UnsettledOwnerOperation; throw error; }
      const revoke = sql.unsafe(`REVOKE ALL ON FUNCTION public.${name}() FROM PUBLIC,anon,authenticated,service_role,mmhr_worker,mmhr_document_worker`);
      cancelCreation = () => revoke.cancel();
      try { await query(revoke, "probe initial revocation"); }
      catch (error) { creationUnresolved = error instanceof UnsettledOwnerOperation; throw error; }
    }));
    await settled(creation, 5000, "probe creation transaction", () => cancelCreation());
    phase = "activation";
    await query(fixture.owner.unsafe(`GRANT EXECUTE ON FUNCTION public.${name}() TO authenticated`), "owned probe activation");
    phase = "cache";
    await query(fixture.owner`NOTIFY pgrst, 'reload schema'`, "probe cache reload");
    const deadline = Date.now() + 4000;
    while (Date.now() < deadline) {
      rpcPending = observe(client.rpc(name).abortSignal(controller.signal));
      const response = await bounded(rpcPending,
        Math.min(1000, deadline - Date.now()), "probe HTTP", () => controller.abort());
      if (!response.ok) throw response.error;
      if (response.value.error?.code === "PGRST202") {
        let pause: ReturnType<typeof setTimeout> | undefined;
        try { await new Promise<void>(resolve => { pause = setTimeout(resolve, 50); }); }
        finally { if (pause !== undefined) clearTimeout(pause); }
        continue;
      }
      if (response.value.error) throw new Error("Owned API timing probe failed");
      const value: unknown = response.value.data;
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Owned API timing probe response is invalid");
      const result = value as Record<string, unknown>;
      if (Object.keys(result).sort().join() !== ["lockTimeout", "statementTimeout", "transactionIsolation"].sort().join()) throw new Error("Owned API timing probe scope is invalid");
      if (result.transactionIsolation !== "read committed") throw new Error("Owned API isolation cannot refresh receipt authority");
      const statementMs = timeout(result.statementTimeout), lockMs = timeout(result.lockTimeout);
      const positive = [statementMs, lockMs].filter(limit => limit > 0), limit = positive.length ? Math.min(...positive) : Number.POSITIVE_INFINITY;
      const expiryMs = Math.min(2000, Math.floor(limit / 3)), requestMs = Math.min(6000, limit - 500);
      if (expiryMs < 1000 || requestMs <= expiryMs + 500) throw new Error("Owned API timeout policy cannot fit the controlled expiry boundary");
      policy = { database: owner.database, transactionIsolation: result.transactionIsolation, statementTimeout: String(result.statementTimeout), lockTimeout: String(result.lockTimeout),
        statementMs, lockMs, expiryMs, requestMs };
      // Retain only non-secret policy evidence in the test report.
      console.info("Owned receipt API timeout policy", JSON.stringify(policy));
      break;
    }
    if (!policy) throw new Error("Owned API timing probe cache did not become ready");
  } catch (error) {
    primary = error; failed = true;
    unresolvedOwner = error instanceof UnsettledOwnerOperation || (phase === "creation" && creationUnresolved);
  }
  finally {
    controller.abort();
    if (rpcPending) {
      try { await bounded(rpcPending, 1000, "probe HTTP teardown", () => controller.abort()); }
      catch (error) { cleanup.push(error); }
    }
    if (!unresolvedOwner) {
      try { await query(fixture.owner.unsafe(`DROP FUNCTION IF EXISTS public.${name}()`), "probe removal"); }
      catch (error) { cleanup.push(error); unresolvedOwner = error instanceof UnsettledOwnerOperation; }
    }
    if (!unresolvedOwner) {
      try {
        const [row] = await query(fixture.owner<{ absent: boolean }[]>`SELECT to_regprocedure(${`public.${name}()`}) IS NULL absent`, "probe absence");
        if (!row?.absent) cleanup.push(new Error("Owned timing probe remains installed"));
      } catch (error) { cleanup.push(error); unresolvedOwner = error instanceof UnsettledOwnerOperation; }
    }
    if (!unresolvedOwner) {
      try { await query(fixture.owner`NOTIFY pgrst, 'reload schema'`, "removed probe cache reload"); }
      catch (error) { cleanup.push(error); unresolvedOwner = error instanceof UnsettledOwnerOperation; }
    }
    if (unresolvedOwner) cleanup.push(new Error(`Owned probe ${name} has unresolved SQL; physical cleanup requires its isolated fixture`));
  }
  if (cleanup.length) throw new AggregateError(failed ? [primary, ...cleanup] : cleanup, "Owned timing probe cleanup failed");
  if (failed) throw primary;
  return policy!;
}

export { query as receiptTimingQuery };
export async function receiptTimingHttp<T>(invoke: (signal: AbortSignal) => PromiseLike<T>, budget: number): Promise<T> {
  const controller = new AbortController();
  try {
    // Dispatch stays inside this scope. Observe a late result before any deadline can reject.
    return await settled(observe(invoke(controller.signal)), budget, "prerequisite HTTP", () => controller.abort());
  } finally {
    controller.abort();
  }
}
export async function withReceiptTimingRestoration(operation: () => Promise<void>, restore: () => Promise<void>): Promise<void> {
  let primary: unknown, failed = false;
  try { await operation(); } catch (error) { primary = error; failed = true; }
  try { await restore(); }
  catch (error) {
    if (failed) throw new AggregateError([primary, error], "Owned timing assertion and state restoration failed");
    throw error;
  }
  if (failed) throw primary;
}
type Operation<T> = { rpc: string; invoke(signal: AbortSignal): PromiseLike<T> };
export async function waitForReceiptTiming<T>(fixture: SecurityCommandApiFixtures, operation: Operation<T>, expiresAt: string,
  policy: ReceiptTimingPolicy, afterAdmission?: () => Promise<void>, recipientRow?: string): Promise<T> {
  let release: () => void = () => {}, admitted: () => void = () => {}, blocker = 0, backendPid: number | undefined, backendStart: string | undefined;
  let cancelGate: () => void = () => {};
  const released = new Promise<void>(resolve => { release = resolve; });
  const locked = new Promise<void>(resolve => { admitted = resolve; });
  const controller = new AbortController();
  let gate: Promise<Settled<void>> | undefined, pending: Promise<Settled<T>> | undefined;
  let mutation: Promise<Settled<void>> | undefined, response: T | undefined;
  let primary: unknown, failed = false, requestTimer: ReturnType<typeof setTimeout> | undefined; const cleanup: unknown[] = [];
  try {
    gate = observe(fixture.owner.begin(async sql => {
      const rows = recipientRow === undefined
        ? sql<{ pid: number }[]>`SELECT pg_backend_pid() pid FROM mmhr_private.security_authority_guard WHERE singleton_key=1 FOR UPDATE`
        : sql<{ pid: number }[]>`SELECT pg_backend_pid() pid FROM public.rfp_recipients
            WHERE id=${recipientRow}::uuid AND organization_id=${fixture.organizationId}::uuid FOR UPDATE`;
      cancelGate = () => rows.cancel(); const [row] = await query(rows, "gate lock");
      blocker = row!.pid; admitted(); await released;
    }));
    await bounded(Promise.race([locked, gate.then(result => {
      if (!result.ok) throw result.error;
      throw new Error("Owned timing gate ended before admission");
    })]), 2500, "gate admission", release);
    // Dispatch and immediate rejection observation both stay inside the protected scope.
    requestTimer = setTimeout(() => controller.abort(), policy.requestMs);
    pending = observe(operation.invoke(controller.signal));
    const requestStart = Date.now(), admissionDeadline = requestStart + Math.min(1000, Math.floor(policy.expiryMs / 2));
    let seen = false;
    while (!seen && Date.now() < admissionDeadline) {
      const [row] = await query(fixture.owner<{ pid: number; started_at: string }[]>`SELECT pid,query_start::text started_at FROM pg_stat_activity
        WHERE pid<>pg_backend_pid() AND query LIKE ${`%${operation.rpc}%`} AND query_start<${expiresAt}::timestamptz
          AND clock_timestamp()<${expiresAt}::timestamptz AND ${blocker}::integer=ANY(pg_blocking_pids(pid))
          AND (${recipientRow === undefined} OR EXISTS(SELECT 1 FROM pg_locks l WHERE l.pid=pg_stat_activity.pid
            AND l.relation='mmhr_private.security_authority_guard'::regclass AND l.mode='RowExclusiveLock' AND l.granted))
        ORDER BY pid LIMIT 1`, "API admission observation", 1000);
      seen = row !== undefined; if (row) { backendPid = row.pid; backendStart = row.started_at; }
    }
    expect(seen).toBe(true);
    if (afterAdmission) {
      mutation = observe(afterAdmission());
      const result = await bounded(mutation, 1000, "post-admission mutation", () => controller.abort());
      if (!result.ok) throw result.error;
    }
    const expiryDeadline = requestStart + policy.expiryMs + 500; let expired = false;
    while (!expired && Date.now() < expiryDeadline) {
      const [row] = await query(fixture.owner<{ expired: boolean }[]>`SELECT clock_timestamp()>${expiresAt}::timestamptz expired`, "expiry observation", 1000);
      expired = row!.expired;
    }
    expect(expired).toBe(true); release();
    const result = await bounded(pending, Math.max(1, requestStart + policy.requestMs - Date.now()), "command HTTP", () => controller.abort());
    if (!result.ok) throw result.error;
    response = result.value;
  } catch (error) { primary = error; failed = true; }
  finally {
    release(); controller.abort(); if (requestTimer !== undefined) clearTimeout(requestTimer);
    if (gate) {
      try { await settled(gate, 2000, "gate teardown", () => { release(); cancelGate(); }); }
      catch (error) { cleanup.push(error); }
    }
    if (mutation) {
      try { const result = await bounded(mutation, 2000, "mutation settlement", () => controller.abort()); if (!result.ok) throw result.error; }
      catch (error) { cleanup.push(error); }
    }
    if (pending) {
      try { await bounded(pending, 2000, "HTTP cancellation teardown", () => controller.abort()); }
      catch (error) { cleanup.push(error); }
      if (backendPid === undefined || backendStart === undefined) cleanup.push(new Error("Owned RPC backend was not observed; completion remains unverified"));
      else {
        try {
          const deadline = Date.now() + 2000; let complete = false;
          while (!complete && Date.now() < deadline) {
            const [row] = await query(fixture.owner<{ complete: boolean }[]>`SELECT NOT EXISTS(SELECT 1 FROM pg_stat_activity
              WHERE pid=${backendPid} AND query_start=${backendStart}::timestamptz AND state='active'
                AND query LIKE ${`%${operation.rpc}%`}) complete`, "original RPC backend completion", Math.max(1, deadline - Date.now()));
            complete = row!.complete;
          }
          if (!complete) throw new Error("Owned original RPC backend completion remains unresolved");
        } catch (error) { cleanup.push(error); }
      }
    }
  }
  if (cleanup.length) throw new AggregateError(failed ? [primary, ...cleanup] : cleanup, "Owned timing race teardown failed");
  if (failed) throw primary;
  return response!;
}
