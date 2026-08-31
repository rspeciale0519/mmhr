import { createHash, randomUUID } from "node:crypto";
import { expect } from "vitest";
import { z } from "zod";

import { assignPlatformRole } from "./r1-security-command-administration-fixtures";
import { asAuthenticated, createSecurityPrincipal, invalidInput, restrictAuthSubject } from "./r1-security-command-fixtures";
import { requirePermissionUse } from "./r1-security-command-permission-fixtures";
import {
  assertRecoveryRejected, confirmedPhoneCheck, createHistoricalRequest, createPublicRecovery,
  decideRecovery, recoveryInput, recoverySnapshot, requireRecoveryReceipt,
  type RecoveryCommandCase, type RecoveryDecision,
} from "./r1-recovery-command-fixtures";

export const recoveryDecisionCases: RecoveryCommandCase[] = [
  {
    name: "records the other named administrator's AAL2 approval and queues exactly one bound MFA reset",
    async run(sql, foundation) {
      const fixture = await createPublicRecovery(sql, foundation);
      const decision = await confirmedPhoneCheck(sql);
      const input = recoveryInput();
      const receipt = await asAuthenticated(sql, foundation.pair[1],
        (caller) => decideRecovery(caller, fixture.request.entity_id, decision, input));
      await requireRecoveryReceipt(sql, foundation.pair[1], receipt, input, "identity.recovery.decide", "identity.recovery.approve");
      expect(receipt.entity_id).toBe(fixture.request.entity_id);
      const approvals = await sql<{ approver_identity_id: string; decision: string; assurance: string;
        pre_existing_contact_attested: boolean; phone_check_result: string; evidence_reference: string }[]>`
        SELECT approver_identity_id, decision, assurance, pre_existing_contact_attested, phone_check_result, evidence_reference
        FROM public.identity_recovery_approvals WHERE request_id = ${fixture.request.entity_id}::uuid`;
      expect(approvals).toEqual([{ approver_identity_id: foundation.pair[1].identityId, decision: "approved", assurance: "aal2",
        pre_existing_contact_attested: true, phone_check_result: "confirmed", evidence_reference: decision.evidenceReference }]);
      const intents = await sql<{ operation: string; target_identity_id: string; initiated_by_identity_id: string;
        auth_subject_id: string; idempotency_key: string; correlation_id: string; state: string;
        attempt_count: number; dispatch_count: number; maximum_attempts: number }[]>`
        SELECT operation, target_identity_id, initiated_by_identity_id, auth_subject_id, idempotency_key, correlation_id,
          state, attempt_count, dispatch_count, maximum_attempts FROM public.identity_admin_intents
        WHERE recovery_request_id = ${fixture.request.entity_id}::uuid`;
      expect(intents).toEqual([{ operation: "mfa_enrollment_reset", target_identity_id: fixture.target.identityId,
        initiated_by_identity_id: fixture.issuer.identityId, auth_subject_id: fixture.target.subject,
        idempotency_key: createHash("sha256").update(`identity.recovery.reset:${fixture.request.entity_id}`).digest("hex"),
        correlation_id: input.correlationId, state: "pending", attempt_count: 0, dispatch_count: 0, maximum_attempts: 5 }]);
      const [state] = await sql<{ identity: string; request: string; presence: string; fenced: boolean }[]>`
        SELECT i.status AS identity, r.state AS request, p.state AS presence, i.authorization_not_before IS NOT NULL AS fenced
        FROM public.identity_recovery_requests r JOIN public.identities i ON i.id = r.target_identity_id
        JOIN public.identity_recovery_presence p ON p.id = r.recovery_presence_id WHERE r.id = ${fixture.request.entity_id}::uuid`;
      expect(state).toEqual({ identity: "active", request: "approved", presence: "linked", fenced: false });
      const beforeRetry = await recoverySnapshot(sql, true);
      expect(await asAuthenticated(sql, foundation.pair[1],
        (caller) => decideRecovery(caller, fixture.request.entity_id, decision, input))).toEqual(receipt);
      expect(await recoverySnapshot(sql, true)).toEqual(beforeRetry);
      await assertRecoveryRejected(sql, foundation.pair[1],
        (caller) => decideRecovery(caller, fixture.request.entity_id, { ...decision, evidenceReference: randomUUID() }, input), invalidInput);
      await assertRecoveryRejected(sql, foundation.pair[1], (caller) => decideRecovery(caller, fixture.request.entity_id, decision));
    },
  },
  {
    name: "allows the other named administrator to approve an AAL1-initiated self-request",
    async run(sql, foundation) {
      const fixture = await createPublicRecovery(sql, foundation, foundation.pair[0], foundation.pair[0]);
      const decision = await confirmedPhoneCheck(sql);
      const receipt = await asAuthenticated(sql, foundation.pair[1], (caller) => decideRecovery(caller, fixture.request.entity_id, decision));
      expect(receipt.action).toBe("identity.recovery.approve");
    },
  },
  {
    name: "allows approval after the linked presence deadline while its independent request deadline remains live",
    async run(sql, foundation) {
      const fixture = await createHistoricalRequest(sql, foundation, {
        presenceCreatedOffsetMs: -31 * 60_000, presenceExpiresOffsetMs: -60_000,
        createdOffsetMs: -2 * 60_000, expiresOffsetMs: 28 * 60_000,
      });
      const decision = await confirmedPhoneCheck(sql);
      expect((await asAuthenticated(sql, foundation.pair[1], (caller) => decideRecovery(caller, fixture.requestId, decision))).action)
        .toBe("identity.recovery.approve");
    },
  },
  ...(["no_preexisting_number", "no_answer", "not_confirmed", "failed"] as const).map((phoneResult): RecoveryCommandCase => ({
    name: `records ${phoneResult} as a denied phone check and cancels the request without a reset intent`,
    async run(sql, foundation) {
      const fixture = await createPublicRecovery(sql, foundation);
      const decision = { ...await confirmedPhoneCheck(sql), phoneResult, evidenceReference: null };
      const input = recoveryInput();
      const receipt = await asAuthenticated(sql, foundation.pair[1], (caller) => decideRecovery(caller, fixture.request.entity_id, decision, input));
      await requireRecoveryReceipt(sql, foundation.pair[1], receipt, input, "identity.recovery.decide", "identity.recovery.deny");
      const [state] = await sql<{ request: string; presence: string; decision: string; reason: string }[]>`
        SELECT r.state AS request, p.state AS presence, a.decision, a.decision_reason AS reason
        FROM public.identity_recovery_requests r JOIN public.identity_recovery_presence p ON p.id = r.recovery_presence_id
        JOIN public.identity_recovery_approvals a ON a.request_id = r.id WHERE r.id = ${fixture.request.entity_id}::uuid`;
      expect(state).toEqual({ request: "cancelled", presence: "cancelled", decision: "denied", reason: "phone_check_failed" });
      expect(await sql`SELECT id FROM public.identity_admin_intents`).toHaveLength(0);
      const before = await recoverySnapshot(sql, true);
      expect(await asAuthenticated(sql, foundation.pair[1],
        (caller) => decideRecovery(caller, fixture.request.entity_id, decision, input))).toEqual(receipt);
      expect(await recoverySnapshot(sql, true)).toEqual(before);
    },
  })),
  {
    name: "does not approve a confirmed call without an attested pre-existing contact",
    async run(sql, foundation) {
      const fixture = await createPublicRecovery(sql, foundation);
      const decision = { ...await confirmedPhoneCheck(sql), preexistingContactAttested: false, evidenceReference: null };
      expect((await asAuthenticated(sql, foundation.pair[1],
        (caller) => decideRecovery(caller, fixture.request.entity_id, decision))).action).toBe("identity.recovery.deny");
      expect(await sql`SELECT id FROM public.identity_admin_intents`).toHaveLength(0);
    },
  },
  {
    name: "does not let the request initiator approve its own request",
    async run(sql, foundation) {
      const fixture = await createPublicRecovery(sql, foundation);
      const decision = await confirmedPhoneCheck(sql);
      await assertRecoveryRejected(sql, foundation.pair[0], (caller) => decideRecovery(caller, fixture.request.entity_id, decision));
    },
  },
  {
    name: "does not let a named recovery target approve a malformed request initiated by the other administrator",
    async run(sql, foundation) {
      const fixture = await createHistoricalRequest(sql, foundation, { target: foundation.pair[0], issuer: foundation.pair[1] });
      const decision = await confirmedPhoneCheck(sql);
      await assertRecoveryRejected(sql, foundation.pair[0], (caller) => decideRecovery(caller, fixture.requestId, decision));
    },
  },
  {
    name: "does not let a third Super Admin replace the other named approver",
    async run(sql, foundation) {
      const fixture = await createPublicRecovery(sql, foundation);
      const third = await createSecurityPrincipal(sql);
      await asAuthenticated(sql, foundation.pair[0], (caller) => assignPlatformRole(caller, third.identityId, "super_admin"));
      await requirePermissionUse(sql, third, "identity.recovery.approve", null, true);
      const decision = await confirmedPhoneCheck(sql);
      await assertRecoveryRejected(sql, third, (caller) => decideRecovery(caller, fixture.request.entity_id, decision));
    },
  },
  {
    name: "requires the approving named administrator's actual AAL2 factor and current session",
    async run(sql, foundation) {
      const fixture = await createPublicRecovery(sql, foundation);
      const decision = await confirmedPhoneCheck(sql);
      await assertRecoveryRejected(sql, foundation.pair[1],
        (caller) => decideRecovery(caller, fixture.request.entity_id, decision), undefined, "aal1");
      await sql`UPDATE auth.mfa_factors SET status = 'unverified' WHERE id = ${foundation.pair[1].factorId}::uuid`;
      await assertRecoveryRejected(sql, foundation.pair[1], (caller) => decideRecovery(caller, fixture.request.entity_id, decision));
    },
  },
  ...(["banned", "deleted", "anonymous"] as const).flatMap((restriction) => (["approver", "target"] as const)
    .map((person): RecoveryCommandCase => ({
      name: `denies approval when the ${person}'s Auth subject is ${restriction}`,
      async run(sql, foundation) {
        const fixture = await createPublicRecovery(sql, foundation);
        const decision = await confirmedPhoneCheck(sql);
        await restrictAuthSubject(sql, person === "approver" ? foundation.pair[1] : foundation.target, restriction);
        await assertRecoveryRejected(sql, foundation.pair[1], (caller) => decideRecovery(caller, fixture.request.entity_id, decision));
      },
    }))),
  {
    name: "allows approval after both the approver's and target's temporary Auth bans have expired",
    async run(sql, foundation) {
      const fixture = await createPublicRecovery(sql, foundation);
      await sql`UPDATE auth.users SET banned_until = clock_timestamp() - interval '1 second'
        WHERE id IN (${foundation.pair[1].subject}::uuid, ${foundation.target.subject}::uuid)`;
      const decision = await confirmedPhoneCheck(sql);
      expect((await asAuthenticated(sql, foundation.pair[1],
        (caller) => decideRecovery(caller, fixture.request.entity_id, decision))).action).toBe("identity.recovery.approve");
    },
  },
  {
    name: "denies approval after the target's bound session is deleted",
    async run(sql, foundation) {
      const fixture = await createPublicRecovery(sql, foundation);
      const decision = await confirmedPhoneCheck(sql);
      await sql`DELETE FROM auth.sessions WHERE id = ${foundation.target.sessionId}::uuid`;
      await assertRecoveryRejected(sql, foundation.pair[1], (caller) => decideRecovery(caller, fixture.request.entity_id, decision));
    },
  },
  ...(["before request", "future", "expired request"] as const).map((condition): RecoveryCommandCase => ({
    name: `denies a phone approval with ${condition} timing`,
    async run(sql, foundation) {
      const fixture = await createHistoricalRequest(sql, foundation, condition === "expired request" ? {
        presenceCreatedOffsetMs: -32 * 60_000, presenceExpiresOffsetMs: -2 * 60_000,
        createdOffsetMs: -31 * 60_000, expiresOffsetMs: -60_000,
      } : {});
      const decision = await confirmedPhoneCheck(sql);
      if (condition === "before request") decision.phoneCheckedAt = new Date(Date.parse(fixture.createdAt) - 1).toISOString();
      if (condition === "future") decision.phoneCheckedAt = new Date(Date.now() + 60_000).toISOString();
      await assertRecoveryRejected(sql, foundation.pair[1], (caller) => decideRecovery(caller, fixture.requestId, decision));
    },
  })),
  ...([
    ["missing result", { phoneResult: null }], ["unknown result", { phoneResult: "approved" }],
    ["missing attestation", { preexistingContactAttested: null }], ["missing time", { phoneCheckedAt: null }],
    ["positive infinity", { phoneCheckedAt: "infinity" }], ["negative infinity", { phoneCheckedAt: "-infinity" }],
    ["missing confirmed evidence", { evidenceReference: null }],
  ] satisfies [string, Partial<RecoveryDecision>][]).map(([label, patch]): RecoveryCommandCase => ({
    name: `rejects ${label} in a phone decision through the public SQL function`,
    async run(sql, foundation) {
      const fixture = await createPublicRecovery(sql, foundation);
      const decision = { ...await confirmedPhoneCheck(sql), ...patch };
      await assertRecoveryRejected(sql, foundation.pair[1],
        (caller) => decideRecovery(caller, fixture.request.entity_id, decision), invalidInput);
    },
  })),
  {
    name: "rejects an unsupported evidence UUID through the direct public SQL function",
    async run(sql, foundation) {
      const unsupportedUuid = "11111111-1111-0111-8111-111111111111";
      expect(z.uuid().safeParse(unsupportedUuid).success).toBe(false);
      const fixture = await createPublicRecovery(sql, foundation);
      const decision = { ...await confirmedPhoneCheck(sql), evidenceReference: unsupportedUuid };
      await assertRecoveryRejected(sql, foundation.pair[1],
        (caller) => decideRecovery(caller, fixture.request.entity_id, decision), invalidInput);
    },
  },
  {
    name: "replays the same phone-check instant across different SQL timezones without a second approval or audit",
    async run(sql, foundation) {
      const fixture = await createPublicRecovery(sql, foundation);
      const decision = await confirmedPhoneCheck(sql);
      const input = recoveryInput();
      await sql`SET LOCAL TIME ZONE 'UTC'`;
      const receipt = await asAuthenticated(sql, foundation.pair[1], (caller) => decideRecovery(caller, fixture.request.entity_id, decision, input));
      const before = await recoverySnapshot(sql, true);
      await sql`SET LOCAL TIME ZONE 'America/New_York'`;
      expect(await asAuthenticated(sql, foundation.pair[1],
        (caller) => decideRecovery(caller, fixture.request.entity_id, decision, input))).toEqual(receipt);
      await sql`SET LOCAL TIME ZONE 'UTC'`;
      expect(await recoverySnapshot(sql, true)).toEqual(before);
      await requireRecoveryReceipt(sql, foundation.pair[1], receipt, input, "identity.recovery.decide", "identity.recovery.approve");
    },
  },
];
