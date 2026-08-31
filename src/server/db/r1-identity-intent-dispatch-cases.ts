import { randomUUID } from "node:crypto";
import { expect } from "vitest";

import {
  asRuntimeRole, asWorker, assertContained, claimIntent, createInvitationFixture, createRecoveryFixture,
  insertPendingIntent, intentSnapshot, intentState, prepareRecoveryPolicy,
  type IntentCase, type RecoveryFixture, type RecoveryOptions,
} from "./r1-identity-intent-fixtures";
import { asAuthenticated, denied, type SecurityCommandFixture, type SecurityTransaction } from "./r1-security-command-fixtures";

type InvalidRecovery = {
  name: string;
  options?(foundation: SecurityCommandFixture): RecoveryOptions;
  change?(sql: SecurityTransaction, fixture: RecoveryFixture, foundation: SecurityCommandFixture): Promise<unknown>;
};

const invalidRecovery: readonly InvalidRecovery[] = [
  { name: "expired request", options: () => ({ requestExpiresOffsetMs: -1_000 }) },
  { name: "future approval", options: () => ({ approvedOffsetMs: 60_000 }) },
  { name: "cancelled request", change: (sql, f) => sql`UPDATE public.identity_recovery_requests
    SET state = 'cancelled', cancelled_at = clock_timestamp() WHERE id = ${f.requestId}::uuid` },
  { name: "cancelled presence", change: (sql, f) => sql`UPDATE public.identity_recovery_presence
    SET state = 'cancelled', cancelled_at = clock_timestamp() WHERE id = ${f.presenceId}::uuid` },
  { name: "missing target session", change: (sql, f) => sql`DELETE FROM auth.sessions WHERE id = ${f.target.sessionId}::uuid` },
  { name: "expired target session", change: (sql, f) => sql`UPDATE auth.sessions SET not_after = clock_timestamp()
    WHERE id = ${f.target.sessionId}::uuid` },
  { name: "another subject's session", options: (base) => ({ presenceSessionId: base.pair[0].sessionId }) },
  { name: "malformed session identifier", options: () => ({ presenceSessionId: "not-a-session" }) },
  { name: "mismatched presence subject", options: (base) => ({ presenceSubjectId: base.target.subject }) },
  { name: "unreviewed target", change: (sql, f) => sql`UPDATE public.identities
    SET migration_review_required = true WHERE id = ${f.target.identityId}::uuid` },
  { name: "unconfirmed target email", change: (sql, f) => sql`UPDATE auth.users
    SET email_confirmed_at = NULL WHERE id = ${f.subjectId}::uuid` },
  { name: "changed provider email", change: (sql, f) => sql`UPDATE auth.users
    SET email = 'changed-provider@example.invalid' WHERE id = ${f.subjectId}::uuid` },
  { name: "banned target", change: (sql, f) => sql`UPDATE auth.users
    SET banned_until = clock_timestamp() + interval '1 hour' WHERE id = ${f.subjectId}::uuid` },
  { name: "deleted target", change: (sql, f) => sql`UPDATE auth.users
    SET deleted_at = clock_timestamp() WHERE id = ${f.subjectId}::uuid` },
  { name: "anonymous target", change: (sql, f) => sql`UPDATE auth.users
    SET is_anonymous = true WHERE id = ${f.subjectId}::uuid` },
  { name: "suspended issuer", change: (sql, _f, base) => sql`UPDATE public.identities
    SET status = 'suspended', suspended_at = clock_timestamp() WHERE id = ${base.pair[0].identityId}::uuid` },
  { name: "suspended approver", change: (sql, _f, base) => sql`UPDATE public.identities
    SET status = 'suspended', suspended_at = clock_timestamp() WHERE id = ${base.pair[1].identityId}::uuid` },
  { name: "issuer lost all verified factors", change: (sql, _f, base) => sql`DELETE FROM auth.mfa_factors
    WHERE user_id = ${base.pair[0].subject}::uuid` },
  { name: "approver lost all verified factors", change: (sql, _f, base) => sql`DELETE FROM auth.mfa_factors
    WHERE user_id = ${base.pair[1].subject}::uuid` },
  { name: "current request permission deny", change: (sql, _f, base) => sql`INSERT INTO public.user_permission_overrides
    (identity_id, permission_key, scope_kind, scope_key, effect, issued_by_identity_id, issue_reason)
    VALUES (${base.pair[0].identityId}::uuid, 'identity.recovery.request', 'platform', 'platform', 'deny',
      ${base.pair[1].identityId}::uuid, 'Synthetic current request deny')` },
  { name: "current approval permission deny", change: (sql, _f, base) => sql`INSERT INTO public.user_permission_overrides
    (identity_id, permission_key, scope_kind, scope_key, effect, issued_by_identity_id, issue_reason)
    VALUES (${base.pair[1].identityId}::uuid, 'identity.recovery.approve', 'platform', 'platform', 'deny',
      ${base.pair[0].identityId}::uuid, 'Synthetic current approval deny')` },
];

async function expectNoDispatch(sql: SecurityTransaction, fixture: RecoveryFixture) {
  const before = await intentSnapshot(sql);
  expect(await asWorker(sql, (worker) => claimIntent(worker, fixture.intentId))).toBeNull();
  expect(await intentSnapshot(sql)).toEqual(before);
}

export const dispatchCases: readonly IntentCase[] = [
  {
    name: "blocks both super administrators' privileged platform reads during an ordinary identity recovery",
    async run(sql, base) {
      const f = await createRecoveryFixture(sql, base);
      const probe = async (contained: boolean) => {
        for (const principal of base.pair) {
          await asAuthenticated(sql, principal, async (runtime) => {
            for (const permission of ["admin.access", "audit.view", "audit.change_summary.read"]) {
              const rows = await runtime`SELECT * FROM public.mmhr_authorize(${permission}, NULL::uuid)`;
              expect(rows).toHaveLength(contained ? 0 : 1);
            }
            const events = await runtime`SELECT * FROM public.mmhr_get_audit_events(NULL::uuid)`;
            if (contained) expect(events).toHaveLength(0);
            else expect(events.length).toBeGreaterThan(0);
          });
        }
      };
      await probe(false);
      expect(await asWorker(sql, (worker) => claimIntent(worker, f.intentId))).not.toBeNull();
      await probe(true);
    },
  },
  {
    name: "blocks organization audit reads for otherwise authorized administrators during any recovery",
    async run(sql, base) {
      const f = await createRecoveryFixture(sql, base);
      const auditId = randomUUID();
      const principals = [base.pair[0], base.organizationAdmin];
      for (const principal of principals) {
        for (const permission of ["audit.view", "audit.change_summary.read"]) {
          await sql`INSERT INTO public.user_permission_overrides
            (identity_id, permission_key, scope_kind, organization_id, scope_key, effect, issued_by_identity_id, issue_reason)
            VALUES (${principal.identityId}::uuid, ${permission}, 'organization', ${base.organizationId}::uuid,
              ${`organization:${base.organizationId}`}, 'allow', ${base.pair[1].identityId}::uuid,
              'Synthetic audit read permission')`;
        }
      }
      await sql`INSERT INTO public.audit_events
        (id, actor_type, actor_reference, organization_id, command, action, entity_type, entity_id, reason, correlation_id)
        VALUES (${auditId}::uuid, 'migration', 'synthetic-read-fixture', ${base.organizationId}::uuid,
          'r1.identity_intent.fixture', 'identity.recovery.fixture', 'identity', ${f.target.identityId},
          'Synthetic organization audit fixture', ${randomUUID()}::uuid)`;
      const probe = async (contained: boolean) => {
        for (const principal of principals) {
          await asAuthenticated(sql, principal, async (runtime) => {
            for (const permission of ["audit.view", "audit.change_summary.read"]) {
              const rows = await runtime`SELECT * FROM public.mmhr_authorize(${permission}, ${base.organizationId}::uuid)`;
              expect(rows).toHaveLength(contained ? 0 : 1);
            }
            const events = await runtime<{ id: string }[]>`SELECT id FROM public.mmhr_get_audit_events(${base.organizationId}::uuid)`;
            expect(events).toEqual(contained ? [] : [{ id: auditId }]);
          });
        }
      };
      await probe(false);
      expect(await asWorker(sql, (worker) => claimIntent(worker, f.intentId))).not.toBeNull();
      await probe(true);
    },
  },
  {
    name: "grants only three fixed worker functions and no raw security or Auth table access",
    async run(sql, base) {
      const f = await createRecoveryFixture(sql, base);
      await asWorker(sql, async () => undefined);
      const functions = await sql<{ name: string }[]>`SELECT p.proname AS name FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'mmhr_private'
        AND has_function_privilege('mmhr_worker', p.oid, 'EXECUTE') ORDER BY p.proname`;
      expect(functions.map((row) => row.name)).toEqual([
        "mmhr_claim_identity_intent", "mmhr_claim_identity_intent_reconciliation", "mmhr_record_identity_intent_result",
      ]);
      for (const table of [
        "public.identities", "public.identity_admin_intents", "public.identity_intent_attempts",
        "public.identity_recovery_presence", "public.identity_recovery_requests", "public.identity_recovery_approvals",
        "public.invitations", "public.audit_events", "mmhr_private.recovery_policy_state", "auth.sessions", "auth.mfa_factors",
      ]) {
        await expect(asWorker(sql, (worker) => worker.unsafe(`SELECT * FROM ${table}`))).rejects.toMatchObject({ code: "42501" });
        await expect(asWorker(sql, (worker) => worker.unsafe(`DELETE FROM ${table} WHERE false`))).rejects.toMatchObject({ code: "42501" });
      }
      for (const role of ["anon", "authenticated", "service_role"] as const) {
        await asRuntimeRole(sql, role, async () => undefined);
        await expect(asRuntimeRole(sql, role, (runtime) => claimIntent(runtime, f.intentId))).rejects.toMatchObject({ code: "42501" });
        await expect(asRuntimeRole(sql, role, (runtime) => claimIntent(runtime, f.intentId, true))).rejects.toMatchObject({ code: "42501" });
        await expect(asRuntimeRole(sql, role, (runtime) => runtime`SELECT mmhr_private.mmhr_record_identity_intent_result(
          ${f.intentId}::uuid, ${randomUUID()}, '{}'::jsonb)`)).rejects.toMatchObject({ code: "42501" });
      }
      await expect(asWorker(sql, (worker) => prepareRecoveryPolicy(worker, base))).rejects.toMatchObject({ code: "42501" });
    },
  },
  {
    name: "claims an exact reset once with a fenced lease and atomic containment audit",
    async run(sql, base) {
      const f = await createRecoveryFixture(sql, base);
      const claim = await asWorker(sql, (worker) => claimIntent(worker, f.intentId));
      if (!claim || claim.operation !== "mfa_enrollment_reset") throw new Error("Missing fixed reset claim");
      expect(claim).toMatchObject({ intentId: f.intentId, correlationId: f.correlationId, idempotencyKey: f.idempotencyKey,
        operation: "mfa_enrollment_reset", subjectId: f.subjectId, attemptNumber: 1, maximumAttempts: 5 });
      expect(Object.keys(claim!).sort()).toEqual([
        "intentId", "correlationId", "idempotencyKey", "operation", "subjectId", "leaseToken", "leaseExpiresAt", "attemptNumber", "maximumAttempts",
      ].sort());
      expect(claim.subjectId).not.toBe(f.target.identityId);
      await assertContained(sql, f);
      expect(await intentState(sql, f.intentId)).toMatchObject({ state: "in_flight", attempt_count: 1, dispatch_count: 1,
        lease_token: claim!.leaseToken, work_mode: "dispatch", manual_review_required: false });
      const events = await sql<{ action: string; actor_identity_id: string; correlation_id: string; idempotency_key: string }[]>`
        SELECT action, actor_identity_id, correlation_id, idempotency_key FROM public.audit_events
        WHERE idempotency_key = ${f.idempotencyKey} ORDER BY action`;
      expect(events).toEqual(["identity.intent.dispatch", "identity.recovery.contain"].map((action) => ({
        action, actor_identity_id: base.pair[0].identityId, correlation_id: f.correlationId, idempotency_key: f.idempotencyKey,
      })));
      const before = await intentSnapshot(sql);
      expect(await asWorker(sql, (worker) => claimIntent(worker, f.intentId))).toBeNull();
      expect(await asWorker(sql, (worker) => claimIntent(worker, f.intentId, true))).toBeNull();
      expect(await intentSnapshot(sql)).toEqual(before);
    },
  },
  {
    name: "blocks a second preapproved ordinary-target reset while the first identity remains contained",
    async run(sql, base) {
      const first = await createRecoveryFixture(sql, base);
      const second = await createRecoveryFixture(sql, base);
      expect(await asWorker(sql, (worker) => claimIntent(worker, first.intentId))).not.toBeNull();
      await expectNoDispatch(sql, second);
      expect(await intentState(sql, second.intentId)).toMatchObject({ state: "pending", attempt_count: 0, dispatch_count: 0 });
    },
  },
  {
    name: "permits a named super administrator's self-request with the other administrator's approval",
    async run(sql, base) {
      const f = await createRecoveryFixture(sql, base, { target: base.pair[0] });
      expect(await asWorker(sql, (worker) => claimIntent(worker, f.intentId))).not.toBeNull();
      await assertContained(sql, f);
    },
  },
  {
    name: "keeps the new request deadline when it links just before the original presence expires",
    async run(sql, base) {
      const f = await createRecoveryFixture(sql, base, { presenceCreatedOffsetMs: -31 * 60_000,
        presenceExpiresOffsetMs: -60_000, requestCreatedOffsetMs: -2 * 60_000, requestExpiresOffsetMs: 28 * 60_000 });
      expect(await asWorker(sql, (worker) => claimIntent(worker, f.intentId))).not.toBeNull();
    },
  },
  ...invalidRecovery.map(({ name, change, options }): IntentCase => ({
    name: `denies reset dispatch with ${name}`,
    async run(sql, base) {
      const f = await createRecoveryFixture(sql, base, options?.(base));
      if (change) await change(sql, f, base);
      await expectNoDispatch(sql, f);
    },
  })),
  ...(["missing", "denied", "self", "target", "outsider", "before_request", "future", "unstructured_evidence"] as const)
    .map((scenario): IntentCase => ({
      name: `denies reset dispatch with ${scenario} approval evidence`,
      async run(sql, base) {
        const f = await createRecoveryFixture(sql, base, {
          approval: scenario === "missing" || scenario === "denied" ? scenario : "approved",
          target: scenario === "target" ? base.pair[1] : undefined,
          approver: scenario === "self" ? base.pair[0] : scenario === "outsider" ? base.organizationAdmin : undefined,
          approvalOffsetMs: scenario === "before_request" ? -120_000 : scenario === "future" ? 60_000 : undefined,
          evidenceReference: scenario === "unstructured_evidence" ? "free-form phone claim" : undefined,
        });
        await expectNoDispatch(sql, f);
      },
    })),
  {
    name: "denies recovery before the fixed policy is prepared",
    async run(sql, base) {
      const f = await createRecoveryFixture(sql, base, { preparePolicy: false });
      await expectNoDispatch(sql, f);
    },
  },
  {
    name: "rolls back lease, attempt, containment, and both audits when an audit insert fails",
    async run(sql, base) {
      const f = await createRecoveryFixture(sql, base);
      await sql`ALTER TABLE public.audit_events ADD CONSTRAINT r1_intent_audit_failure CHECK (false) NOT VALID`;
      const before = await intentSnapshot(sql);
      await expect(asWorker(sql, (worker) => claimIntent(worker, f.intentId))).rejects.toMatchObject({ code: "23514" });
      expect(await intentSnapshot(sql)).toEqual(before);
    },
  },
  {
    name: "denies dispatch when durable organization administrator capacity is missing",
    async run(sql, base) {
      const f = await createRecoveryFixture(sql, base);
      await sql`UPDATE public.org_members SET status = 'suspended', suspended_at = clock_timestamp()
        WHERE id = ${base.adminMembershipId}::uuid`;
      const before = await intentSnapshot(sql);
      await expect(asWorker(sql, (worker) => claimIntent(worker, f.intentId))).rejects.toMatchObject(denied);
      expect(await intentSnapshot(sql)).toEqual(before);
    },
  },
  ...([
    { correlationId: null }, { issuerId: null }, { idempotencyKey: "unvalidated" }, { maximumAttempts: 6 },
  ] as const).map((override): IntentCase => ({
    name: `denies incomplete operation context ${Object.keys(override)[0]}`,
    async run(sql, base) {
      const f = await createInvitationFixture(sql, base, { seedIntent: false });
      await insertPendingIntent(sql, f, override);
      const before = await intentSnapshot(sql);
      expect(await asWorker(sql, (worker) => claimIntent(worker, f.intentId))).toBeNull();
      expect(await intentSnapshot(sql)).toEqual(before);
    },
  })),
  {
    name: "denies an unsupported correlation UUID before lease or containment writes",
    async run(sql, base) {
      const f = await createRecoveryFixture(sql, base, { seedIntent: false });
      await insertPendingIntent(sql, f, { correlationId: "11111111-1111-f111-8111-111111111111" });
      await expectNoDispatch(sql, f);
      expect(await intentState(sql, f.intentId)).toMatchObject({ state: "pending", attempt_count: 0, dispatch_count: 0 });
    },
  },
];
