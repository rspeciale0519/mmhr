import { randomUUID } from "node:crypto";
import { expect } from "vitest";
import { z } from "zod";

import { asWorker, claimIntent, createRecoveryFixture } from "./r1-identity-intent-fixtures";
import { assignPlatformRole } from "./r1-security-command-administration-fixtures";
import { asAuthenticated, createSecurityPrincipal, invalidInput } from "./r1-security-command-fixtures";
import { requirePermissionUse } from "./r1-security-command-permission-fixtures";
import {
  assertRecoveryRejected, confirmedPhoneCheck, createHistoricalRequest, createPublicRecovery, decideRecovery,
  endRecovery, historicalSession, recoveryInput, recoverySnapshot, requireRecoveryReceipt, type RecoveryCommandCase,
} from "./r1-recovery-command-fixtures";

export const recoveryEndCases: RecoveryCommandCase[] = [
  ...(["pending", "approved"] as const).map((initialState): RecoveryCommandCase => ({
    name: `cancels a ${initialState} request and its linked presence before dispatch with an immutable retry receipt`,
    async run(sql, foundation) {
      const fixture = await createPublicRecovery(sql, foundation);
      if (initialState === "approved") {
        const decision = await confirmedPhoneCheck(sql);
        await asAuthenticated(sql, foundation.pair[1], (caller) => decideRecovery(caller, fixture.request.entity_id, decision));
      }
      const approvalBefore = await sql`SELECT * FROM public.identity_recovery_approvals`;
      const input = recoveryInput();
      const receipt = await asAuthenticated(sql, foundation.pair[0], (caller) => endRecovery(caller, fixture.request.entity_id, "cancelled", input));
      await requireRecoveryReceipt(sql, foundation.pair[0], receipt, input, "identity.recovery.cancel");
      const [state] = await sql<{ request: string; presence: string; request_cancelled: boolean; presence_cancelled: boolean }[]>`
        SELECT r.state AS request, p.state AS presence, r.cancelled_at IS NOT NULL AS request_cancelled,
          p.cancelled_at IS NOT NULL AS presence_cancelled FROM public.identity_recovery_requests r
        JOIN public.identity_recovery_presence p ON p.id = r.recovery_presence_id WHERE r.id = ${fixture.request.entity_id}::uuid`;
      expect(state).toEqual({ request: "cancelled", presence: "cancelled", request_cancelled: true, presence_cancelled: true });
      expect(await sql`SELECT * FROM public.identity_recovery_approvals`).toEqual(approvalBefore);
      const intents = await sql<{ id: string; state: string; attempt_count: number; dispatch_count: number }[]>`
        SELECT id, state, attempt_count, dispatch_count FROM public.identity_admin_intents
        WHERE recovery_request_id = ${fixture.request.entity_id}::uuid`;
      expect(intents).toHaveLength(initialState === "approved" ? 1 : 0);
      if (initialState === "approved") {
        expect(intents[0]).toMatchObject({ state: "cancelled", attempt_count: 0, dispatch_count: 0 });
        expect(await asWorker(sql, (worker) => claimIntent(worker, intents[0]!.id))).toBeNull();
        expect(await sql`SELECT id FROM public.identity_intent_attempts`).toHaveLength(0);
      }
      const beforeRetry = await recoverySnapshot(sql, true);
      expect(await asAuthenticated(sql, foundation.pair[0], (caller) => endRecovery(caller, fixture.request.entity_id, "cancelled", input))).toEqual(receipt);
      expect(await recoverySnapshot(sql, true)).toEqual(beforeRetry);
      await assertRecoveryRejected(sql, foundation.pair[0], (caller) => endRecovery(caller, fixture.request.entity_id, "cancelled"));
    },
  })),
  ...(["pending", "approved"] as const).map((initialState): RecoveryCommandCase => ({
    name: `expires a ${initialState} request only after its immutable deadline and cancels any undispatched intent`,
    async run(sql, foundation) {
      const offsets = {
        presenceCreatedOffsetMs: -32 * 60_000, presenceExpiresOffsetMs: -2 * 60_000,
        requestCreatedOffsetMs: -31 * 60_000, requestExpiresOffsetMs: -60_000,
      };
      const requestId = initialState === "approved"
        ? (await createRecoveryFixture(sql, foundation, { ...offsets, target: await historicalSession(sql, foundation.target),
          approvedOffsetMs: -30 * 60_000, approvalOffsetMs: -30 * 60_000 - 1_000, preparePolicy: false })).requestId
        : (await createHistoricalRequest(sql, foundation, { ...offsets,
          createdOffsetMs: offsets.requestCreatedOffsetMs, expiresOffsetMs: offsets.requestExpiresOffsetMs })).requestId;
      const [before] = await sql<{ created_at: string; expires_at: string }[]>`
        SELECT created_at::text, expires_at::text FROM public.identity_recovery_requests WHERE id = ${requestId}::uuid`;
      const input = recoveryInput();
      const receipt = await asAuthenticated(sql, foundation.pair[1], (caller) => endRecovery(caller, requestId, "expired", input));
      await requireRecoveryReceipt(sql, foundation.pair[1], receipt, input, "identity.recovery.expire");
      const [after] = await sql<{ created_at: string; expires_at: string; state: string; cancelled_at: null }[]>`
        SELECT created_at::text, expires_at::text, state, cancelled_at FROM public.identity_recovery_requests WHERE id = ${requestId}::uuid`;
      expect(after).toEqual({ ...before, state: "expired", cancelled_at: null });
      expect(await sql<{ state: string }[]>`SELECT p.state FROM public.identity_recovery_presence p
        JOIN public.identity_recovery_requests r ON r.recovery_presence_id = p.id WHERE r.id = ${requestId}::uuid`)
        .toEqual([{ state: "cancelled" }]);
      const intents = await sql<{ state: string }[]>`SELECT state FROM public.identity_admin_intents WHERE recovery_request_id = ${requestId}::uuid`;
      expect(intents).toEqual(initialState === "approved" ? [{ state: "cancelled" }] : []);
      const beforeRetry = await recoverySnapshot(sql, true);
      expect(await asAuthenticated(sql, foundation.pair[1], (caller) => endRecovery(caller, requestId, "expired", input))).toEqual(receipt);
      expect(await recoverySnapshot(sql, true)).toEqual(beforeRetry);
    },
  })),
  {
    name: "does not expire a live request before its deadline",
    async run(sql, foundation) {
      const fixture = await createPublicRecovery(sql, foundation);
      await assertRecoveryRejected(sql, foundation.pair[0], (caller) => endRecovery(caller, fixture.request.entity_id, "expired"));
    },
  },
  {
    name: "does not cancel or expire a request after its worker claims provider dispatch",
    async run(sql, foundation) {
      const fixture = await createPublicRecovery(sql, foundation);
      const decision = await confirmedPhoneCheck(sql);
      await asAuthenticated(sql, foundation.pair[1], (caller) => decideRecovery(caller, fixture.request.entity_id, decision));
      const [intent] = await sql<{ id: string }[]>`SELECT id FROM public.identity_admin_intents WHERE recovery_request_id = ${fixture.request.entity_id}::uuid`;
      expect(await asWorker(sql, (worker) => claimIntent(worker, intent!.id))).toMatchObject({ operation: "mfa_enrollment_reset" });
      for (const state of ["cancelled", "expired"]) {
        await assertRecoveryRejected(sql, foundation.pair[0], (caller) => endRecovery(caller, fixture.request.entity_id, state));
      }
    },
  },
  ...(["cancelled", "expired"] as const).map((endState): RecoveryCommandCase => ({
    name: `does not mark a request ${endState} when stored dispatch history conflicts with zero intent counters`,
    async run(sql, foundation) {
      const fixture = await createRecoveryFixture(sql, foundation, {
        target: await historicalSession(sql, foundation.target), preparePolicy: false,
        ...(endState === "expired" ? {
          presenceCreatedOffsetMs: -32 * 60_000, presenceExpiresOffsetMs: -2 * 60_000,
          requestCreatedOffsetMs: -31 * 60_000, requestExpiresOffsetMs: -60_000,
          approvedOffsetMs: -30 * 60_000, approvalOffsetMs: -30 * 60_000 - 1_000,
        } : {}),
      });
      // Preserve conflicting legacy evidence at INSERT. Never rewrite a real
      // attempt, reset counters, or disable the immutable-history trigger.
      await sql`INSERT INTO public.identity_intent_attempts
        (intent_id, attempt_number, mode, lease_token, correlation_id, started_at, lease_expires_at)
        VALUES (${fixture.intentId}::uuid, 1, 'dispatch', ${randomUUID()}::uuid, ${fixture.correlationId}::uuid,
          clock_timestamp() - interval '20 minutes', clock_timestamp() - interval '5 minutes')`;
      const [intent] = await sql<{ state: string; attempt_count: number; dispatch_count: number }[]>`
        SELECT state, attempt_count, dispatch_count FROM public.identity_admin_intents WHERE id = ${fixture.intentId}::uuid`;
      expect(intent).toEqual({ state: "pending", attempt_count: 0, dispatch_count: 0 });
      expect(await sql`SELECT id FROM public.identity_intent_attempts WHERE intent_id = ${fixture.intentId}::uuid`).toHaveLength(1);
      await assertRecoveryRejected(sql, foundation.pair[0], (caller) => endRecovery(caller, fixture.requestId, endState));
    },
  })),
  {
    name: "requires AAL2 for an explicit cancel even when the named target created its own request with AAL1",
    async run(sql, foundation) {
      const target = foundation.pair[0];
      const fixture = await createPublicRecovery(sql, foundation, target, target);
      await assertRecoveryRejected(sql, target, (caller) => endRecovery(caller, fixture.request.entity_id, "cancelled"), undefined, "aal1");
      expect((await asAuthenticated(sql, foundation.pair[1],
        (caller) => endRecovery(caller, fixture.request.entity_id, "cancelled"))).action).toBe("identity.recovery.cancel");
    },
  },
  {
    name: "does not let a third Super Admin end the named pair's request",
    async run(sql, foundation) {
      const fixture = await createPublicRecovery(sql, foundation);
      const third = await createSecurityPrincipal(sql);
      await asAuthenticated(sql, foundation.pair[0], (caller) => assignPlatformRole(caller, third.identityId, "super_admin"));
      await requirePermissionUse(sql, third, "identity.recovery.request", null, true);
      await assertRecoveryRejected(sql, third, (caller) => endRecovery(caller, fixture.request.entity_id, "cancelled"));
    },
  },
  {
    name: "rejects reuse of a cancel idempotency key for a different request",
    async run(sql, foundation) {
      const first = await createPublicRecovery(sql, foundation);
      const second = await createPublicRecovery(sql, foundation, foundation.organizationAdmin);
      const input = recoveryInput();
      await asAuthenticated(sql, foundation.pair[0], (caller) => endRecovery(caller, first.request.entity_id, "cancelled", input));
      await assertRecoveryRejected(sql, foundation.pair[0], (caller) => endRecovery(caller, second.request.entity_id, "cancelled", input), invalidInput);
    },
  },
  {
    name: "rejects an unknown request without exposing its existence through a different error",
    async run(sql, foundation) {
      await assertRecoveryRejected(sql, foundation.pair[0], (caller) => endRecovery(caller, randomUUID(), "cancelled"));
    },
  },
  ...([null, "active", "completed", "pending"] as const).map((endState): RecoveryCommandCase => ({
    name: `rejects unsupported recovery end state ${String(endState)}`,
    async run(sql, foundation) {
      const fixture = await createPublicRecovery(sql, foundation);
      await assertRecoveryRejected(sql, foundation.pair[0], (caller) => endRecovery(caller, fixture.request.entity_id, endState), invalidInput);
    },
  })),
  {
    name: "rejects an unsupported request UUID through the direct public end function",
    async run(sql, foundation) {
      const unsupportedUuid = "11111111-1111-0111-8111-111111111111";
      expect(z.uuid().safeParse(unsupportedUuid).success).toBe(false);
      await assertRecoveryRejected(sql, foundation.pair[0], (caller) => endRecovery(caller, unsupportedUuid, "cancelled"), invalidInput);
    },
  },
];
