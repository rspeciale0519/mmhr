import { randomUUID } from "node:crypto";
import { expect } from "vitest";

import { databaseNow } from "./r1-identity-intent-fixtures";
import { anotherSession, recoveryInput, recoverySnapshot, requireRecoveryReceipt } from "./r1-recovery-command-fixtures";
import {
  assertMfaWriteRejected, createRecoveryMfaFixture, enrollSyntheticRecoveryFactor, readySyntheticRecovery,
  reactivateRecovery, recoveryMfaContext, registerRecoveryFactor, verifySyntheticRecoveryFactor,
  type RecoveryMfaCase,
} from "./r1-recovery-mfa-fixtures";
import { asAuthenticated, commandInput, changeIdentityStatus, denied } from "./r1-security-command-fixtures";

export const recoveryMfaReactivationCases: RecoveryMfaCase[] = [
  {
    name: "atomically restores the named target, completes its presence, and restores full capacity",
    async run(sql, foundation) {
      const f = await readySyntheticRecovery(sql, foundation, { target: foundation.pair[0] });
      const before = await recoverySnapshot(sql);
      const input = recoveryInput();
      const receipt = await asAuthenticated(sql, f.target, (caller) => reactivateRecovery(caller, input));
      await requireRecoveryReceipt(sql, f.target, receipt, input, "identity.recovery.reactivate");
      expect(receipt.entity_id).toBe(f.target.identityId);
      expect(await sql`SELECT status, authorization_not_before = ${f.dispatchAt}::timestamptz AS same_fence
        FROM public.identities WHERE id = ${f.target.identityId}::uuid`).toEqual([{ status: "active", same_fence: true }]);
      expect(await sql`SELECT state, completed_at IS NOT NULL AS completed FROM public.identity_recovery_presence
        WHERE id = ${f.presenceId}::uuid`).toEqual([{ state: "completed", completed: true }]);
      await sql`SELECT mmhr_private.r1_assert_administration_capacity(clock_timestamp())`;
      expect(await asAuthenticated(sql, f.target, recoveryMfaContext)).toEqual([{
        recovery_request_id: f.requestId, recovery_presence_id: f.presenceId,
        expected_factor_id: f.factorId, state: "completed",
      }]);
      expect(await sql`SELECT action FROM public.audit_events WHERE command = 'identity.recovery.reactivate'
        AND actor_identity_id = ${f.target.identityId}::uuid ORDER BY action`).toEqual([
        { action: "identity.recovery.presence.complete" }, { action: "identity.recovery.reactivate" },
      ]);
      const after = await recoverySnapshot(sql);
      for (const table of ["public.platform_role_assignments", "public.org_members", "public.user_permission_overrides",
        "public.admin_delegation_grants", "public.identity_admin_intents", "public.identity_intent_attempts",
        "public.identity_recovery_requests", "public.identity_recovery_approvals"]) expect(after[table]).toEqual(before[table]);
    },
  },
  {
    name: "requires both a verified factor and fresh AAL2 rather than either one alone",
    async run(sql, foundation) {
      const f = await createRecoveryMfaFixture(sql, foundation);
      const factorId = await enrollSyntheticRecoveryFactor(sql, f);
      await asAuthenticated(sql, f.target, (caller) => registerRecoveryFactor(caller, factorId), "aal1");
      await assertMfaWriteRejected(sql, f, reactivateRecovery);
      await assertMfaWriteRejected(sql, f, reactivateRecovery, "aal2");
      await verifySyntheticRecoveryFactor(sql, f, factorId);
      await assertMfaWriteRejected(sql, f, reactivateRecovery);
    },
  },
  ...(["unverified", "verified"] as const).map((status): RecoveryMfaCase => ({
    name: `denies reactivation with an extra ${status} factor`,
    async run(sql, foundation) {
      const f = await readySyntheticRecovery(sql, foundation);
      await enrollSyntheticRecoveryFactor(sql, f, { status });
      await assertMfaWriteRejected(sql, f, reactivateRecovery, "aal2");
    },
  })),
  {
    name: "denies a verified factor that differs from the registered factor",
    async run(sql, foundation) {
      const f = await readySyntheticRecovery(sql, foundation);
      await sql`DELETE FROM auth.mfa_factors WHERE id = ${f.factorId}::uuid`;
      const factorId = await enrollSyntheticRecoveryFactor(sql, f);
      await verifySyntheticRecoveryFactor(sql, f, factorId);
      await assertMfaWriteRejected(sql, f, reactivateRecovery, "aal2");
    },
  },
  {
    name: "rechecks the current bound session before replaying a completion receipt",
    async run(sql, foundation) {
      const f = await readySyntheticRecovery(sql, foundation);
      const input = recoveryInput();
      const first = await asAuthenticated(sql, f.target, (caller) => reactivateRecovery(caller, input));
      expect(await asAuthenticated(sql, f.target, (caller) => reactivateRecovery(caller, input))).toEqual(first);
      await requireRecoveryReceipt(sql, f.target, first, input, "identity.recovery.reactivate");
      expect(await sql`SELECT id FROM public.security_command_receipts WHERE actor_identity_id = ${f.target.identityId}::uuid
        AND command = 'identity.recovery.reactivate'`).toHaveLength(1);
      await assertMfaWriteRejected(sql, f, reactivateRecovery, "aal2");
      const other = await anotherSession(sql, { ...f.target, factorId: f.factorId });
      await assertMfaWriteRejected(sql, { ...f, target: other }, (caller) => reactivateRecovery(caller, input), "aal2");
      await sql`DELETE FROM auth.sessions WHERE id = ${f.target.sessionId}::uuid`;
      await assertMfaWriteRejected(sql, f, (caller) => reactivateRecovery(caller, input), "aal2");
    },
  },
  ...(["identity.recovery.presence.complete", "identity.recovery.reactivate"] as const).map((action): RecoveryMfaCase => ({
    name: `rolls back identity and presence when ${action} audit insertion fails`,
    async run(sql, foundation) {
      const f = await readySyntheticRecovery(sql, foundation);
      await sql.unsafe(`ALTER TABLE public.audit_events ADD CONSTRAINT r1_mfa_completion_audit_failure
        CHECK (action <> '${action}') NOT VALID`);
      await assertMfaWriteRejected(sql, f, reactivateRecovery, "aal2", { code: "23514" });
    },
  })),
  ...(["other administrator", "organization administrator", "another recovery"] as const).map((kind): RecoveryMfaCase => ({
    name: `keeps containment when ${kind} prevents complete administrator capacity`,
    async run(sql, foundation) {
      const f = await readySyntheticRecovery(sql, foundation, { target: foundation.pair[0] });
      const identityId = kind === "other administrator" ? foundation.pair[1].identityId
        : kind === "organization administrator" ? foundation.organizationAdmin.identityId : foundation.target.identityId;
      await sql`UPDATE public.identities SET status = ${kind === "another recovery" ? "recovery_pending" : "suspended"}::public.identity_status,
        suspended_at = CASE WHEN ${kind} = 'another recovery' THEN NULL ELSE clock_timestamp() END
        WHERE id = ${identityId}::uuid`;
      await assertMfaWriteRejected(sql, f, reactivateRecovery, "aal2");
    },
  })),
  {
    name: "never permits generic status change to reactivate a contained target",
    async run(sql, foundation) {
      const f = await readySyntheticRecovery(sql, foundation);
      const before = await recoverySnapshot(sql);
      await expect(asAuthenticated(sql, foundation.pair[0],
        (caller) => changeIdentityStatus(caller, f.target.identityId, "active", commandInput()))).rejects.toMatchObject(denied);
      expect(await recoverySnapshot(sql)).toEqual(before);
    },
  },
  {
    name: "rejects pre-fence tokens before and after completion and denies every other old session",
    async run(sql, foundation) {
      const f = await readySyntheticRecovery(sql, foundation);
      const old = await anotherSession(sql, { ...f.target, factorId: f.factorId }, new Date(Date.parse(f.dispatchAt) - 1).toISOString());
      const oldIat = Math.floor(Date.parse(f.dispatchAt) / 1000);
      const oldClaims = async (completed: boolean) => {
        await asAuthenticated(sql, f.target, async (caller) => {
          await caller`SELECT set_config('request.jwt.claims',
            (current_setting('request.jwt.claims')::jsonb || ${JSON.stringify({ iat: oldIat })}::jsonb)::text,true)`;
          expect(await recoveryMfaContext(caller)).toEqual([]);
          expect(await caller`SELECT * FROM public.mmhr_get_my_identity()`).toEqual([]);
        });
        expect(await asAuthenticated(sql, old, (caller) => caller`SELECT * FROM public.mmhr_get_my_identity()`, "aal1")).toEqual([]);
        if (completed) expect(await asAuthenticated(sql, f.target,
          (caller) => caller`SELECT * FROM public.mmhr_get_my_identity()`)).toHaveLength(1);
      };
      await oldClaims(false);
      await asAuthenticated(sql, f.target, reactivateRecovery);
      await oldClaims(true);
      const fresh = await anotherSession(sql, { ...f.target, factorId: f.factorId }, await databaseNow(sql));
      expect(await asAuthenticated(sql, fresh, (caller) => caller`SELECT * FROM public.mmhr_get_my_identity()`, "aal1")).toHaveLength(1);
    },
  },
  {
    name: "denies unsupported completion UUID metadata without changes",
    async run(sql, foundation) {
      const f = await readySyntheticRecovery(sql, foundation);
      for (const field of ["correlationId", "idempotencyKey"] as const) {
        await assertMfaWriteRejected(sql, f, (caller) => reactivateRecovery(caller, {
          ...recoveryInput(), [field]: "11111111-1111-f111-8111-111111111111",
        }), "aal2", { code: "22023" });
      }
    },
  },
  {
    name: "keeps the expected factor and completed lifecycle immutable",
    async run(sql, foundation) {
      const f = await readySyntheticRecovery(sql, foundation);
      await expect(sql.savepoint((owner) => owner`UPDATE public.identity_recovery_presence
        SET expected_replacement_factor_id = ${randomUUID()} WHERE id = ${f.presenceId}::uuid`)).rejects.toMatchObject(denied);
      await asAuthenticated(sql, f.target, reactivateRecovery);
      for (const table of ["public.identity_recovery_presence", "public.identity_recovery_requests"] as const) {
        const id = table.endsWith("presence") ? f.presenceId : f.requestId;
        await expect(sql.savepoint((owner) => owner.unsafe(`UPDATE ${table} SET completed_at = clock_timestamp() WHERE id = $1::uuid`, [id])))
          .rejects.toMatchObject(denied);
      }
    },
  },
];
