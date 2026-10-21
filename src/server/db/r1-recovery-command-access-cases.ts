import { randomUUID } from "node:crypto";
import { expect } from "vitest";
import { z } from "zod";

import { asRuntimeRole } from "./r1-identity-intent-fixtures";
import { asAuthenticated, denied, invalidInput, restrictAuthSubject } from "./r1-security-command-fixtures";
import {
  assertRecoveryRejected, confirmedPhoneCheck, createPresence, createPublicRecovery, decideRecovery,
  endRecovery, recoveryInput, recoveryReference, recoverySnapshot, requestRecovery, type RecoveryCommandCase,
} from "./r1-recovery-command-fixtures";

export const recoveryAccessCases: RecoveryCommandCase[] = [
  {
    name: "keeps presence creation disabled until the exact named-pair recovery policy is prepared",
    preparePolicy: false,
    async run(sql, foundation) {
      await assertRecoveryRejected(sql, foundation.target, (caller) => createPresence(caller, recoveryReference().hash), undefined, "aal1");
    },
  },
  ...(["banned", "deleted", "anonymous"] as const).map((restriction): RecoveryCommandCase => ({
    name: `denies AAL1 presence to a ${restriction} Auth subject with an earlier session`,
    async run(sql, foundation) {
      await restrictAuthSubject(sql, foundation.target, restriction);
      await assertRecoveryRejected(sql, foundation.target, (caller) => createPresence(caller, recoveryReference().hash), undefined, "aal1");
    },
  })),
  {
    name: "denies AAL1 presence when its live Auth session no longer exists",
    async run(sql, foundation) {
      await sql`DELETE FROM auth.sessions WHERE id = ${foundation.target.sessionId}::uuid`;
      await assertRecoveryRejected(sql, foundation.target, (caller) => createPresence(caller, recoveryReference().hash), undefined, "aal1");
    },
  },
  ...([
    ["missing subject", { sub: null }], ["malformed subject", { sub: "invalid" }],
    ["malformed session", { session_id: "invalid" }], ["malformed expiry", { exp: "invalid" }],
    ["expired token", { exp: 1 }], ["wrong role", { role: "service_role" }],
    ["unsupported assurance", { aal: "aal3" }],
  ] satisfies [string, Record<string, unknown>][]).map(([label, patch]): RecoveryCommandCase => ({
    name: `denies presence with ${label} claims without leaking a SQL cast error`,
    async run(sql, foundation) {
      await assertRecoveryRejected(sql, foundation.target, async (caller) => {
        const [current] = await caller<{ claims: Record<string, unknown> }[]>`SELECT auth.jwt() AS claims`;
        await caller`SELECT set_config('request.jwt.claims', ${JSON.stringify({ ...current!.claims, ...patch })}, true)`;
        return createPresence(caller, recoveryReference().hash);
      }, denied, "aal1");
    },
  })),
  ...(["missing named factor", "missing organization administrator"] as const).map((loss): RecoveryCommandCase => ({
    name: `denies recovery commands when capacity loses its ${loss}`,
    async run(sql, foundation) {
      const fixture = await createPublicRecovery(sql, foundation);
      const decision = await confirmedPhoneCheck(sql);
      if (loss === "missing named factor") {
        await sql`UPDATE auth.mfa_factors SET status = 'unverified' WHERE id = ${foundation.pair[0].factorId}::uuid`;
      } else {
        await sql`UPDATE public.org_members SET status = 'suspended', suspended_at = clock_timestamp()
          WHERE id = ${foundation.adminMembershipId}::uuid`;
      }
      await assertRecoveryRejected(sql, foundation.organizationAdmin, (caller) => createPresence(caller, recoveryReference().hash), undefined, "aal1");
      await assertRecoveryRejected(sql, foundation.pair[1], (caller) => decideRecovery(caller, fixture.request.entity_id, decision));
      await assertRecoveryRejected(sql, foundation.pair[1], (caller) => endRecovery(caller, fixture.request.entity_id, "cancelled"));
    },
  })),
  ...(["suspended approver", "denied approval permission", "denied administration gate"] as const).map((loss): RecoveryCommandCase => ({
    name: `denies a pending request's approval after ${loss}`,
    async run(sql, foundation) {
      const fixture = await createPublicRecovery(sql, foundation);
      const decision = await confirmedPhoneCheck(sql);
      const approver = foundation.pair[1];
      if (loss === "suspended approver") {
        await sql`UPDATE public.identities SET status = 'suspended', suspended_at = clock_timestamp()
          WHERE id = ${approver.identityId}::uuid`;
      } else {
        await sql`INSERT INTO public.user_permission_overrides
          (identity_id, permission_key, scope_kind, scope_key, effect, issued_by_identity_id, issue_reason)
          VALUES (${approver.identityId}::uuid, ${loss === "denied approval permission" ? "identity.recovery.approve" : "admin.access"},
            'platform', 'platform', 'deny', ${foundation.pair[0].identityId}::uuid, 'Synthetic authority-loss fixture')`;
      }
      await assertRecoveryRejected(sql, approver, (caller) => decideRecovery(caller, fixture.request.entity_id, decision));
    },
  })),
  ...([
    ["invalid version", "11111111-1111-0111-8111-111111111111"],
    ["invalid variant", "11111111-1111-4111-7111-111111111111"],
  ] as const).flatMap(([label, value]) => (["correlationId", "idempotencyKey"] as const).map((field): RecoveryCommandCase => ({
    name: `rejects presence ${field} with an ${label} accepted by PostgreSQL uuid`,
    async run(sql, foundation) {
      expect(z.uuid().safeParse(value).success).toBe(false);
      const input = { ...recoveryInput(), [field]: value };
      await assertRecoveryRejected(sql, foundation.target, (caller) => createPresence(caller, recoveryReference().hash, input), invalidInput, "aal1");
    },
  }))),
  ...(["request", "decision", "end"] as const).map((operation): RecoveryCommandCase => ({
    name: `rejects unsupported UUID metadata through the direct ${operation} SQL function`,
    async run(sql, foundation) {
      const input = { ...recoveryInput(), idempotencyKey: "11111111-1111-4111-7111-111111111111" };
      expect(z.uuid().safeParse(input.idempotencyKey).success).toBe(false);
      const decision = await confirmedPhoneCheck(sql);
      if (operation === "request") {
        const reference = recoveryReference();
        await asAuthenticated(sql, foundation.target, (caller) => createPresence(caller, reference.hash), "aal1");
        await assertRecoveryRejected(sql, foundation.pair[0], (caller) => requestRecovery(caller, reference.opaqueReference, input), invalidInput);
      } else {
        const fixture = await createPublicRecovery(sql, foundation);
        const currentDecision = operation === "decision" ? await confirmedPhoneCheck(sql) : decision;
        await assertRecoveryRejected(sql, foundation.pair[1], (caller) => operation === "decision"
          ? decideRecovery(caller, fixture.request.entity_id, currentDecision, input)
          : endRecovery(caller, fixture.request.entity_id, "cancelled", input), invalidInput);
      }
    },
  })),
  {
    name: "rejects null presence metadata before taking the authority guard",
    async run(sql, foundation) {
      await assertRecoveryRejected(sql, foundation.target, (caller) => caller`
        SELECT public.mmhr_create_recovery_presence(${recoveryReference().hash}, ${randomUUID()}::uuid, NULL::uuid)`, invalidInput, "aal1");
    },
  },
  ...(["anon", "service_role", "mmhr_worker"] as const).map((role): RecoveryCommandCase => ({
    name: `denies the ${role} SQL role every public recovery command`,
    async run(sql) {
      const before = await recoverySnapshot(sql);
      const reference = recoveryReference();
      const decision = await confirmedPhoneCheck(sql);
      const callbacks = [
        (caller: typeof sql) => createPresence(caller, reference.hash),
        (caller: typeof sql) => requestRecovery(caller, reference.opaqueReference),
        (caller: typeof sql) => decideRecovery(caller, randomUUID(), decision),
        (caller: typeof sql) => endRecovery(caller, randomUUID(), "cancelled"),
      ];
      for (const callback of callbacks) await expect(asRuntimeRole(sql, role, callback)).rejects.toMatchObject({ code: "42501" });
      expect(await recoverySnapshot(sql)).toEqual(before);
    },
  })),
  {
    name: "keeps raw recovery tables and private recovery helpers inaccessible to authenticated callers",
    async run(sql, foundation) {
      const before = await recoverySnapshot(sql);
      const tables = ["identity_recovery_presence", "identity_recovery_requests", "identity_recovery_approvals", "identity_admin_intents", "identity_intent_attempts"];
      for (const table of tables) {
        await expect(asAuthenticated(sql, foundation.pair[0], (caller) => caller.unsafe(`SELECT * FROM public.${table}`)))
          .rejects.toMatchObject({ code: "42501" });
        await expect(asAuthenticated(sql, foundation.pair[0], (caller) => caller.unsafe(`DELETE FROM public.${table} WHERE false`)))
          .rejects.toMatchObject({ code: "42501" });
      }
      await expect(asAuthenticated(sql, foundation.pair[0], (caller) => caller`
        SELECT mmhr_private.r1_start_recovery_presence_command(${randomUUID()}::uuid, ${randomUUID()}::uuid)`))
        .rejects.toMatchObject({ code: "42501" });
      await expect(asAuthenticated(sql, foundation.pair[0], (caller) => caller`
        SELECT mmhr_private.r1_end_recovery_before_dispatch(${randomUUID()}::uuid, 'cancelled',
          ${foundation.pair[0].identityId}::uuid, ${randomUUID()}::uuid, ${randomUUID()}::uuid, clock_timestamp())`))
        .rejects.toMatchObject({ code: "42501" });
      expect(await recoverySnapshot(sql)).toEqual(before);
    },
  },
  {
    name: "exposes only fixed volatile security-definer recovery functions with empty search paths",
    async run(sql) {
      const rows = await sql<{ name: string; volatile: string; definer: boolean; search: string[];
        authenticated: boolean; anonymous: boolean; service: boolean; worker: boolean }[]>`
        SELECT p.proname AS name, p.provolatile AS volatile, p.prosecdef AS definer, p.proconfig AS search,
          has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated,
          has_function_privilege('anon', p.oid, 'EXECUTE') AS anonymous,
          has_function_privilege('service_role', p.oid, 'EXECUTE') AS service,
          has_function_privilege('mmhr_worker', p.oid, 'EXECUTE') AS worker
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname IN ('mmhr_create_recovery_presence', 'mmhr_request_identity_recovery',
          'mmhr_decide_identity_recovery', 'mmhr_end_identity_recovery') ORDER BY p.proname`;
      expect(rows).toEqual(["mmhr_create_recovery_presence", "mmhr_decide_identity_recovery", "mmhr_end_identity_recovery", "mmhr_request_identity_recovery"]
        .map((name) => ({ name, volatile: "v", definer: true, search: ['search_path=""'],
          authenticated: true, anonymous: false, service: false, worker: false })));
    },
  },
];
