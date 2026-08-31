import { randomUUID } from "node:crypto";
import { expect } from "vitest";

import { assignPlatformRole } from "./r1-security-command-administration-fixtures";
import { asAuthenticated, invalidInput } from "./r1-security-command-fixtures";
import { requirePermissionUse } from "./r1-security-command-permission-fixtures";
import {
  anotherSession, assertRecoveryRejected, createHistoricalPresence, createPresence, createPublicRecovery,
  recoveryInput, recoveryReference, recoverySnapshot, requestRecovery, requireRecoveryReceipt,
  type RecoveryCommandCase,
} from "./r1-recovery-command-fixtures";

export const recoveryRequestCases: RecoveryCommandCase[] = [
  ...(["lost_factor", "compromised_factor", "replace_device"] as const).map((reason): RecoveryCommandCase => ({
    name: `creates one fixed MFA-reset request with the approved ${reason} reason`,
    async run(sql, foundation) {
      const { target, pair } = foundation;
      const presence = await createHistoricalPresence(sql, target, { createdOffsetMs: -29 * 60_000, expiresOffsetMs: 60_000 });
      const input = recoveryInput();
      const receipt = await asAuthenticated(sql, pair[0],
        (caller) => requestRecovery(caller, presence.reference.opaqueReference, input, reason));
      await requireRecoveryReceipt(sql, pair[0], receipt, input, "identity.recovery.request");
      const [row] = await sql<{ target_identity_id: string; initiated_by_identity_id: string; action: string;
        reason: string; state: string; lifetime: number; presence: string; linked: boolean; later_deadline: boolean }[]>`
        SELECT r.target_identity_id, r.initiated_by_identity_id, r.action, r.reason, r.state,
          extract(epoch FROM r.expires_at - r.created_at)::integer AS lifetime, p.state AS presence,
          p.linked_request_id = r.id AND p.linked_at = r.created_at AS linked,
          r.expires_at > p.expires_at AS later_deadline
        FROM public.identity_recovery_requests r JOIN public.identity_recovery_presence p ON p.id = r.recovery_presence_id
        WHERE r.id = ${receipt.entity_id}::uuid`;
      expect(row).toEqual({ target_identity_id: target.identityId, initiated_by_identity_id: pair[0].identityId,
        action: "mfa_enrollment_reset", reason, state: "pending", lifetime: 1_800,
        presence: "linked", linked: true, later_deadline: true });
      expect(await sql`SELECT id FROM public.identity_recovery_approvals`).toHaveLength(0);
      expect(await sql`SELECT id FROM public.identity_admin_intents`).toHaveLength(0);
      expect(JSON.stringify(await recoverySnapshot(sql))).not.toContain(presence.reference.opaqueReference);
    },
  })),
  ...([0, 1] as const).map((index): RecoveryCommandCase => ({
    name: `allows named administrator ${index + 1} to start its own recovery with AAL1`,
    async run(sql, foundation) {
      const target = foundation.pair[index];
      const fixture = await createPublicRecovery(sql, foundation, target, target);
      await requireRecoveryReceipt(sql, target, fixture.request, fixture.requestInput, "identity.recovery.request");
      const [request] = await sql<{ initiated_by_identity_id: string; target_identity_id: string }[]>`
        SELECT initiated_by_identity_id, target_identity_id FROM public.identity_recovery_requests
        WHERE id = ${fixture.request.entity_id}::uuid`;
      expect(request).toEqual({ initiated_by_identity_id: target.identityId, target_identity_id: target.identityId });
    },
  })),
  {
    name: "requires AAL2 when a named administrator requests recovery for another person",
    async run(sql, foundation) {
      const reference = recoveryReference();
      await asAuthenticated(sql, foundation.target, (caller) => createPresence(caller, reference.hash), "aal1");
      await assertRecoveryRejected(sql, foundation.pair[0],
        (caller) => requestRecovery(caller, reference.opaqueReference), undefined, "aal1");
      await asAuthenticated(sql, foundation.pair[0], (caller) => requestRecovery(caller, reference.opaqueReference));
    },
  },
  {
    name: "does not let one named administrator initiate the other named administrator's recovery",
    async run(sql, foundation) {
      const reference = recoveryReference();
      await asAuthenticated(sql, foundation.pair[1], (caller) => createPresence(caller, reference.hash), "aal1");
      await assertRecoveryRejected(sql, foundation.pair[0], (caller) => requestRecovery(caller, reference.opaqueReference));
    },
  },
  {
    name: "does not substitute a third Super Admin for the named recovery pair",
    async run(sql, foundation) {
      await asAuthenticated(sql, foundation.pair[0], (caller) => assignPlatformRole(caller, foundation.target.identityId, "super_admin"));
      await requirePermissionUse(sql, foundation.target, "identity.recovery.request", null, true);
      const reference = recoveryReference();
      await asAuthenticated(sql, foundation.organizationAdmin, (caller) => createPresence(caller, reference.hash), "aal1");
      await assertRecoveryRejected(sql, foundation.target, (caller) => requestRecovery(caller, reference.opaqueReference));
    },
  },
  {
    name: "does not let an ordinary identity use its reference to initiate its own reset",
    async run(sql, foundation) {
      const reference = recoveryReference();
      await asAuthenticated(sql, foundation.target, (caller) => createPresence(caller, reference.hash), "aal1");
      await assertRecoveryRejected(sql, foundation.target, (caller) => requestRecovery(caller, reference.opaqueReference));
    },
  },
  {
    name: "binds a named self-request to the exact session that created its reference",
    async run(sql, foundation) {
      const target = foundation.pair[0];
      const reference = recoveryReference();
      await asAuthenticated(sql, target, (caller) => createPresence(caller, reference.hash), "aal1");
      const differentSession = await anotherSession(sql, target);
      await assertRecoveryRejected(sql, differentSession, (caller) => requestRecovery(caller, reference.opaqueReference), undefined, "aal1");
      await asAuthenticated(sql, target, (caller) => requestRecovery(caller, reference.opaqueReference), "aal1");
    },
  },
  {
    name: "uses a reference once while returning the original receipt for an identical request retry",
    async run(sql, foundation) {
      const fixture = await createPublicRecovery(sql, foundation);
      const beforeRetry = await recoverySnapshot(sql, true);
      expect(await asAuthenticated(sql, fixture.issuer, (caller) => requestRecovery(
        caller, fixture.reference.opaqueReference, fixture.requestInput))).toEqual(fixture.request);
      expect(await recoverySnapshot(sql, true)).toEqual(beforeRetry);
      await assertRecoveryRejected(sql, fixture.issuer, (caller) => requestRecovery(caller, fixture.reference.opaqueReference));
      await assertRecoveryRejected(sql, fixture.issuer,
        (caller) => requestRecovery(caller, fixture.reference.opaqueReference, fixture.requestInput, "replace_device"), invalidInput);
    },
  },
  ...(["expired", "future", "wrong subject", "wrong session"] as const).map((condition): RecoveryCommandCase => ({
    name: `denies an unused reference with ${condition} presence data`,
    async run(sql, foundation) {
      const options = condition === "expired" ? { createdOffsetMs: -31 * 60_000, expiresOffsetMs: -60_000 }
        : condition === "future" ? { createdOffsetMs: 60_000, expiresOffsetMs: 31 * 60_000 }
          : condition === "wrong subject" ? { subjectId: foundation.organizationAdmin.subject }
            : { sessionId: foundation.organizationAdmin.sessionId };
      const presence = await createHistoricalPresence(sql, foundation.target, options);
      await assertRecoveryRejected(sql, foundation.pair[0], (caller) => requestRecovery(caller, presence.reference.opaqueReference));
    },
  })),
  ...([null, "", "ABCDEF".repeat(11), "g".repeat(64)] as const).map((reference, index): RecoveryCommandCase => ({
    name: `rejects malformed opaque request reference ${index + 1} before writing`,
    async run(sql, foundation) {
      await assertRecoveryRejected(sql, foundation.pair[0], (caller) => requestRecovery(caller, reference), invalidInput);
    },
  })),
  {
    name: "rejects an unknown reference and an unsupported free-text reason without writes",
    async run(sql, foundation) {
      await assertRecoveryRejected(sql, foundation.pair[0], (caller) => requestRecovery(caller, recoveryReference().opaqueReference));
      await assertRecoveryRejected(sql, foundation.pair[0],
        (caller) => requestRecovery(caller, recoveryReference().opaqueReference, recoveryInput(), "Call the customer"), invalidInput);
    },
  },
  {
    name: "rejects a reference after its target's verified session is deleted",
    async run(sql, foundation) {
      const reference = recoveryReference();
      await asAuthenticated(sql, foundation.target, (caller) => createPresence(caller, reference.hash), "aal1");
      await sql`DELETE FROM auth.sessions WHERE id = ${foundation.target.sessionId}::uuid`;
      await assertRecoveryRejected(sql, foundation.pair[0], (caller) => requestRecovery(caller, reference.opaqueReference));
    },
  },
  {
    name: "rejects malformed request metadata through the public SQL entry point",
    async run(sql, foundation) {
      const reference = recoveryReference();
      await asAuthenticated(sql, foundation.target, (caller) => createPresence(caller, reference.hash), "aal1");
      await assertRecoveryRejected(sql, foundation.pair[0], (caller) => caller`
        SELECT public.mmhr_request_identity_recovery(${reference.opaqueReference}, 'lost_factor',
          NULL::uuid, ${randomUUID()}::uuid)`, invalidInput);
    },
  },
];
