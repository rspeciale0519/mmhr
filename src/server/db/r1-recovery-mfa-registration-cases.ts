import { randomUUID } from "node:crypto";
import { expect } from "vitest";

import { asRuntimeRole, databaseNow } from "./r1-identity-intent-fixtures";
import { anotherSession, recoveryInput, requireRecoveryReceipt } from "./r1-recovery-command-fixtures";
import {
  assertMfaWriteRejected, createRecoveryMfaFixture, enrollSyntheticRecoveryFactor,
  recoveryMfaContext, registerRecoveryFactor, type RecoveryMfaCase,
} from "./r1-recovery-mfa-fixtures";
import { asAuthenticated, invalidInput } from "./r1-security-command-fixtures";

export const recoveryMfaRegistrationCases: RecoveryMfaCase[] = [
  {
    name: "registers exactly one new unverified factor without restoring access or capacity",
    async run(sql, foundation) {
      const f = await createRecoveryMfaFixture(sql, foundation, { target: foundation.pair[0] });
      const factorId = await enrollSyntheticRecoveryFactor(sql, f);
      const input = recoveryInput();
      const receipt = await asAuthenticated(sql, f.target, (caller) => registerRecoveryFactor(caller, factorId, input), "aal1");
      await requireRecoveryReceipt(sql, f.target, receipt, input, "identity.recovery.factor.register");
      expect(receipt.entity_id).toBe(f.presenceId);
      expect(await asAuthenticated(sql, f.target, recoveryMfaContext, "aal1")).toEqual([{
        recovery_request_id: f.requestId, recovery_presence_id: f.presenceId,
        expected_factor_id: factorId, state: "verification_required",
      }]);
      expect(await sql`SELECT status FROM public.identities WHERE id = ${f.target.identityId}::uuid`)
        .toEqual([{ status: "recovery_pending" }]);
      expect(await sql`SELECT status FROM auth.mfa_factors WHERE id = ${factorId}::uuid`).toEqual([{ status: "unverified" }]);
      await expect(sql.savepoint((owner) => owner`SELECT mmhr_private.r1_assert_administration_capacity(clock_timestamp())`))
        .rejects.toMatchObject({ code: "42501" });
    },
  },
  ...(["missing", "other subject", "verified", "old", "future", "phone", "extra unverified", "extra verified"] as const)
    .map((kind): RecoveryMfaCase => ({
      name: `denies registration for a ${kind} factor`,
      async run(sql, foundation) {
        const f = await createRecoveryMfaFixture(sql, foundation);
        const factorId = kind === "missing" ? randomUUID() : await enrollSyntheticRecoveryFactor(sql, f, {
          subject: kind === "other subject" ? foundation.target.subject : undefined,
          status: kind === "verified" ? "verified" : "unverified",
          type: kind === "phone" ? "phone" : "totp",
          createdAt: kind === "old" ? new Date(Date.parse(f.resetAt) - 1).toISOString()
            : kind === "future" ? new Date(Date.parse(await databaseNow(sql)) + 60_000).toISOString() : undefined,
        });
        if (kind.startsWith("extra")) await enrollSyntheticRecoveryFactor(sql, f, {
          status: kind === "extra verified" ? "verified" : "unverified",
        });
        await assertMfaWriteRejected(sql, f, (caller) => registerRecoveryFactor(caller, factorId));
      },
    })),
  {
    name: "returns one unchanged registration receipt on an explicit identical retry",
    async run(sql, foundation) {
      const f = await createRecoveryMfaFixture(sql, foundation);
      const factorId = await enrollSyntheticRecoveryFactor(sql, f);
      const input = recoveryInput();
      const first = await asAuthenticated(sql, f.target, (caller) => registerRecoveryFactor(caller, factorId, input), "aal1");
      expect(await asAuthenticated(sql, f.target, (caller) => registerRecoveryFactor(caller, factorId, {
        ...input, correlationId: randomUUID(),
      }), "aal1")).toEqual(first);
      await requireRecoveryReceipt(sql, f.target, first, input, "identity.recovery.factor.register");
      expect(await sql`SELECT id FROM public.security_command_receipts
        WHERE actor_identity_id = ${f.target.identityId}::uuid AND command = 'identity.recovery.factor.register'`).toHaveLength(1);
      await assertMfaWriteRejected(sql, f, (caller) => registerRecoveryFactor(caller, randomUUID(), input), "aal1", invalidInput);
      await assertMfaWriteRejected(sql, f, (caller) => registerRecoveryFactor(caller, factorId));
    },
  },
  {
    name: "does not replay a registration receipt to a different session",
    async run(sql, foundation) {
      const f = await createRecoveryMfaFixture(sql, foundation);
      const factorId = await enrollSyntheticRecoveryFactor(sql, f);
      const input = recoveryInput();
      await asAuthenticated(sql, f.target, (caller) => registerRecoveryFactor(caller, factorId, input), "aal1");
      const other = await anotherSession(sql, f.target);
      await assertMfaWriteRejected(sql, { ...f, target: other }, (caller) => registerRecoveryFactor(caller, factorId, input));
    },
  },
  {
    name: "rolls back binding and receipt when registration audit insertion fails",
    async run(sql, foundation) {
      const f = await createRecoveryMfaFixture(sql, foundation);
      const factorId = await enrollSyntheticRecoveryFactor(sql, f);
      await sql`ALTER TABLE public.audit_events ADD CONSTRAINT r1_mfa_registration_audit_failure
        CHECK (action <> 'identity.recovery.factor.register') NOT VALID`;
      await assertMfaWriteRejected(sql, f, (caller) => registerRecoveryFactor(caller, factorId), "aal1", { code: "23514" });
    },
  },
  ...(["factor", "correlation", "idempotency"] as const).map((field): RecoveryMfaCase => ({
    name: `rejects unsupported ${field} UUID metadata before registration writes`,
    async run(sql, foundation) {
      const f = await createRecoveryMfaFixture(sql, foundation);
      const factorId = await enrollSyntheticRecoveryFactor(sql, f);
      const invalid = "11111111-1111-f111-8111-111111111111";
      const input = recoveryInput();
      await assertMfaWriteRejected(sql, f, (caller) => registerRecoveryFactor(caller, field === "factor" ? invalid : factorId, {
        correlationId: field === "correlation" ? invalid : input.correlationId,
        idempotencyKey: field === "idempotency" ? invalid : input.idempotencyKey,
      }), "aal1", invalidInput);
    },
  })),
  {
    name: "rejects a NULL factor argument without any change",
    async run(sql, foundation) {
      const f = await createRecoveryMfaFixture(sql, foundation);
      await assertMfaWriteRejected(sql, f, (caller) => registerRecoveryFactor(caller, null), "aal1", invalidInput);
    },
  },
  ...(["anon", "service_role", "mmhr_worker"] as const).map((role): RecoveryMfaCase => ({
    name: `denies ${role} execution on every fixed recovery MFA entry`,
    async run(sql) {
      for (const statement of [
        "SELECT * FROM public.mmhr_get_recovery_mfa_context()",
        "SELECT public.mmhr_register_recovery_factor(gen_random_uuid(),gen_random_uuid(),gen_random_uuid())",
        "SELECT public.mmhr_reactivate_recovered_identity(gen_random_uuid(),gen_random_uuid())",
      ]) await expect(asRuntimeRole(sql, role, (caller) => caller.unsafe(statement))).rejects.toMatchObject({ code: "42501" });
    },
  })),
  {
    name: "denies raw recovery state and private context access to an authenticated caller",
    async run(sql, foundation) {
      const f = await createRecoveryMfaFixture(sql, foundation);
      for (const statement of [
        "SELECT * FROM public.identity_recovery_presence", "SELECT * FROM public.identity_recovery_requests",
        "SELECT * FROM public.identity_admin_intents", "SELECT * FROM public.security_command_receipts",
        "SELECT * FROM mmhr_private.r1_recovery_mfa_context(clock_timestamp(),false,true)",
      ]) await assertMfaWriteRejected(sql, f, (caller) => caller.unsafe(statement), "aal1", { code: "42501" });
    },
  },
];
