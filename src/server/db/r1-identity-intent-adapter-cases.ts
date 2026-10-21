import { randomUUID } from "node:crypto";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { expect } from "vitest";

import { dispatchIdentityIntent } from "@/server/identity/intent-dispatcher";
import { createSupabaseIdentityService } from "@/server/integrations/auth-admin/supabase";
import { createIdentityIntentRepository } from "./identity-intent-repository";
import {
  asWorker, assertContained, createInvitationFixture, createRecoveryFixture,
  deleteSyntheticFactors, intentState, type IntentCase, type IntentFixture,
} from "./r1-identity-intent-fixtures";
import { insertHistoricalIntent } from "./r1-identity-intent-history-fixtures";
import type { SecurityTransaction } from "./r1-security-command-fixtures";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function scratchProvider(sql: SecurityTransaction, fixture: IntentFixture, mode: "normal" | "ambiguous" | "reject" = "normal") {
  const calls: { method: string; path: string }[] = [];
  const fetchImplementation: typeof fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    expect(url.origin).toBe("https://identity.example.test");
    expect(new Headers(init?.headers).get("x-correlation-id")).toBe(fixture.correlationId);
    expect(new Headers(init?.headers).has("cookie")).toBe(false);
    expect(init?.credentials).toBe("omit");
    expect(init?.redirect).toBe("error");
    const method = init?.method ?? "GET";
    calls.push({ method, path: url.pathname });
    if (fixture.operation === "invitation_delivery" && method === "POST" && url.pathname === "/auth/v1/invite") {
      expect(url.searchParams.get("redirect_to")).toBe("https://app.example.test/invitations/accept");
      expect(JSON.parse(String(init?.body))).toMatchObject({ email: fixture.email });
      return mode === "reject" ? json({ msg: "private-provider-marker", error_code: "over_request_rate_limit" }, 429)
        : json({ id: randomUUID(), email: fixture.email, user_metadata: { marker: "private-provider-marker" } });
    }
    if (fixture.operation === "mfa_enrollment_reset") {
      const basePath = `/auth/v1/admin/users/${fixture.subjectId}/factors`;
      if (method === "GET" && url.pathname === basePath) {
        const factors = await sql<{ id: string; factor_type: string; status: string }[]>`
          SELECT id, factor_type::text, status::text FROM auth.mfa_factors
          WHERE user_id = ${fixture.subjectId}::uuid ORDER BY id`;
        return json(factors.map((factor) => ({ ...factor, secret: "private-provider-marker" })));
      }
      if (method === "DELETE" && url.pathname.startsWith(`${basePath}/`)) {
        const factorId = url.pathname.slice(basePath.length + 1);
        expect(factorId).toMatch(/^[0-9a-f-]{36}$/);
        if (mode === "ambiguous") return json({ msg: "private-provider-marker" }, 500);
        const rows = await sql<{ id: string }[]>`DELETE FROM auth.mfa_factors
          WHERE id = ${factorId}::uuid AND user_id = ${fixture.subjectId}::uuid RETURNING id`;
        expect(rows).toHaveLength(1);
        return json({ id: factorId });
      }
    }
    throw new Error("Unexpected synthetic provider request");
  };
  // The installed Auth SDK runs against this in-memory transport. There is no
  // native fetch fallback, live provider account, real key, or email delivery.
  const service = createSupabaseIdentityService({ supabaseUrl: "https://identity.example.test",
    applicationOrigin: "https://app.example.test", adminKey: "synthetic-key-for-isolated-fixture", fetchImplementation });
  return { service, calls };
}

function executeWorkerQuery(sql: SecurityTransaction, query: SQL) {
  const compiled = new PgDialect().sqlToQuery(query);
  const parameters = compiled.params.map((value: unknown) => {
    if (typeof value !== "string") throw new Error("Unexpected worker repository parameter type");
    return value;
  });
  return asWorker(sql, async (worker) => worker.unsafe(compiled.sql, parameters));
}

function workerRepository(sql: SecurityTransaction) {
  return createIdentityIntentRepository({ execute: (query) => executeWorkerQuery(sql, query) });
}

export const adapterCases: readonly IntentCase[] = [
  {
    name: "interoperates through real SQL, Drizzle repository, dispatcher, Auth SDK, and the fixed invitation adapter",
    async run(sql, base) {
      const f = await createInvitationFixture(sql, base);
      const provider = scratchProvider(sql, f);
      const repository = workerRepository(sql);
      expect(await dispatchIdentityIntent({ intentId: f.intentId }, { repository, service: provider.service })).toEqual({
        outcome: "succeeded", resultCode: "invitation_provider_accepted",
      });
      expect(provider.calls).toEqual([{ method: "POST", path: "/auth/v1/invite" }]);
      expect(await intentState(sql, f.intentId)).toMatchObject({ state: "succeeded", dispatch_count: 1 });
      expect(await dispatchIdentityIntent({ intentId: f.intentId }, { repository, service: provider.service })).toEqual({ outcome: "not_claimed" });
      expect(provider.calls).toHaveLength(1);
      const stored = await sql`SELECT result_code, safe_error_code FROM public.identity_admin_intents WHERE id = ${f.intentId}::uuid`;
      expect(JSON.stringify(stored)).not.toContain("private-provider-marker");
    },
  },
  {
    name: "interoperates with exact reset context and verified plus unverified factors without exposing provider payloads",
    async run(sql, base) {
      const f = await createRecoveryFixture(sql, base);
      await sql`INSERT INTO auth.mfa_factors (id, user_id, factor_type, status, created_at, updated_at)
        VALUES (${randomUUID()}::uuid, ${f.subjectId}::uuid, 'totp', 'unverified', now(), now())`;
      const provider = scratchProvider(sql, f);
      const result = await dispatchIdentityIntent({ intentId: f.intentId }, { repository: workerRepository(sql), service: provider.service });
      expect(result).toEqual({ outcome: "succeeded", resultCode: "mfa_zero_factors", confirmedFactorCount: 0, observedAt: expect.any(String) });
      expect(provider.calls.map((call) => call.method)).toEqual(["GET", "DELETE", "DELETE", "GET"]);
      expect(JSON.stringify(result)).not.toContain("private-provider-marker");
      await assertContained(sql, f);
    },
  },
  {
    name: "keeps ambiguous provider writes unknown and does not silently retry destructive calls",
    async run(sql, base) {
      const f = await createRecoveryFixture(sql, base);
      const provider = scratchProvider(sql, f, "ambiguous");
      const repository = workerRepository(sql);
      expect(await dispatchIdentityIntent({ intentId: f.intentId }, { repository, service: provider.service })).toEqual({
        outcome: "outcome_unknown", code: "factors_remaining", nextAction: "reconcile",
      });
      expect(provider.calls.map((call) => call.method)).toEqual(["GET", "DELETE", "GET"]);
      expect(await dispatchIdentityIntent({ intentId: f.intentId }, { repository, service: provider.service })).toEqual({ outcome: "not_claimed" });
      expect(provider.calls.map((call) => call.method)).toEqual(["GET", "DELETE", "GET"]);
      expect(await intentState(sql, f.intentId)).toMatchObject({ state: "outcome_unknown", dispatch_count: 1 });
    },
  },
  {
    name: "uses only provider reads when SQL returns a reconciliation lease",
    async run(sql, base) {
      const f = await createRecoveryFixture(sql, base, { seedIntent: false });
      await insertHistoricalIntent(sql, f, { state: "expired_dispatch" });
      await deleteSyntheticFactors(sql, f);
      const provider = scratchProvider(sql, f);
      expect(await dispatchIdentityIntent({ intentId: f.intentId }, { repository: workerRepository(sql), service: provider.service }))
        .toMatchObject({ outcome: "succeeded", resultCode: "mfa_zero_factors", confirmedFactorCount: 0 });
      expect(provider.calls.map((call) => call.method)).toEqual(["GET"]);
      expect(await intentState(sql, f.intentId)).toMatchObject({ state: "succeeded", dispatch_count: 1, attempt_count: 2 });
    },
  },
  {
    name: "stores only confirmed provider rejection as safe invitation retry evidence",
    async run(sql, base) {
      const f = await createInvitationFixture(sql, base);
      const provider = scratchProvider(sql, f, "reject");
      expect(await dispatchIdentityIntent({ intentId: f.intentId }, { repository: workerRepository(sql), service: provider.service }))
        .toEqual({ outcome: "failed", code: "provider_rejected", retry: "safe" });
      expect(await intentState(sql, f.intentId)).toMatchObject({ state: "failed", safe_error_code: "provider_rejected",
        manual_review_required: false, next_attempt_at: expect.any(String) });
      expect(provider.calls).toHaveLength(1);
    },
  },
  {
    name: "does not dispatch after a claim acknowledgement is lost",
    async run(sql, base) {
      const f = await createInvitationFixture(sql, base);
      const provider = scratchProvider(sql, f);
      let loseAcknowledgement = true;
      const repository = createIdentityIntentRepository({ execute: async (query) => {
        const rows = await executeWorkerQuery(sql, query);
        if (loseAcknowledgement) {
          loseAcknowledgement = false;
          throw new Error("Synthetic lost acknowledgement with private connection details");
        }
        return rows;
      } });
      expect(await dispatchIdentityIntent({ intentId: f.intentId }, { repository, service: provider.service })).toEqual({
        outcome: "outcome_unknown", code: "repository_unavailable", nextAction: "reconcile",
      });
      expect(await intentState(sql, f.intentId)).toMatchObject({ state: "in_flight", attempt_count: 1, dispatch_count: 1 });
      expect(await dispatchIdentityIntent({ intentId: f.intentId }, { repository, service: provider.service })).toEqual({ outcome: "not_claimed" });
      expect(provider.calls).toHaveLength(0);
    },
  },
];
