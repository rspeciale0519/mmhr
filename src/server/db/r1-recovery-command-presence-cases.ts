import { randomUUID } from "node:crypto";
import { expect } from "vitest";

import { createRecoveryFixture } from "./r1-identity-intent-fixtures";
import { asAuthenticated, invalidInput } from "./r1-security-command-fixtures";
import {
  anotherSession, assertRecoveryRejected, createHistoricalPresence, createHistoricalRequest,
  createPresence, createPublicRecovery, historicalSession, recoveryInput,
  recoveryReference, recoverySnapshot, requestRecovery, requireRecoveryReceipt,
  type RecoveryCommandCase,
} from "./r1-recovery-command-fixtures";

export const recoveryPresenceCases: RecoveryCommandCase[] = [
  {
    name: "binds an AAL1 caller's presence to its own stable identity, Auth subject, and session for exactly thirty minutes",
    async run(sql, foundation) {
      const target = foundation.target;
      const reference = recoveryReference();
      const input = recoveryInput();
      const receipt = await asAuthenticated(sql, target, (caller) => createPresence(caller, reference.hash, input), "aal1");
      await requireRecoveryReceipt(sql, target, receipt, input, "identity.recovery.presence.create");
      const rows = await sql<{ target_identity_id: string; auth_subject_id: string; auth_session_id: string;
        opaque_reference_hash: string; state: string; lifetime: number; linked_request_id: string | null }[]>`
        SELECT target_identity_id, auth_subject_id, auth_session_id, opaque_reference_hash,
          state, extract(epoch FROM expires_at - created_at)::integer AS lifetime, linked_request_id
        FROM public.identity_recovery_presence WHERE id = ${receipt.entity_id}::uuid`;
      expect(rows).toEqual([{
        target_identity_id: target.identityId, auth_subject_id: target.subject, auth_session_id: target.sessionId,
        opaque_reference_hash: reference.hash, state: "pending", lifetime: 1_800, linked_request_id: null,
      }]);
      const persisted = JSON.stringify(await recoverySnapshot(sql));
      expect(persisted).not.toContain(reference.opaqueReference);
      expect(JSON.stringify(receipt)).not.toContain(reference.hash);
    },
  },
  {
    name: "lets the named AAL1 caller replace its own expired linked request before dispatch and make a fresh self-request",
    async run(sql, foundation) {
      const target = await historicalSession(sql, foundation.pair[0]);
      const old = await createRecoveryFixture(sql, foundation, {
        target, issuer: target, preparePolicy: false,
        presenceCreatedOffsetMs: -32 * 60_000, presenceExpiresOffsetMs: -2 * 60_000,
        requestCreatedOffsetMs: -31 * 60_000, requestExpiresOffsetMs: -60_000,
        approvedOffsetMs: -30 * 60_000, approvalOffsetMs: -30 * 60_000 - 1_000,
      });
      const approvalBefore = await sql`SELECT * FROM public.identity_recovery_approvals WHERE id = ${old.approvalId}::uuid`;
      const reference = recoveryReference();
      const input = recoveryInput();
      const receipt = await asAuthenticated(sql, target, (caller) => createPresence(caller, reference.hash, input), "aal1");
      await requireRecoveryReceipt(sql, target, receipt, input, "identity.recovery.presence.create");
      const [ended] = await sql<{ request: string; presence: string; intent: string; dispatch_count: number;
        attempt_count: number; identity: string }[]>`
        SELECT r.state AS request, p.state AS presence, i.state AS intent, i.dispatch_count, i.attempt_count,
          target.status AS identity FROM public.identity_recovery_requests r
        JOIN public.identity_recovery_presence p ON p.id = r.recovery_presence_id
        JOIN public.identity_admin_intents i ON i.recovery_request_id = r.id
        JOIN public.identities target ON target.id = r.target_identity_id WHERE r.id = ${old.requestId}::uuid`;
      expect(ended).toEqual({ request: "expired", presence: "cancelled", intent: "cancelled",
        dispatch_count: 0, attempt_count: 0, identity: "active" });
      expect(await sql`SELECT * FROM public.identity_recovery_approvals WHERE id = ${old.approvalId}::uuid`).toEqual(approvalBefore);
      const after = await recoverySnapshot(sql, true);
      expect(await asAuthenticated(sql, target, (caller) => createPresence(caller, reference.hash, input), "aal1")).toEqual(receipt);
      expect(await recoverySnapshot(sql, true)).toEqual(after);
      const request = await asAuthenticated(sql, target, (caller) => requestRecovery(caller, reference.opaqueReference), "aal1");
      const [fresh] = await sql<{ state: string; target_identity_id: string; initiated_by_identity_id: string;
        recovery_presence_id: string }[]>`SELECT state, target_identity_id, initiated_by_identity_id, recovery_presence_id
        FROM public.identity_recovery_requests WHERE id = ${request.entity_id}::uuid`;
      expect(fresh).toEqual({ state: "pending", target_identity_id: target.identityId,
        initiated_by_identity_id: target.identityId, recovery_presence_id: receipt.entity_id });
    },
  },
  {
    name: "does not replace an unexpired linked self-request",
    async run(sql, foundation) {
      const target = foundation.pair[0];
      await createPublicRecovery(sql, foundation, target, target);
      await assertRecoveryRejected(sql, target, (caller) => createPresence(caller, recoveryReference().hash), undefined, "aal1");
    },
  },
  ...(["pending", "expired"] as const).map((oldState): RecoveryCommandCase => ({
    name: `replaces only the same session's ${oldState} unlinked reference and preserves its original deadline`,
    async run(sql, foundation) {
      const prior = await createHistoricalPresence(sql, foundation.target, oldState === "expired"
        ? { createdOffsetMs: -31 * 60_000, expiresOffsetMs: -60_000 } : {});
      const input = recoveryInput();
      const receipt = await asAuthenticated(sql, prior.target, (caller) => createPresence(caller, recoveryReference().hash, input), "aal1");
      const [row] = await sql<{ state: string; deadline: boolean; cancelled: boolean }[]>`
        SELECT state, expires_at = ${prior.expiresAt}::timestamptz AS deadline, cancelled_at IS NOT NULL AS cancelled
        FROM public.identity_recovery_presence WHERE id = ${prior.id}::uuid`;
      expect(row).toEqual({ state: oldState === "expired" ? "expired" : "cancelled", deadline: true, cancelled: oldState === "pending" });
      await requireRecoveryReceipt(sql, prior.target, receipt, input, "identity.recovery.presence.create");
      await assertRecoveryRejected(sql, foundation.pair[0], (caller) => requestRecovery(caller, prior.reference.opaqueReference));
    },
  })),
  {
    name: "replays presence creation with a new correlation ID but rejects changed reference input",
    async run(sql, foundation) {
      const reference = recoveryReference();
      const input = recoveryInput();
      const receipt = await asAuthenticated(sql, foundation.target, (caller) => createPresence(caller, reference.hash, input), "aal1");
      const before = await recoverySnapshot(sql, true);
      expect(await asAuthenticated(sql, foundation.target,
        (caller) => createPresence(caller, reference.hash, { ...input, correlationId: randomUUID() }), "aal1")).toEqual(receipt);
      expect(await recoverySnapshot(sql, true)).toEqual(before);
      await requireRecoveryReceipt(sql, foundation.target, receipt, input, "identity.recovery.presence.create");
      await assertRecoveryRejected(sql, foundation.target,
        (caller) => createPresence(caller, recoveryReference().hash, input), invalidInput, "aal1");
    },
  },
  {
    name: "does not change another session's linked reference when the same identity creates a new reference",
    async run(sql, foundation) {
      const old = await createPublicRecovery(sql, foundation, foundation.pair[0], foundation.pair[0]);
      const prior = await sql`SELECT * FROM public.identity_recovery_presence WHERE id = ${old.presence.entity_id}::uuid`;
      const current = await anotherSession(sql, foundation.pair[0]);
      const reference = recoveryReference();
      await asAuthenticated(sql, current, (caller) => createPresence(caller, reference.hash), "aal1");
      expect(await sql`SELECT * FROM public.identity_recovery_presence WHERE id = ${old.presence.entity_id}::uuid`).toEqual(prior);
      await assertRecoveryRejected(sql, current, (caller) => requestRecovery(caller, reference.opaqueReference), undefined, "aal1");
    },
  },
  {
    name: "does not replace a linked reference when only the presence deadline has expired",
    async run(sql, foundation) {
      const old = await createHistoricalRequest(sql, foundation, {
        target: foundation.pair[0], issuer: foundation.pair[0],
        presenceCreatedOffsetMs: -31 * 60_000, presenceExpiresOffsetMs: -60_000,
        createdOffsetMs: -2 * 60_000, expiresOffsetMs: 28 * 60_000,
      });
      await assertRecoveryRejected(sql, old.target, (caller) => createPresence(caller, recoveryReference().hash), undefined, "aal1");
    },
  },
  {
    name: "does not release an expired self-request when stored dispatch history exists despite zero parent counters",
    async run(sql, foundation) {
      const target = await historicalSession(sql, foundation.pair[0]);
      const old = await createRecoveryFixture(sql, foundation, {
        target, issuer: target, preparePolicy: false,
        presenceCreatedOffsetMs: -32 * 60_000, presenceExpiresOffsetMs: -2 * 60_000,
        requestCreatedOffsetMs: -31 * 60_000, requestExpiresOffsetMs: -60_000,
        approvedOffsetMs: -30 * 60_000, approvalOffsetMs: -30 * 60_000 - 1_000,
      });
      await sql`INSERT INTO public.identity_intent_attempts
        (intent_id, attempt_number, mode, lease_token, correlation_id, started_at, lease_expires_at)
        VALUES (${old.intentId}::uuid, 1, 'dispatch', ${randomUUID()}::uuid, ${old.correlationId}::uuid,
          clock_timestamp() - interval '20 minutes', clock_timestamp() - interval '5 minutes')`;
      await assertRecoveryRejected(sql, target, (caller) => createPresence(caller, recoveryReference().hash), undefined, "aal1");
    },
  },
  ...([null, "", "A".repeat(64), "a".repeat(63)] as const).map((referenceHash, index): RecoveryCommandCase => ({
    name: `rejects malformed presence hash ${index + 1} without a reference row or audit`,
    async run(sql, foundation) {
      await assertRecoveryRejected(sql, foundation.target, (caller) => createPresence(caller, referenceHash), invalidInput, "aal1");
    },
  })),
];
