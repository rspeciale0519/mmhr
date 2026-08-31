import { randomUUID } from "node:crypto";
import { expect } from "vitest";

import { asAuthenticated, denied } from "./r1-security-command-fixtures";
import { recoverySnapshot } from "./r1-recovery-command-fixtures";
import {
  asMfaClaims, assertMfaContextDenied, createRecoveryMfaFixture, recoveryMfaContext, registerRecoveryFactor,
  type RecoveryMfaCase, type RecoveryMfaOptions,
} from "./r1-recovery-mfa-fixtures";

const unsupportedUuid = "11111111-1111-f111-8111-111111111111";
const malformedHistory: { name: string; options: RecoveryMfaOptions }[] = [
  { name: "non-UUID factor text", options: { expectedFactorId: "not-a-factor-uuid" } },
  { name: "unsupported factor UUID version", options: { expectedFactorId: unsupportedUuid } },
  { name: "unsupported intent correlation UUID", options: { correlationId: unsupportedUuid } },
  { name: "invalid provider idempotency metadata", options: { idempotencyKey: "unknown-provider-key" } },
  { name: "an unsupported maximum-attempt limit", options: { maximumAttempts: 6 } },
  { name: "missing dispatch history", options: { skipAttempt: true } },
  { name: "conflicting attempt correlation", options: { attemptCorrelationId: randomUUID() } },
  { name: "a request created after its reset", options: { requestOffset: -19, phoneOffset: -18.5, approvalOffset: -18 } },
  { name: "approval after dispatch", options: { approvalOffset: -20.5 } },
  { name: "intent creation before approval", options: { intentOffset: -23.25 } },
  { name: "phone evidence before request creation", options: { phoneOffset: -24.5 } },
  { name: "phone evidence after approval", options: { phoneOffset: -22.5 } },
  { name: "missing phone approval", options: { skipApproval: true } },
  { name: "a denied phone approval", options: { decision: "denied" } },
  { name: "non-UUID phone evidence", options: { evidence: "an-unverified-evidence-reference" } },
  { name: "unsupported phone evidence UUID", options: { evidence: unsupportedUuid } },
  { name: "failed reset outcome", options: { state: "failed" } },
  { name: "unknown reset outcome", options: { state: "outcome_unknown" } },
  { name: "nonzero reset factor count", options: { factorCount: 1 } },
  { name: "a session created after its presence", options: { sessionOffset: -24.5 } },
  { name: "a different presence subject", options: { presenceSubject: randomUUID() } },
  { name: "dispatch exactly at the original deadline", options: { expiryOffset: -21 } },
];

const malformedClaims: { name: string; claims: Record<string, unknown> }[] = [
  { name: "missing subject", claims: { sub: null } },
  { name: "invalid subject", claims: { sub: "not-a-subject" } },
  { name: "unsupported subject UUID", claims: { sub: unsupportedUuid } },
  { name: "invalid session", claims: { session_id: "not-a-session" } },
  { name: "another session", claims: { session_id: randomUUID() } },
  { name: "missing assurance", claims: { aal: null } },
  { name: "unsupported assurance", claims: { aal: "aal3" } },
  { name: "unproven AAL2", claims: { aal: "aal2" } },
  { name: "service role", claims: { role: "service_role" } },
  { name: "expired token", claims: { exp: 1 } },
  { name: "malformed expiry", claims: { exp: "tomorrow" } },
  { name: "oversized expiry", claims: { exp: "9999999999999" } },
  { name: "missing issue time", claims: { iat: null } },
  { name: "future issue time", claims: { iat: Math.floor(Date.now() / 1000) + 3600 } },
];

export const recoveryMfaCases: RecoveryMfaCase[] = [
  {
    name: "returns only the bound completed-reset context while ordinary identity access stays denied",
    async run(sql, foundation) {
      const fixture = await createRecoveryMfaFixture(sql, foundation);
      expect(await asAuthenticated(sql, fixture.target, recoveryMfaContext, "aal1")).toEqual([{
        recovery_request_id: fixture.requestId, recovery_presence_id: fixture.presenceId,
        expected_factor_id: null, state: "enrollment_required",
      }]);
      expect(await asAuthenticated(sql, fixture.target,
        (caller) => caller`SELECT * FROM public.mmhr_get_my_identity()`, "aal1")).toEqual([]);
    },
  },
  ...malformedHistory.map(({ name, options }): RecoveryMfaCase => ({
    name: `denies context and writes for ${name}`,
    async run(sql, foundation) {
      await assertMfaContextDenied(sql, await createRecoveryMfaFixture(sql, foundation, options));
    },
  })),
  ...malformedClaims.map(({ name, claims }): RecoveryMfaCase => ({
    name: `denies caller context and registration for ${name}`,
    async run(sql, foundation) {
      const f = await createRecoveryMfaFixture(sql, foundation);
      const before = await recoverySnapshot(sql);
      expect(await asMfaClaims(sql, f, claims, recoveryMfaContext)).toEqual([]);
      await expect(asMfaClaims(sql, f, claims, (caller) => registerRecoveryFactor(caller, randomUUID())))
        .rejects.toMatchObject(denied);
      expect(await recoverySnapshot(sql)).toEqual(before);
    },
  })),
  {
    name: "denies a requester who also supplied the approval",
    async run(sql, foundation) {
      await assertMfaContextDenied(sql, await createRecoveryMfaFixture(sql, foundation, { approver: foundation.pair[0] }));
    },
  },
  {
    name: "denies phone approval by a person outside the named pair",
    async run(sql, foundation) {
      await assertMfaContextDenied(sql, await createRecoveryMfaFixture(sql, foundation, { approver: foundation.organizationAdmin }));
    },
  },
  {
    name: "denies a named target whose request was started by the other administrator",
    async run(sql, foundation) {
      await assertMfaContextDenied(sql, await createRecoveryMfaFixture(sql, foundation, {
        target: foundation.pair[1], issuer: foundation.pair[0], approver: foundation.pair[1],
      }));
    },
  },
  {
    name: "denies context when internal email verification is missing",
    async run(sql, foundation) {
      const fixture = await createRecoveryMfaFixture(sql, foundation);
      await sql`UPDATE public.identities SET email_verified_at = NULL WHERE id = ${fixture.target.identityId}::uuid`;
      await assertMfaContextDenied(sql, fixture);
    },
  },
  {
    name: "does not impose a new request deadline after a successful reset",
    async run(sql, foundation) {
      const fixture = await createRecoveryMfaFixture(sql, foundation, { expiryOffset: -19 });
      expect(await asAuthenticated(sql, fixture.target, recoveryMfaContext, "aal1")).toHaveLength(1);
    },
  },
  {
    name: "permits completion context when the request expired during the reset call",
    async run(sql, foundation) {
      const f = await createRecoveryMfaFixture(sql, foundation, { expiryOffset: -20.5 });
      expect(await asAuthenticated(sql, f.target, recoveryMfaContext, "aal1")).toHaveLength(1);
    },
  },
  {
    name: "does not recheck current approver authority after a confirmed reset",
    async run(sql, foundation) {
      const f = await createRecoveryMfaFixture(sql, foundation);
      await sql`UPDATE public.identities SET status = 'suspended', suspended_at = clock_timestamp()
        WHERE id = ${f.approver.identityId}::uuid`;
      expect(await asAuthenticated(sql, f.target, recoveryMfaContext, "aal1")).toHaveLength(1);
    },
  },
  ...(["banned", "deleted", "anonymous", "unconfirmed email", "email mismatch", "unreviewed identity", "missing session", "expired session"] as const)
    .map((kind): RecoveryMfaCase => ({
      name: `denies recovery context for ${kind}`,
      async run(sql, foundation) {
        const f = await createRecoveryMfaFixture(sql, foundation);
        if (kind === "banned") await sql`UPDATE auth.users SET banned_until = clock_timestamp() + interval '1 hour' WHERE id = ${f.target.subject}::uuid`;
        if (kind === "deleted") await sql`UPDATE auth.users SET deleted_at = clock_timestamp() WHERE id = ${f.target.subject}::uuid`;
        if (kind === "anonymous") await sql`UPDATE auth.users SET is_anonymous = true WHERE id = ${f.target.subject}::uuid`;
        if (kind === "unconfirmed email") await sql`UPDATE auth.users SET email_confirmed_at = NULL WHERE id = ${f.target.subject}::uuid`;
        if (kind === "email mismatch") await sql`UPDATE auth.users SET email = ${`changed-${randomUUID()}@example.invalid`} WHERE id = ${f.target.subject}::uuid`;
        if (kind === "unreviewed identity") await sql`UPDATE public.identities SET migration_review_required = true WHERE id = ${f.target.identityId}::uuid`;
        if (kind === "missing session") await sql`DELETE FROM auth.sessions WHERE id = ${f.target.sessionId}::uuid`;
        if (kind === "expired session") await sql`UPDATE auth.sessions SET not_after = clock_timestamp() - interval '1 second' WHERE id = ${f.target.sessionId}::uuid`;
        await assertMfaContextDenied(sql, f);
      },
    })),
];
