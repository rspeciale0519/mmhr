import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import {
  startRehearsal,
  stopRehearsal,
  type RehearsalContext,
} from "./r1-migration-rehearsal";
import {
  invalidBootstrapStates,
  verifyBootstrapAuditFailure,
  verifyBootstrapCompletesOnce,
  verifyBootstrapDeniedToRuntime,
  verifyDuplicateBootstrapTargets,
  verifyImmutablePreparation,
  verifyInvalidBootstrap,
  verifyPreparedPair,
  verifyRestrictedPreparation,
} from "./r1-security-command-bootstrap-cases";
import {
  verifyEnrollmentCapacity,
  verifyExpiringPlatformCapacity,
  verifyLastOrganizationAdministrator,
  verifyNamedPairCapacity,
  verifyOrganizationFieldCapacity,
  verifyReviewedMembershipCapacity,
} from "./r1-security-command-capacity-cases";
import {
  verifyAuthorizationTimeAfterWait,
  verifyConcurrentCommandRetry,
  verifyFreshAuthorityAfterWait,
  verifyStaleSecurityWriter,
} from "./r1-security-command-concurrency-cases";
import {
  asAuthenticated,
  changeIdentityStatus,
  changeMembershipStatus,
  commandInput,
  createCommandFixture,
  denied,
  invalidInput,
  rollbackCase,
  securitySnapshot,
  type SecurityCommandFixture,
} from "./r1-security-command-fixtures";
import {
  applySecurityCommandMigrations,
  verifyConcurrentBootstrapCompletion,
  verifyLegacyBootstrapMigration,
} from "./r1-security-command-migration-cases";
import { delegationCases } from "./r1-security-command-delegation-cases";
import { overrideCases } from "./r1-security-command-override-cases";
import { administrationCases } from "./r1-security-command-administration-cases";
import { administrationReadCases } from "./r1-security-command-read-cases";
import { identityRestrictionCases } from "./r1-security-command-identity-cases";

describe("R1.4 paired bootstrap SQL contract", () => {
  let context: RehearsalContext | undefined;

  beforeAll(async () => {
    context = await startRehearsal("bootstrap");
    await applySecurityCommandMigrations(context);
  }, 240_000);

  afterAll(async () => {
    if (context) await stopRehearsal(context);
  }, 180_000);

  test("preparation binds two pending identities without granting access", async () => {
    await rollbackCase(context!, async (sql) => { await verifyPreparedPair(sql); });
  });

  test("requires different targets and different approval references", async () => {
    await rollbackCase(context!, verifyDuplicateBootstrapTargets);
  });

  test("preserves prepared targets, approval references, and preparation time", async () => {
    await rollbackCase(context!, verifyImmutablePreparation);
  });

  test("activates the pair atomically and consumes bootstrap state once", async () => {
    await rollbackCase(context!, verifyBootstrapCompletesOnce);
  });

  test("audit failure rolls back both activations, assignments, and state consumption", async () => {
    await rollbackCase(context!, verifyBootstrapAuditFailure);
  });

  test.each(invalidBootstrapStates)("rejects %s without any security write", async (scenario) => {
    await rollbackCase(context!, (sql) => verifyInvalidBootstrap(sql, scenario));
  });

  test.each(["banned", "deleted", "anonymous"] as const)("cannot prepare bootstrap for a %s Auth subject", async (restriction) => {
    await rollbackCase(context!, (sql) => verifyRestrictedPreparation(sql, restriction));
  });

  test("keeps bootstrap execution private to the owner", async () => {
    await rollbackCase(context!, verifyBootstrapDeniedToRuntime);
  });
});

describe("R1.4 audited identity and membership SQL commands", () => {
  let context: RehearsalContext | undefined;
  let fixture: SecurityCommandFixture;

  beforeAll(async () => {
    context = await startRehearsal("commands");
    await applySecurityCommandMigrations(context);
    fixture = await context.client.begin((sql) => createCommandFixture(sql));
  }, 240_000);

  afterAll(async () => {
    if (context) await stopRehearsal(context);
  }, 180_000);

  test("missing guard state denies the private lock and a real authenticated command", async () => {
    await rollbackCase(context!, async (sql) => {
      await sql`DELETE FROM mmhr_private.security_authority_guard WHERE singleton_key = 1`;
      const before = await securitySnapshot(sql);
      await expect(sql.savepoint((probe) => probe`SELECT mmhr_private.r1_lock_security()`))
        .rejects.toMatchObject(denied);
      await expect(asAuthenticated(sql, fixture.pair[0], (probe) => changeIdentityStatus(
        probe, fixture.target.identityId, "suspended", commandInput(),
      ))).rejects.toMatchObject(denied);
      expect(await securitySnapshot(sql)).toEqual(before);
    });
  });

  test("records the stable actor, one audit event, and one immutable command receipt", async () => {
    await rollbackCase(context!, async (sql) => {
      const input = commandInput();
      const receipt = await asAuthenticated(sql, fixture.pair[0], (probe) => changeIdentityStatus(
        probe, fixture.target.identityId, "suspended", input,
      ));
      const [stored] = await sql<{ id: string; actor_identity_id: string; entity_id: string; audit_event_id: string }[]>`
        SELECT id, actor_identity_id, entity_id, audit_event_id FROM public.security_command_receipts
        WHERE idempotency_key = ${input.idempotencyKey}::uuid
      `;
      expect(stored!.actor_identity_id).toBe(fixture.pair[0].identityId);
      expect(stored!.actor_identity_id).not.toBe(fixture.pair[0].subject);
      expect(receipt).toEqual({
        receipt_id: stored!.id, entity_id: fixture.target.identityId, action: "identity.status.change",
      });
      const events = await sql<{
        id: string; actor_identity_id: string; reason: string; correlation_id: string;
        before_summary: unknown; after_summary: unknown;
      }[]>`SELECT id, actor_identity_id, reason, correlation_id, before_summary, after_summary
        FROM public.audit_events WHERE idempotency_key = ${input.idempotencyKey}`;
      expect(events).toEqual([{
        id: stored!.audit_event_id, actor_identity_id: fixture.pair[0].identityId,
        reason: input.reason, correlation_id: input.correlationId,
        before_summary: { status: "active" }, after_summary: { status: "suspended" },
      }]);
      const [target] = await sql<{ status: string }[]>`
        SELECT status FROM public.identities WHERE id = ${fixture.target.identityId}::uuid
      `;
      expect(target!.status).toBe("suspended");
    });
  });

  test("returns the same receipt for a retry and rejects changed validated input", async () => {
    await rollbackCase(context!, async (sql) => {
      const input = commandInput();
      const first = await asAuthenticated(sql, fixture.pair[0], (probe) => changeIdentityStatus(
        probe, fixture.target.identityId, "suspended", input,
      ));
      const replay = await asAuthenticated(sql, fixture.pair[0], (probe) => changeIdentityStatus(
        probe, fixture.target.identityId, "suspended", input,
      ));
      expect(replay).toEqual(first);
      const receipts = await sql`SELECT id FROM public.security_command_receipts
        WHERE idempotency_key = ${input.idempotencyKey}::uuid`;
      const events = await sql`SELECT id FROM public.audit_events
        WHERE idempotency_key = ${input.idempotencyKey}`;
      expect(receipts).toHaveLength(1);
      expect(events).toHaveLength(1);
      const beforeMismatch = await securitySnapshot(sql);
      for (const [target, status, reason] of [
        [fixture.target.identityId, "active", input.reason],
        [randomUUID(), "suspended", input.reason],
        [fixture.target.identityId, "suspended", "Different reviewed reason"],
      ]) {
        await expect(asAuthenticated(sql, fixture.pair[0], (probe) => changeIdentityStatus(
          probe, target!, status!, { ...input, reason: reason! },
        ))).rejects.toMatchObject(invalidInput);
        expect(await securitySnapshot(sql)).toEqual(beforeMismatch);
      }
    });
  });

  test.each(["audit", "receipt"] as const)("%s failure rolls back the mutation and every related security row", async (table) => {
    await rollbackCase(context!, async (sql) => {
      if (table === "audit") {
        await sql`ALTER TABLE public.audit_events ADD CONSTRAINT r1_security_insert_failure_fixture
          CHECK (false) NOT VALID`;
      } else {
        await sql`ALTER TABLE public.security_command_receipts ADD CONSTRAINT r1_security_insert_failure_fixture
          CHECK (false) NOT VALID`;
      }
      const before = await securitySnapshot(sql);
      await expect(asAuthenticated(sql, fixture.pair[0], (probe) => changeIdentityStatus(
        probe, fixture.target.identityId, "suspended", commandInput(),
      ))).rejects.toMatchObject({ code: "23514", constraint_name: "r1_security_insert_failure_fixture" });
      expect(await securitySnapshot(sql)).toEqual(before);
    });
  });

  test("receipts reject owner rewrites and raw authenticated reads", async () => {
    await rollbackCase(context!, async (sql) => {
      const input = commandInput();
      await asAuthenticated(sql, fixture.pair[0], (probe) => changeIdentityStatus(
        probe, fixture.target.identityId, "suspended", input,
      ));
      const before = await securitySnapshot(sql);
      for (const statement of [
        "UPDATE public.security_command_receipts SET request_digest = repeat('a',64)",
        "DELETE FROM public.security_command_receipts",
        "TRUNCATE public.security_command_receipts",
      ]) {
        await expect(sql.savepoint((probe) => probe.unsafe(statement))).rejects.toMatchObject({
          code: "P0001", message: "security_command_receipts is append-only",
        });
      }
      await expect(asAuthenticated(sql, fixture.pair[0], async (probe) =>
        probe`SELECT * FROM public.security_command_receipts`)).rejects.toMatchObject({ code: "42501" });
      expect(await securitySnapshot(sql)).toEqual(before);
    });
  });

  test("denies AAL1, mismatched sessions, external actors, and direct self-changes", async () => {
    await rollbackCase(context!, async (sql) => {
      const before = await securitySnapshot(sql);
      const invoke = (probe: Parameters<typeof changeIdentityStatus>[0]) => changeIdentityStatus(
        probe, fixture.target.identityId, "suspended", commandInput(),
      );
      await expect(asAuthenticated(sql, fixture.pair[0], invoke, "aal1")).rejects.toMatchObject(denied);
      await expect(asAuthenticated(sql, { ...fixture.pair[0], sessionId: fixture.pair[1].sessionId }, invoke))
        .rejects.toMatchObject(denied);
      await expect(asAuthenticated(sql, fixture.organizationAdmin, invoke)).rejects.toMatchObject(denied);
      await expect(asAuthenticated(sql, fixture.pair[0], (probe) => changeIdentityStatus(
        probe, fixture.pair[0].identityId, "suspended", commandInput(),
      ))).rejects.toMatchObject(denied);
      expect(await securitySnapshot(sql)).toEqual(before);
    });
  });

  test.each(["", "   ", "https://example.invalid/", "token=test-placeholder"])("rejects unsafe common reason input %j", async (reason) => {
    await rollbackCase(context!, async (sql) => {
      const before = await securitySnapshot(sql);
      await expect(asAuthenticated(sql, fixture.pair[0], (probe) => changeIdentityStatus(
        probe, fixture.target.identityId, "suspended", { ...commandInput(), reason },
      ))).rejects.toMatchObject(invalidInput);
      expect(await securitySnapshot(sql)).toEqual(before);
    });
  });

  test("an approved stable binding cannot be replaced by an extra Super Admin", async () => {
    await rollbackCase(context!, (sql) => verifyNamedPairCapacity(sql, fixture));
  });

  test("current MFA enrollment is required despite an existing AAL2 session", async () => {
    await rollbackCase(context!, (sql) => verifyEnrollmentCapacity(sql, fixture));
  });

  test.each(["audit.export", "workspace.access"] as const)("expiring %s authority cannot provide durable pair capacity", async (permission) => {
    await rollbackCase(context!, (sql) => verifyExpiringPlatformCapacity(sql, fixture, permission));
  });

  test("membership suspension preserves the last effective organization administrator", async () => {
    await rollbackCase(context!, (sql) => verifyLastOrganizationAdministrator(sql, fixture));
  });

  test("a future-expiring field deny removes current organization-administrator capacity", async () => {
    await rollbackCase(context!, (sql) => verifyOrganizationFieldCapacity(sql, fixture));
  });

  test("an unreviewed administrator membership does not provide capacity", async () => {
    await rollbackCase(context!, (sql) => verifyReviewedMembershipCapacity(sql, fixture));
  });

  test("membership commands reject a forged organization or member identifier", async () => {
    await rollbackCase(context!, async (sql) => {
      const before = await securitySnapshot(sql);
      for (const [organizationId, membershipId] of [
        [randomUUID(), fixture.targetMembershipId], [fixture.organizationId, randomUUID()],
      ]) {
        await expect(asAuthenticated(sql, fixture.pair[0], (probe) => changeMembershipStatus(
          probe, organizationId!, membershipId!, "suspended", commandInput(),
        ))).rejects.toMatchObject(denied);
      }
      expect(await securitySnapshot(sql)).toEqual(before);
    });
  });

  test("a stale Repeatable Read command fails with SQLSTATE 40001", async () => {
    await verifyStaleSecurityWriter(context!, fixture);
  });

  test("authorization uses current identity state after a confirmed guard wait", async () => {
    await verifyFreshAuthorityAfterWait(context!, fixture);
  });

  test("the guard captures authorization time after a confirmed lock wait", async () => {
    await verifyAuthorizationTimeAfterWait(context!);
  });

  test("concurrent duplicate commands create one change, audit event, and receipt", async () => {
    await verifyConcurrentCommandRetry(context!, fixture);
  });

  test.each([
    ...overrideCases, ...delegationCases, ...administrationCases, ...administrationReadCases, ...identityRestrictionCases,
  ])("%s", async (_name, verify) => {
    await rollbackCase(context!, (sql) => verify(sql, fixture));
  });
});

describe("R1.4 isolated bootstrap migration and concurrency evidence", () => {
  test.each(["prepared", "consumed"] as const)("preserves a legacy single-target %s state without activating a replacement", async (state) => {
    await verifyLegacyBootstrapMigration(state);
  }, 300_000);

  test("concurrent bootstrap completion grants exactly one approved pair", async () => {
    await verifyConcurrentBootstrapCompletion();
  }, 300_000);
});
