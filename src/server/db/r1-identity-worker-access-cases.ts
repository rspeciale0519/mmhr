import { randomBytes, randomUUID } from "node:crypto";
import { expect } from "vitest";
import type { SecuritySql } from "./r1-security-command-fixtures";
import {
  identityWorkerSnapshot, listIdentityCandidates, ownerWorkerMembership, workerAccessDenied,
  type IdentityWorkerCase,
} from "./r1-identity-worker-fixtures";

type Drift = {
  name: string;
  apply(sql: SecuritySql, login: string): Promise<unknown>;
  restore(sql: SecuritySql, login: string): Promise<unknown>;
  earlyAclDenial?: boolean;
};

const drifts: readonly Drift[] = [
  { name: "expired credentials on an open connection",
    apply: (sql, login) => sql`ALTER ROLE ${sql(login)} VALID UNTIL '2000-01-01T00:00:00Z'`,
    restore: (sql, login) => sql`SELECT mmhr_private.r1_renew_ephemeral_worker_login(
      ${login}, ${new Date(Date.now() + 9 * 60_000).toISOString()}::timestamptz)` },
  { name: "a credential lifetime above ten minutes",
    apply: (sql, login) => sql`ALTER ROLE ${sql(login)} VALID UNTIL '2100-01-01T00:00:00Z'`,
    restore: (sql, login) => sql`SELECT mmhr_private.r1_renew_ephemeral_worker_login(
      ${login}, ${new Date(Date.now() + 9 * 60_000).toISOString()}::timestamptz)` },
  { name: "unbounded credentials",
    apply: (sql, login) => sql`ALTER ROLE ${sql(login)} VALID UNTIL 'infinity'`,
    restore: (sql, login) => sql`SELECT mmhr_private.r1_renew_ephemeral_worker_login(
      ${login}, ${new Date(Date.now() + 9 * 60_000).toISOString()}::timestamptz)` },
  { name: "NOLOGIN on an already open connection",
    apply: (sql, login) => sql`ALTER ROLE ${sql(login)} NOLOGIN`,
    restore: (sql, login) => sql`ALTER ROLE ${sql(login)} LOGIN` },
  { name: "missing role inheritance", earlyAclDenial: true,
    apply: (sql, login) => sql`ALTER ROLE ${sql(login)} NOINHERIT`,
    restore: (sql, login) => sql`ALTER ROLE ${sql(login)} INHERIT` },
  { name: "CREATEDB on the actual login",
    apply: (sql, login) => sql`ALTER ROLE ${sql(login)} CREATEDB`,
    restore: (sql, login) => sql`ALTER ROLE ${sql(login)} NOCREATEDB` },
  { name: "CREATEROLE on the actual login",
    apply: (sql, login) => sql`ALTER ROLE ${sql(login)} CREATEROLE`,
    restore: (sql, login) => sql`ALTER ROLE ${sql(login)} NOCREATEROLE` },
  { name: "database CREATE privileges",
    apply: (sql, login) => sql`GRANT CREATE ON DATABASE postgres TO ${sql(login)}`,
    restore: (sql, login) => sql`REVOKE CREATE ON DATABASE postgres FROM ${sql(login)}` },
  { name: "public schema CREATE privileges",
    apply: (sql, login) => sql`GRANT CREATE ON SCHEMA public TO ${sql(login)}`,
    restore: (sql, login) => sql`REVOKE CREATE ON SCHEMA public FROM ${sql(login)}` },
  { name: "private schema CREATE privileges",
    apply: (sql, login) => sql`GRANT CREATE ON SCHEMA mmhr_private TO ${sql(login)}`,
    restore: (sql, login) => sql`REVOKE CREATE ON SCHEMA mmhr_private FROM ${sql(login)}` },
  { name: "direct raw table rights",
    apply: (sql, login) => sql`GRANT SELECT ON public.identity_admin_intents TO ${sql(login)}`,
    restore: (sql, login) => sql`REVOKE SELECT ON public.identity_admin_intents FROM ${sql(login)}` },
  { name: "inherited raw table rights",
    apply: (sql) => sql`GRANT SELECT ON public.identity_admin_intents TO mmhr_worker`,
    restore: (sql) => sql`REVOKE SELECT ON public.identity_admin_intents FROM mmhr_worker` },
  { name: "column-only raw SELECT rights",
    apply: (sql, login) => sql`GRANT SELECT (id) ON public.identity_admin_intents TO ${sql(login)}`,
    restore: (sql, login) => sql`REVOKE SELECT (id) ON public.identity_admin_intents FROM ${sql(login)}` },
  { name: "column-only raw UPDATE rights",
    apply: (sql, login) => sql`GRANT UPDATE (state) ON public.identity_admin_intents TO ${sql(login)}`,
    restore: (sql, login) => sql`REVOKE UPDATE (state) ON public.identity_admin_intents FROM ${sql(login)}` },
  { name: "an unexpected private owner-function grant",
    apply: (sql, login) => sql`GRANT EXECUTE ON FUNCTION
      mmhr_private.r1_prepare_recovery_policy(uuid,uuid,uuid,uuid,uuid,uuid,uuid) TO ${sql(login)}`,
    restore: (sql, login) => sql`REVOKE EXECUTE ON FUNCTION
      mmhr_private.r1_prepare_recovery_policy(uuid,uuid,uuid,uuid,uuid,uuid,uuid) FROM ${sql(login)}` },
  { name: "an unexpected public security-command grant",
    apply: (sql, login) => sql`GRANT EXECUTE ON FUNCTION
      public.mmhr_change_identity_status(uuid,text,text,uuid,uuid) TO ${sql(login)}`,
    restore: (sql, login) => sql`REVOKE EXECUTE ON FUNCTION
      public.mmhr_change_identity_status(uuid,text,text,uuid,uuid) FROM ${sql(login)}` },
  { name: "a changed shared worker role",
    apply: (sql) => sql`ALTER ROLE mmhr_worker INHERIT`,
    restore: (sql) => sql`ALTER ROLE mmhr_worker NOINHERIT` },
];

export const identityWorkerAccessCases: readonly IdentityWorkerCase[] = [
  {
    name: "exposes only a fixed, stable, no-argument UUID table function to the worker",
    async run(context, worker) {
      const [fn] = await context.client`SELECT p.pronargs, p.prosecdef, p.provolatile, p.proconfig,
        pg_get_function_result(p.oid) AS result FROM pg_proc p
        WHERE p.oid = 'mmhr_private.mmhr_list_identity_intent_candidates()'::regprocedure`;
      expect(fn).toMatchObject({ pronargs: 0, prosecdef: true, provolatile: "s", result: "TABLE(intent_id uuid)" });
      expect(fn!.proconfig).toContain('search_path=""');
      expect(await worker.client`SELECT jsonb_typeof(${JSON.stringify({ outcome: "succeeded",
        resultCode: "invitation_provider_accepted" })}::jsonb) AS payload_type`).toEqual([{ payload_type: "object" }]);
      const accessible = await worker.client`SELECT p.proname AS name, p.pronargs AS arguments
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname IN ('public','mmhr_private') AND p.prosecdef
          AND has_function_privilege(current_user,p.oid,'EXECUTE') ORDER BY p.proname`;
      expect(accessible).toEqual([
        { name: "mmhr_claim_identity_intent", arguments: 1 },
        { name: "mmhr_claim_identity_intent_reconciliation", arguments: 1 },
        { name: "mmhr_list_identity_intent_candidates", arguments: 0 },
        { name: "mmhr_record_identity_intent_result", arguments: 3 },
      ]);
      expect(await context.client`SELECT acl.grantee FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) acl
        WHERE p.oid = 'mmhr_private.mmhr_list_identity_intent_candidates()'::regprocedure
          AND acl.grantee = 0`).toHaveLength(0);
      expect(await ownerWorkerMembership(context.client)).toEqual([
        expect.objectContaining({ admin_option: true, inherit_option: false, set_option: false }),
      ]);
    },
  },
  {
    name: "rejects the actual migration owner even when it owns the function",
    async run(context) {
      const before = await identityWorkerSnapshot(context.client);
      await expect(listIdentityCandidates(context.client)).rejects.toMatchObject(workerAccessDenied);
      expect(await identityWorkerSnapshot(context.client)).toEqual(before);
    },
  },
  ...(["anon", "authenticated", "service_role"] as const).map((role): IdentityWorkerCase => ({
    name: `does not grant discovery to ${role}`,
    async run(context) {
      const [access] = await context.client`SELECT has_function_privilege(${role},
        'mmhr_private.mmhr_list_identity_intent_candidates()','EXECUTE') AS allowed`;
      expect(access).toEqual({ allowed: false });
      await expect(context.client.begin(async (sql) => {
        // These existing Data API roles need no owner membership changes.
        await sql.unsafe(`SET LOCAL ROLE ${role}`);
        await listIdentityCandidates(sql);
      })).rejects.toMatchObject({ code: "42501" });
    },
  })),
  {
    name: "does not accept a caller-selected target or read raw intent records",
    async run(context, worker) {
      const before = await identityWorkerSnapshot(context.client);
      await expect(worker.client`SELECT * FROM mmhr_private.mmhr_list_identity_intent_candidates(${randomUUID()}::uuid)`)
        .rejects.toMatchObject({ code: "42883" });
      await expect(worker.client`SELECT id FROM public.identity_admin_intents LIMIT 1`).rejects.toMatchObject({ code: "42501" });
      await expect(worker.client`SELECT id FROM auth.mfa_factors LIMIT 1`).rejects.toMatchObject({ code: "42501" });
      await expect(worker.client`UPDATE public.identity_admin_intents SET manual_review_required = true WHERE false`)
        .rejects.toMatchObject({ code: "42501" });
      expect(await identityWorkerSnapshot(context.client)).toEqual(before);
    },
  },
  ...drifts.map((drift): IdentityWorkerCase => ({
    name: `fails closed for ${drift.name}`,
    async run(context, worker) {
      expect(await listIdentityCandidates(worker.client)).toEqual([]);
      const before = await identityWorkerSnapshot(context.client);
      try {
        await drift.apply(context.client, worker.loginName);
        // SELECT proves the same already-open LOGIN remains usable. Only the
        // fixed discovery boundary must now reject its changed authority.
        expect(await worker.client`SELECT session_user AS session`).toEqual([{ session: worker.loginName }]);
        await expect(listIdentityCandidates(worker.client)).rejects.toMatchObject(
          drift.earlyAclDenial ? { code: "42501" } : workerAccessDenied);
        expect(await identityWorkerSnapshot(context.client)).toEqual(before);
      } finally { await drift.restore(context.client, worker.loginName); }
      expect(await listIdentityCandidates(worker.client)).toEqual([]);
    },
  })),
  ...(["extra forward membership", "unexpected shared-role member"] as const).map((scenario): IdentityWorkerCase => ({
    name: `rejects ${scenario} without changing the owner's worker membership`,
    async run(context, worker) {
      const otherRole = `r1_worker_probe_${randomBytes(8).toString("hex")}`;
      const before = await ownerWorkerMembership(context.client);
      await context.client`CREATE ROLE ${context.client(otherRole)} NOLOGIN INHERIT NOSUPERUSER
        NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`;
      try {
        if (scenario === "extra forward membership") {
          await context.client`GRANT ${context.client(otherRole)} TO ${context.client(worker.loginName)}
            WITH ADMIN FALSE, INHERIT TRUE, SET TRUE`;
        } else {
          await context.client`GRANT mmhr_worker TO ${context.client(otherRole)} WITH ADMIN FALSE, INHERIT TRUE, SET TRUE`;
        }
        await expect(listIdentityCandidates(worker.client)).rejects.toMatchObject(workerAccessDenied);
        expect(await ownerWorkerMembership(context.client)).toEqual(before);
      } finally {
        if (scenario === "extra forward membership") {
          await context.client`REVOKE ${context.client(otherRole)} FROM ${context.client(worker.loginName)}`;
        } else { await context.client`REVOKE mmhr_worker FROM ${context.client(otherRole)}`; }
        await context.client`DROP ROLE ${context.client(otherRole)}`;
      }
      expect(await listIdentityCandidates(worker.client)).toEqual([]);
    },
  })),
  {
    name: "rejects sequence privileges before discovery",
    async run(context, worker) {
      const sequence = `r1_worker_probe_${randomBytes(8).toString("hex")}`;
      await context.client`CREATE SEQUENCE public.${context.client(sequence)}`;
      try {
        await context.client`GRANT USAGE ON SEQUENCE public.${context.client(sequence)} TO ${context.client(worker.loginName)}`;
        await expect(listIdentityCandidates(worker.client)).rejects.toMatchObject(workerAccessDenied);
      } finally {
        await context.client`REVOKE USAGE ON SEQUENCE public.${context.client(sequence)} FROM ${context.client(worker.loginName)}`;
        await context.client`DROP SEQUENCE public.${context.client(sequence)}`;
      }
      expect(await listIdentityCandidates(worker.client)).toEqual([]);
    },
  },
];
