import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { applyAllMigrations, startRehearsal, stopRehearsal, type RehearsalContext } from "./r1-migration-rehearsal";
import {
  asAuthenticated, createCommandFixture, createSecurityPrincipal, deferred, restrictAuthSubject,
  rollbackCase, waitForGuardWait, type SecurityTransaction,
} from "./r1-security-command-fixtures";

type WorkspaceResult = { identityId: string; organizationId: string; outcome: string; correlationId: string };

describe("self-service customer registration", () => {
  let context: RehearsalContext;
  beforeAll(async () => {
    context = await startRehearsal("r1-customer-registration");
    await applyAllMigrations(context);
    await createCommandFixture(context.client);
  }, 240_000);
  afterAll(async () => { if (context) await stopRehearsal(context); }, 180_000);

  test.each([true, false])("creates one isolated workspace and replays safely; new identity=%s", async (fresh) => {
    await rollbackCase(context, async (sql) => {
      const customer = await createSecurityPrincipal(sql, "pending");
      const stranger = await createSecurityPrincipal(sql);
      if (fresh) await sql`DELETE FROM public.identities WHERE id=${customer.identityId}::uuid`;
      // A real AAL1 account has no verified MFA factor.
      await sql`UPDATE auth.sessions SET aal='aal1',factor_id=NULL WHERE id=${customer.sessionId}::uuid`;
      await sql`DELETE FROM auth.mfa_factors WHERE user_id=${customer.subject}::uuid`;
      const correlationId = randomUUID();
      const call = () => asAuthenticated(sql, customer, async (probe) => {
        const [row] = await probe`SELECT public.mmhr_start_customer_workspace(${correlationId}::uuid) AS result`;
        return row!.result as WorkspaceResult;
      }, "aal1");
      const result = await call();
      expect(result).toMatchObject({ outcome: "created", correlationId });
      expect(await call()).toEqual({ ...result, outcome: "existing" });
      const permission = (key: string, principal = customer) => asAuthenticated(sql, principal,
        (probe) => probe`SELECT * FROM public.mmhr_authorize(${key},${result.organizationId}::uuid)`, "aal1");
      expect(await permission("portal.customer.access")).toHaveLength(1);
      for (const key of ["portal.vendor.access", "org.members.invite", "permissions.grant"]) {
        expect(await permission(key)).toEqual([]);
      }
      expect(await permission("workspace.access", stranger)).toEqual([]);
      const [counts] = await sql`SELECT
        (SELECT count(*)::int FROM public.customer_registrations WHERE identity_id=${result.identityId}::uuid) AS registrations,
        (SELECT count(*)::int FROM public.audit_events WHERE command='customer.workspace.create' AND actor_identity_id=${result.identityId}::uuid) AS audits,
        (SELECT count(*)::int FROM public.security_command_receipts WHERE command='customer.workspace.create' AND actor_identity_id=${result.identityId}::uuid) AS receipts`;
      expect(counts).toEqual({ registrations: 1, audits: 1, receipts: 1 });
      await expect(asAuthenticated(sql, customer, (probe) => probe`SELECT * FROM public.customer_registrations`, "aal1"))
        .rejects.toMatchObject({ code: "42501" });
    });
  });

  test("synchronizes a verified caller without granting access", async () => {
    await rollbackCase(context, async (sql) => {
      const customer = await createSecurityPrincipal(sql, "pending");
      await sql`UPDATE public.identities
        SET email_verified_at=NULL, synchronized_at=NULL
        WHERE id=${customer.identityId}::uuid`;
      const correlationId = randomUUID();
      const result = await asAuthenticated(sql, customer, (probe) =>
        probe`SELECT public.mmhr_sync_my_identity(${correlationId}::uuid) AS result`, "aal1");
      expect(result[0]!.result).toMatchObject({
        identityId: customer.identityId, status: "pending", outcome: "synchronized", correlationId,
      });
      expect(await sql`SELECT * FROM public.org_members WHERE identity_id=${customer.identityId}::uuid`).toHaveLength(0);
      expect(await sql`SELECT action, after_summary FROM public.audit_events
        WHERE command='identity.synchronize' AND actor_identity_id=${customer.identityId}::uuid`)
        .toEqual([{ action: "identity.synchronize.synchronized", after_summary: { status: "pending" } }]);
      expect(await sql`SELECT action FROM public.security_command_receipts
        WHERE command='identity.synchronize' AND actor_identity_id=${customer.identityId}::uuid`)
        .toEqual([{ action: "identity.synchronize.synchronized" }]);
      const replay = await asAuthenticated(sql, customer, (probe) =>
        probe`SELECT public.mmhr_sync_my_identity(${correlationId}::uuid) AS result`, "aal1");
      expect(replay[0]!.result).toMatchObject({ identityId: customer.identityId, outcome: "synchronized", correlationId });
      expect(await sql`SELECT * FROM public.audit_events WHERE command='identity.synchronize' AND actor_identity_id=${customer.identityId}::uuid`).toHaveLength(1);
    });
  });

  test("replays an unchanged synchronization with its exact audit outcome", async () => {
    await rollbackCase(context, async (sql) => {
      const customer = await createSecurityPrincipal(sql);
      const correlationId = randomUUID();
      const result = await asAuthenticated(sql, customer, (probe) =>
        probe`SELECT public.mmhr_sync_my_identity(${correlationId}::uuid) AS result`, "aal1");
      expect(result[0]!.result).toMatchObject({
        identityId: customer.identityId, status: "active", outcome: "unchanged", correlationId,
      });
      expect(await sql`SELECT action, after_summary FROM public.audit_events
        WHERE command='identity.synchronize' AND actor_identity_id=${customer.identityId}::uuid`)
        .toEqual([{ action: "identity.synchronize.unchanged", after_summary: { status: "active" } }]);
      expect(await sql`SELECT action FROM public.security_command_receipts
        WHERE command='identity.synchronize' AND actor_identity_id=${customer.identityId}::uuid`)
        .toEqual([{ action: "identity.synchronize.unchanged" }]);
      const replay = await asAuthenticated(sql, customer, (probe) =>
        probe`SELECT public.mmhr_sync_my_identity(${correlationId}::uuid) AS result`, "aal1");
      expect(replay[0]!.result).toEqual({
        identityId: customer.identityId, status: "active", outcome: "unchanged", correlationId,
      });
      expect(await sql`SELECT count(*)::int AS count FROM public.audit_events
        WHERE command='identity.synchronize' AND actor_identity_id=${customer.identityId}::uuid`)
        .toEqual([{ count: 1 }]);
    });
  });

  test("creates one pending identity for a verified caller without membership", async () => {
    await rollbackCase(context, async (sql) => {
      const customer = await createSecurityPrincipal(sql, "pending");
      await sql`DELETE FROM public.identities WHERE id=${customer.identityId}::uuid`;
      const correlationId = randomUUID();
      const result = await asAuthenticated(sql, customer, (probe) =>
        probe`SELECT public.mmhr_sync_my_identity(${correlationId}::uuid) AS result`, "aal1");
      const identityId = result[0]!.result.identityId as string;
      expect(result[0]!.result).toEqual({ identityId, status: "pending", outcome: "created", correlationId });
      expect(await sql`SELECT auth_user_id,status FROM public.identities WHERE id=${identityId}::uuid`)
        .toEqual([{ auth_user_id: customer.subject, status: "pending" }]);
      expect(await sql`SELECT * FROM public.org_members WHERE identity_id=${identityId}::uuid`).toHaveLength(0);
      expect(await sql`SELECT action, after_summary FROM public.audit_events
        WHERE command='identity.synchronize' AND actor_identity_id=${identityId}::uuid`)
        .toEqual([{ action: "identity.synchronize.created", after_summary: { status: "pending" } }]);
      expect(await sql`SELECT action FROM public.security_command_receipts
        WHERE command='identity.synchronize' AND actor_identity_id=${identityId}::uuid`)
        .toEqual([{ action: "identity.synchronize.created" }]);
      const workspace = await asAuthenticated(sql, customer, (probe) =>
        probe`SELECT public.mmhr_start_customer_workspace(${correlationId}::uuid) AS result`, "aal1");
      const workspaceResult = workspace[0]!.result as WorkspaceResult;
      expect(workspaceResult).toMatchObject({ identityId, outcome: "created", correlationId });
      expect(await sql`SELECT status, activated_at FROM public.identities WHERE id=${identityId}::uuid`)
        .toSatisfy((rows) => rows.length === 1 && rows[0].status === "active" && rows[0].activated_at !== null);
      expect(await sql`SELECT role_key, status FROM public.org_members
        WHERE identity_id=${identityId}::uuid AND org_id=${workspaceResult.organizationId}::uuid`)
        .toEqual([{ role_key: "contributor", status: "active" }]);
      expect(await sql`SELECT portal FROM public.portal_access_grants
        WHERE organization_id=${workspaceResult.organizationId}::uuid AND portal='customer'`)
        .toEqual([{ portal: "customer" }]);
      const replay = await asAuthenticated(sql, customer, (probe) =>
        probe`SELECT public.mmhr_sync_my_identity(${correlationId}::uuid) AS result`, "aal1");
      expect(replay[0]!.result).toEqual({ identityId, status: "pending", outcome: "created", correlationId });
      expect(await sql`SELECT count(*)::int AS count FROM public.audit_events
        WHERE command='identity.synchronize' AND actor_identity_id=${identityId}::uuid`)
        .toEqual([{ count: 1 }]);
    });
  });

  test("serializes concurrent workspace setup on independent connections", async () => {
    // Commit the fixture so both independent transactions can observe the same Auth user.
    const customer = await createSecurityPrincipal(context.client, "pending");
    await context.client`DELETE FROM public.identities WHERE id=${customer.identityId}::uuid`;
    const invoke = (transaction: SecurityTransaction, correlationId: string): Promise<WorkspaceResult> => asAuthenticated(transaction, customer, async (probe) => {
      const [row] = await probe`SELECT public.mmhr_start_customer_workspace(${correlationId}::uuid) AS result`;
      return row!.result as WorkspaceResult;
    }, "aal1");
    const holding = deferred<SecurityTransaction>();
    const firstReady = deferred<{ identityId: string; organizationId: string; outcome: string }>();
    const secondReady = deferred<number>();
    const release = deferred<void>();
    const firstTransaction = context.client.begin(async (transaction) => {
      await transaction`SET LOCAL statement_timeout='10000ms'`;
      await transaction`SELECT mmhr_private.r1_lock_security()`;
      holding.resolve(transaction);
      const result = await invoke(transaction, randomUUID());
      firstReady.resolve(result);
      await release.promise;
      return result;
    });
    void firstTransaction.catch(firstReady.reject);
    let secondTransaction: Promise<unknown> | undefined;
    try {
      const first = await firstReady.promise;
      secondTransaction = context.client.begin(async (transaction) => {
        await transaction`SET LOCAL statement_timeout='10000ms'`;
        const [backend] = await transaction<{ id: number }[]>`SELECT pg_backend_pid() AS id`;
        secondReady.resolve(backend!.id);
        return invoke(transaction, randomUUID());
      });
      void secondTransaction.catch(secondReady.reject);
      await waitForGuardWait(await holding.promise, await secondReady.promise);
      release.resolve();
      const activeSecondTransaction = secondTransaction;
      if (!activeSecondTransaction) throw new Error("Second workspace transaction was not started");
      const [completedFirst, second] = await Promise.all([
        firstTransaction as Promise<WorkspaceResult>, activeSecondTransaction as Promise<WorkspaceResult>,
      ]);
      expect(completedFirst).toEqual(first);
      expect(second).toMatchObject({ identityId: first.identityId, organizationId: first.organizationId, outcome: "existing" });
      expect([first.outcome, second.outcome].sort()).toEqual(["created", "existing"]);
      const [counts] = await context.client`SELECT
        (SELECT count(*)::int FROM public.identities WHERE auth_user_id=${customer.subject}::uuid) AS identities,
        (SELECT count(*)::int FROM public.customer_registrations WHERE identity_id=(SELECT id FROM public.identities WHERE auth_user_id=${customer.subject}::uuid)) AS registrations,
        (SELECT count(*)::int FROM public.orgs WHERE id IN (SELECT organization_id FROM public.customer_registrations WHERE identity_id=(SELECT id FROM public.identities WHERE auth_user_id=${customer.subject}::uuid))) AS organizations,
        (SELECT count(*)::int FROM public.org_members WHERE identity_id=(SELECT id FROM public.identities WHERE auth_user_id=${customer.subject}::uuid)) AS memberships,
        (SELECT count(*)::int FROM public.portal_access_grants WHERE issued_by_identity_id=(SELECT id FROM public.identities WHERE auth_user_id=${customer.subject}::uuid)) AS grants,
        (SELECT count(*)::int FROM public.audit_events WHERE command='customer.workspace.create' AND actor_identity_id=(SELECT id FROM public.identities WHERE auth_user_id=${customer.subject}::uuid)) AS audits,
        (SELECT count(*)::int FROM public.security_command_receipts WHERE command='customer.workspace.create' AND actor_identity_id=(SELECT id FROM public.identities WHERE auth_user_id=${customer.subject}::uuid)) AS receipts`;
      expect(counts).toEqual({ identities: 1, registrations: 1, organizations: 1, memberships: 1, grants: 1, audits: 1, receipts: 1 });
    } finally {
      release.resolve();
      await firstTransaction.catch(() => undefined);
      if (secondTransaction) await secondTransaction.catch(() => undefined);
    }
  });

  test("serializes concurrent first-time synchronization on independent connections", async () => {
    const customer = await createSecurityPrincipal(context.client, "pending");
    await context.client`DELETE FROM public.identities WHERE id=${customer.identityId}::uuid`;
    // The rehearsal owns a two-connection pool. Separate transactions use its
    // isolated connections without granting this test a new database capability.
    const invoke = (correlationId: string) => context.client.begin(async (transaction) => {
      await transaction`SET LOCAL statement_timeout='10000ms'`;
      return asAuthenticated(transaction, customer, (probe) =>
        probe`SELECT public.mmhr_sync_my_identity(${correlationId}::uuid) AS result`, "aal1");
    });
    const requests = [invoke(randomUUID()), invoke(randomUUID())] as const;
    try {
      const [first, second] = await Promise.all(requests);
      expect([first[0]!.result.outcome, second[0]!.result.outcome].sort()).toEqual(["created", "unchanged"]);
      expect(await context.client`SELECT count(*)::int AS count FROM public.identities WHERE auth_user_id=${customer.subject}::uuid`)
        .toEqual([{ count: 1 }]);
    } finally {
      await Promise.allSettled(requests);
    }
  });

  test("denies a mismatched request identity under either claim accessor", async () => {
    await rollbackCase(context, async (sql) => {
      const customer = await createSecurityPrincipal(sql, "pending");
      const other = await createSecurityPrincipal(sql, "pending");
      const mode = await asAuthenticated(sql, customer, async (probe) => {
        await probe`SELECT set_config('request.jwt.claim.sub', ${other.subject}, true)`;
        const [claims] = await probe<{ auth_uid: string | null; claim_sub: string | null }[]>`
          SELECT auth.uid()::text AS auth_uid, auth.jwt()->>'sub' AS claim_sub`;
        expect(claims!.claim_sub).toBe(customer.subject);
        if (claims!.auth_uid !== claims!.claim_sub) {
          await expect(probe.savepoint((isolated) => isolated`SELECT public.mmhr_start_customer_workspace(${randomUUID()}::uuid)`))
            .rejects.toMatchObject({ code: "42501" });
          return "separate-accessor-rejected";
        }
        await probe`SELECT set_config(
          'request.jwt.claims',
          jsonb_set(current_setting('request.jwt.claims', true)::jsonb, '{sub}', to_jsonb(${other.subject}::text))::text,
          true
        )`;
        await expect(probe.savepoint((isolated) => isolated`SELECT public.mmhr_start_customer_workspace(${randomUUID()}::uuid)`))
          .rejects.toMatchObject({ code: "42501" });
        return "claims-rejected";
      }, "aal1");
      expect(["separate-accessor-rejected", "claims-rejected"]).toContain(mode);
    });
  });

  test.each(["unconfirmed", "banned", "deleted", "anonymous", "expired"] as const)(
    "denies identity synchronization for %s caller", async (restriction) => {
      await rollbackCase(context, async (sql) => {
        const customer = await createSecurityPrincipal(sql, "pending");
        if (restriction === "banned" || restriction === "deleted" || restriction === "anonymous") await restrictAuthSubject(sql, customer, restriction);
        if (restriction === "unconfirmed") await sql`UPDATE auth.users SET email_confirmed_at=NULL WHERE id=${customer.subject}::uuid`;
        if (restriction === "expired") await sql`UPDATE auth.sessions SET not_after=now()-interval '1 hour' WHERE id=${customer.sessionId}::uuid`;
        await expect(asAuthenticated(sql, customer, (probe) =>
          probe`SELECT public.mmhr_sync_my_identity(${randomUUID()}::uuid)`, "aal1"))
          .rejects.toMatchObject({ code: "42501" });
      });
    },
  );

  test.each(["review", "suspended", "archived", "recovery_pending", "email_mismatch"] as const)(
    "denies synchronization for existing %s identity state", async (restriction) => {
      await rollbackCase(context, async (sql) => {
        const customer = await createSecurityPrincipal(sql);
        if (restriction === "review") await sql`UPDATE public.identities SET migration_review_required=true WHERE id=${customer.identityId}::uuid`;
        if (restriction === "email_mismatch") await sql`UPDATE auth.users SET email='mismatch@example.invalid' WHERE id=${customer.subject}::uuid`;
        if (restriction === "suspended" || restriction === "archived" || restriction === "recovery_pending") {
          await sql`UPDATE public.identities SET status=${restriction}::public.identity_status,
            suspended_at=CASE WHEN ${restriction}='suspended' THEN now() ELSE NULL END,
            archived_at=CASE WHEN ${restriction}='archived' THEN now() ELSE NULL END
            WHERE id=${customer.identityId}::uuid`;
        }
        await expect(asAuthenticated(sql, customer, (probe) =>
          probe`SELECT public.mmhr_sync_my_identity(${randomUUID()}::uuid)`, "aal1"))
          .rejects.toMatchObject({ code: "42501" });
        expect(await sql`SELECT count(*)::int AS count FROM public.audit_events
          WHERE command='identity.synchronize' AND actor_identity_id=${customer.identityId}::uuid`)
          .toEqual([{ count: 0 }]);
      });
    },
  );

  test.each(["unconfirmed", "banned", "deleted", "anonymous", "expired", "review", "contained", "email_changed"] as const)(
    "denies %s without creating a registration", async (restriction) => {
      await rollbackCase(context, async (sql) => {
        const customer = await createSecurityPrincipal(sql, "pending");
        if (restriction === "banned" || restriction === "deleted" || restriction === "anonymous") await restrictAuthSubject(sql, customer, restriction);
        if (restriction === "unconfirmed") await sql`UPDATE auth.users SET email_confirmed_at=NULL WHERE id=${customer.subject}::uuid`;
        if (restriction === "expired") await sql`UPDATE auth.sessions SET not_after=now()-interval '1 hour' WHERE id=${customer.sessionId}::uuid`;
        if (restriction === "review") await sql`UPDATE public.identities SET migration_review_required=true WHERE id=${customer.identityId}::uuid`;
        if (restriction === "contained") await sql`UPDATE public.identities SET authorization_not_before=now() WHERE id=${customer.identityId}::uuid`;
        if (restriction === "email_changed") await sql`UPDATE auth.users SET email='changed@example.invalid' WHERE id=${customer.subject}::uuid`;
        await expect(asAuthenticated(sql, customer, (probe) => probe`SELECT public.mmhr_start_customer_workspace(${randomUUID()}::uuid)`, "aal1"))
          .rejects.toMatchObject({ code: "42501" });
      });
    },
  );

  test("does not repair revoked membership on retry", async () => {
    await rollbackCase(context, async (sql) => {
      const customer = await createSecurityPrincipal(sql, "pending");
      await asAuthenticated(sql, customer, (probe) => probe`SELECT public.mmhr_start_customer_workspace(${randomUUID()}::uuid)`, "aal1");
      await sql`UPDATE public.org_members SET status='revoked',revoked_at=now(),revoked_reason='Test revocation' WHERE identity_id=${customer.identityId}::uuid`;
      await expect(asAuthenticated(sql, customer, (probe) => probe`SELECT public.mmhr_start_customer_workspace(${randomUUID()}::uuid)`, "aal1"))
        .rejects.toMatchObject({ code: "42501" });
    });
  });

  test.each(["platform_staff", "platform_admin", "revoked_platform_staff", "active_override", "vendor_membership", "admin_membership", "revoked_membership", "revoked_override"] as const)(
    "preserves existing %s authority without creating a workspace", async (authority) => {
      await rollbackCase(context, async (sql) => {
        const customer = await createSecurityPrincipal(sql, "pending");
        if (authority === "platform_staff" || authority === "platform_admin" || authority === "revoked_platform_staff") {
          const role = authority === "platform_admin" ? "admin" : "staff";
          const state = authority === "revoked_platform_staff" ? "revoked" : "active";
          await sql`INSERT INTO public.platform_role_assignments (
              identity_id, role_key, state, assignment_reason, revoked_at, revocation_reason
            ) VALUES (
              ${customer.identityId}::uuid, ${role}, ${state}::public.security_record_state,
              'Existing platform authority fixture',
              CASE WHEN ${state}='revoked' THEN now() ELSE NULL END,
              CASE WHEN ${state}='revoked' THEN 'Historical authority must block self-service' ELSE NULL END
            )`;
        } else if (authority === "active_override" || authority === "revoked_override") {
          const issuer = await createSecurityPrincipal(sql);
          const state = authority === "revoked_override" ? "revoked" : "active";
          await sql`INSERT INTO public.user_permission_overrides (
            identity_id, permission_key, scope_kind, scope_key, effect, state,
            issued_by_identity_id, issue_reason, revoked_at, revocation_reason
          ) VALUES (
            ${customer.identityId}::uuid, 'workspace.access', 'platform', 'platform', 'allow',
            ${state}::public.security_record_state, ${issuer.identityId}::uuid,
            'Existing permission override fixture',
            CASE WHEN ${state}='revoked' THEN now() ELSE NULL END,
            CASE WHEN ${state}='revoked' THEN 'Historical authority must block self-service' ELSE NULL END
          )`;
        } else {
          const organizationType = authority === "vendor_membership" ? "vendor" : "customer";
          const role = authority === "admin_membership" ? "admin" : "viewer";
          const roleKey = authority === "admin_membership" ? "organization_admin" : "viewer";
          const status = authority === "revoked_membership" ? "revoked" : "active";
          const [organization] = await sql<{ id: string }[]>`
          INSERT INTO public.orgs(name,type,status,activated_at,migration_review_required)
          VALUES(${`Existing ${authority} organization`},${organizationType}::public.organization_type,'active',now(),false) RETURNING id`;
          await sql`INSERT INTO public.org_members (
            org_id, identity_id, user_id, role, role_key, status, migration_review_required,
            revoked_at, revoked_reason
          ) VALUES (
            ${organization!.id}::uuid, ${customer.identityId}::uuid, ${customer.subject}::uuid,
            ${role}::public.org_role, ${roleKey}, ${status}::public.membership_status, false,
            CASE WHEN ${status}='revoked' THEN now() ELSE NULL END,
            CASE WHEN ${status}='revoked' THEN 'Historical membership fixture' ELSE NULL END
          )`;
        }
        const [before] = await sql`SELECT
        (SELECT count(*)::int FROM public.customer_registrations WHERE identity_id=${customer.identityId}::uuid) AS registrations,
        (SELECT count(*)::int FROM public.portal_access_grants WHERE issued_by_identity_id=${customer.identityId}::uuid) AS grants,
        (SELECT count(*)::int FROM public.audit_events WHERE command='customer.workspace.create' AND actor_identity_id=${customer.identityId}::uuid) AS audits,
        (SELECT count(*)::int FROM public.security_command_receipts WHERE command='customer.workspace.create' AND actor_identity_id=${customer.identityId}::uuid) AS receipts`;
        const result = await asAuthenticated(sql, customer, (probe) =>
          probe`SELECT public.mmhr_start_customer_workspace(${randomUUID()}::uuid) AS result`, "aal1");
        expect(result[0]!.result).toMatchObject({ identityId: customer.identityId, organizationId: null, outcome: "existing_access" });
        const [after] = await sql`SELECT
        (SELECT count(*)::int FROM public.customer_registrations WHERE identity_id=${customer.identityId}::uuid) AS registrations,
        (SELECT count(*)::int FROM public.portal_access_grants WHERE issued_by_identity_id=${customer.identityId}::uuid) AS grants,
        (SELECT count(*)::int FROM public.audit_events WHERE command='customer.workspace.create' AND actor_identity_id=${customer.identityId}::uuid) AS audits,
        (SELECT count(*)::int FROM public.security_command_receipts WHERE command='customer.workspace.create' AND actor_identity_id=${customer.identityId}::uuid) AS receipts`;
        expect(after).toEqual(before);
      });
    },
  );

  test.each(["suspended", "archived", "recovery_pending"] as const)("never activates an existing %s account", async (status) => {
    await rollbackCase(context, async (sql) => {
      const customer = await createSecurityPrincipal(sql);
      await sql`UPDATE public.identities SET status=${status}::public.identity_status,
        suspended_at=CASE WHEN ${status}='suspended' THEN now() ELSE NULL END,
        archived_at=CASE WHEN ${status}='archived' THEN now() ELSE NULL END WHERE id=${customer.identityId}::uuid`;
      await expect(asAuthenticated(sql, customer, (probe) => probe`SELECT public.mmhr_start_customer_workspace(${randomUUID()}::uuid)`, "aal1"))
        .rejects.toMatchObject({ code: "42501" });
    });
  });

  test("retains administrator capacity for ordinary customer organizations", async () => {
    await rollbackCase(context, async (sql) => {
      await sql`INSERT INTO public.orgs(name,type,status,activated_at,migration_review_required)
        VALUES('Unmanaged test organization','customer','active',now(),false)`;
      await expect(sql.savepoint((probe) => probe`SELECT mmhr_private.r1_assert_administration_capacity(now())`))
        .rejects.toMatchObject({ code: "42501" });
    });
  });
});
