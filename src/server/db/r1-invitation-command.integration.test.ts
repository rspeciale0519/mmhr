import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { applyAllMigrations, startRehearsal, stopRehearsal, type RehearsalContext } from "./r1-migration-rehearsal";
import { asAuthenticated, createCommandFixture, createMembership, createSecurityPrincipal, rollbackCase,
  type SecurityCommandFixture, type SecurityPrincipal, type SecurityTransaction } from "./r1-security-command-fixtures";
import { overrideRequest, setOverride } from "./r1-security-command-permission-fixtures";

describe("R1 invitation lifecycle RPCs", () => {
  let context: RehearsalContext | undefined;
  let fixture: SecurityCommandFixture;
  beforeAll(async () => {
    context = await startRehearsal("r1-invitation-command");
    await applyAllMigrations(context);
    fixture = await context.client.begin(createCommandFixture);
  }, 240_000);
  afterAll(async () => { if (context) await stopRehearsal(context); }, 180_000);

  async function create(sql: SecurityTransaction, principal: SecurityPrincipal = fixture.organizationAdmin,
    email = `invitation-${randomUUID()}@example.invalid`, key = randomUUID(), assurance: "aal1" | "aal2" = "aal2") {
    return asAuthenticated(sql, principal, async (probe) => {
      const [row] = await probe<{ result: { invitationId: string; status: string; outcome: string } }[]>`
        SELECT public.mmhr_create_invitation(${fixture.organizationId}::uuid,${email},'viewer',
          'Isolated invitation lifecycle',${randomUUID()}::uuid,${key}::uuid) AS result`;
      return row!.result;
    }, assurance);
  }

  async function change(sql: SecurityTransaction, operation: "resend" | "revoke", invitationId: string,
    organizationId = fixture.organizationId, key = randomUUID()) {
    return asAuthenticated(sql, fixture.organizationAdmin, async (probe) => {
      const [row] = operation === "resend"
        ? await probe<{ result: { invitationId: string; status: string; outcome: string } }[]>`
          SELECT public.mmhr_resend_invitation(${organizationId}::uuid,${invitationId}::uuid,
            'Isolated invitation lifecycle',${randomUUID()}::uuid,${key}::uuid) AS result`
        : await probe<{ result: { invitationId: string; status: string; outcome: string } }[]>`
          SELECT public.mmhr_revoke_invitation(${organizationId}::uuid,${invitationId}::uuid,
            'Isolated invitation lifecycle',${randomUUID()}::uuid,${key}::uuid) AS result`;
      return row!.result;
    });
  }

  test("creates one invitation, audit receipt, and delivery intent on retry", async () => {
    await rollbackCase(context!, async (sql) => {
      const email = `invitation-${randomUUID()}@example.invalid`, key = randomUUID();
      const result = await create(sql, fixture.organizationAdmin, email, key);
      expect(result).toMatchObject({ status: "pending", outcome: "created" });
      await expect(create(sql, fixture.organizationAdmin, email, key))
        .resolves.toMatchObject({ invitationId: result.invitationId, outcome: "replayed" });
      const [state] = await sql`SELECT token, created_by_identity_id FROM public.invitations WHERE id=${result.invitationId}::uuid`;
      expect(state).toMatchObject({ token: null, created_by_identity_id: fixture.organizationAdmin.identityId });
      const [counts] = await sql`SELECT
        (SELECT count(*)::integer FROM public.audit_events WHERE entity_type='invitation' AND entity_id=${result.invitationId}) AS audits,
        (SELECT count(*)::integer FROM public.identity_admin_intents WHERE invitation_id=${result.invitationId}::uuid) AS intents`;
      expect(counts).toMatchObject({ audits: 1, intents: 1 });
    });
  }, 120_000);

  test("resends with a replacement and revokes it without duplicate transitions", async () => {
    await rollbackCase(context!, async (sql) => {
      const first = await create(sql), resendKey = randomUUID();
      const replacement = await change(sql, "resend", first.invitationId, fixture.organizationId, resendKey);
      expect(replacement).toMatchObject({ status: "pending", outcome: "replaced" });
      expect(replacement.invitationId).not.toBe(first.invitationId);
      await expect(change(sql, "resend", first.invitationId, fixture.organizationId, resendKey))
        .resolves.toMatchObject({ invitationId: replacement.invitationId, outcome: "replayed" });
      const revokeKey = randomUUID();
      await expect(change(sql, "revoke", replacement.invitationId, fixture.organizationId, revokeKey))
        .resolves.toMatchObject({ status: "revoked", outcome: "revoked" });
      await expect(change(sql, "revoke", replacement.invitationId, fixture.organizationId, revokeKey))
        .resolves.toMatchObject({ status: "revoked", outcome: "replayed" });
      const rows = await sql`SELECT status FROM public.invitations WHERE id IN (${first.invitationId}::uuid,${replacement.invitationId}::uuid)`;
      expect(rows).toHaveLength(2);
      expect(rows.every((row) => row.status === "revoked")).toBe(true);
    });
  }, 120_000);

  test("denies a viewer and an AAL1 administrator", async () => {
    await rollbackCase(context!, async (sql) => {
      await expect(create(sql, fixture.target)).rejects.toMatchObject({ code: "42501" });
      await expect(create(sql, fixture.organizationAdmin, undefined, undefined, "aal1"))
        .rejects.toMatchObject({ code: "42501" });
    });
  }, 120_000);

  test("lists only scoped invitation fields with stable bounded pagination", async () => {
    await rollbackCase(context!, async (sql) => {
      const ids = [(await create(sql)).invitationId, (await create(sql)).invitationId].sort();
      const read = (cursor: string | null) => asAuthenticated(sql, fixture.organizationAdmin, (probe) => probe`
        SELECT * FROM public.mmhr_get_organization_invitations(${fixture.organizationId}::uuid,${cursor}::uuid,1)`);
      const first = await read(null);
      expect(first.map((row) => row.invitation_id)).toEqual(ids);
      expect(Object.keys(first[0]!).sort()).toEqual([
        "created_at", "expires_at", "invitation_id", "invited_email", "organization_id", "role_key", "status",
      ]);
      expect(first.every((row) => row.organization_id === fixture.organizationId)).toBe(true);
      expect((await read(ids[0]!)).map((row) => row.invitation_id)).toEqual([ids[1]]);
      expect(await read(ids[1]!)).toEqual([]);
      await sql`UPDATE public.invitations SET migration_review_required=true WHERE id=${ids[0]!}::uuid`;
      expect((await read(null)).map((row) => row.invitation_id)).toEqual([ids[1]]);
    });
  }, 120_000);

  test("denies unauthorized organization invitation reads and invalid page bounds", async () => {
    await rollbackCase(context!, async (sql) => {
      await create(sql);
      const read = (actor: SecurityPrincipal, organizationId = fixture.organizationId, size = 50, assurance: "aal1" | "aal2" = "aal2") =>
        asAuthenticated(sql, actor, (probe) => probe`
          SELECT * FROM public.mmhr_get_organization_invitations(${organizationId}::uuid,NULL,${size})`, assurance);
      await expect(read(fixture.target)).rejects.toMatchObject({ code: "42501" });
      await expect(read(fixture.organizationAdmin, randomUUID())).rejects.toMatchObject({ code: "42501" });
      await expect(read(fixture.organizationAdmin, fixture.organizationId, 50, "aal1")).rejects.toMatchObject({ code: "42501" });
      for (const size of [0, -1, 101]) await expect(read(fixture.organizationAdmin, fixture.organizationId, size))
        .rejects.toMatchObject({ code: "22023" });
      await sql`UPDATE public.orgs SET migration_review_required=true WHERE id=${fixture.organizationId}::uuid`;
      await expect(read(fixture.organizationAdmin)).rejects.toMatchObject({ code: "42501" });
    });
  }, 120_000);

  test("redacts invitation roles after the caller loses field permission", async () => {
    await rollbackCase(context!, async (sql) => {
      await create(sql);
      const denyRoleRead = () => asAuthenticated(sql, fixture.pair[0], (probe) => setOverride(probe, {
        ...overrideRequest(fixture.organizationAdmin.identityId), permissionKey: "member.role.read",
        organizationId: fixture.organizationId, effect: "deny",
      }));
      // The last capable administrator cannot lose a required field permission.
      await expect(denyRoleRead()).rejects.toMatchObject({ code: "42501" });
      const backup = await createSecurityPrincipal(sql);
      await createMembership(sql, fixture.organizationId, backup, "organization_admin");
      await denyRoleRead();
      const rows = await asAuthenticated(sql, fixture.organizationAdmin, (probe) => probe`
        SELECT * FROM public.mmhr_get_organization_invitations(${fixture.organizationId}::uuid)`);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.role_key).toBeNull();
    });
  }, 120_000);

  test("accepts only the invited verified identity and records membership once", async () => {
    await rollbackCase(context!, async (sql) => {
      const principal = await createSecurityPrincipal(sql, "pending");
      const [identity] = await sql<{ normalized_email: string }[]>`SELECT normalized_email FROM public.identities
        WHERE id=${principal.identityId}::uuid`;
      const invitation = await create(sql, fixture.organizationAdmin, identity!.normalized_email);
      const pending = await asAuthenticated(sql, principal, (probe) => probe`SELECT * FROM public.mmhr_get_my_invitations()`);
      expect(pending.map((row) => row.invitation_id)).toEqual([invitation.invitationId]);
      // The server action uses this natural operation key across reloads.
      const key = invitation.invitationId;
      const accept = (email: string) => asAuthenticated(sql, principal, async (probe) => {
        const [row] = await probe<{ result: { outcome: string; status: string } }[]>`
          SELECT public.mmhr_accept_invitation(${invitation.invitationId}::uuid,${email},
            ${randomUUID()}::uuid,${key}::uuid) AS result`;
        return row!.result;
      });
      await expect(accept("different@example.invalid")).rejects.toMatchObject({ code: "42501" });
      await expect(accept(identity!.normalized_email)).resolves.toMatchObject({ status: "accepted", outcome: "accepted" });
      await expect(accept(identity!.normalized_email)).resolves.toMatchObject({ outcome: "replayed" });
      await expect(asAuthenticated(sql, fixture.target, (probe) => probe`
        SELECT public.mmhr_accept_invitation(${invitation.invitationId}::uuid,${identity!.normalized_email},
          ${randomUUID()}::uuid,${key}::uuid)`)).rejects.toMatchObject({ code: "42501" });
      const members = await sql`SELECT role_key,status FROM public.org_members
        WHERE org_id=${fixture.organizationId}::uuid AND identity_id=${principal.identityId}::uuid`;
      expect(members).toHaveLength(1);
      expect(members[0]).toMatchObject({ role_key: "viewer", status: "active" });
      const [audit] = await sql`SELECT after_summary FROM public.audit_events
        WHERE entity_id=${invitation.invitationId} AND action='invitation.accept'`;
      expect(audit!.after_summary).toMatchObject({ status: "accepted", record_id: expect.any(String) });
      const [counts] = await sql`
        SELECT
          (SELECT count(*)::integer FROM public.audit_events
            WHERE entity_id=${invitation.invitationId} AND action='invitation.accept') AS audits,
          (SELECT count(*)::integer FROM public.security_command_receipts
            WHERE actor_identity_id=${principal.identityId}::uuid AND command='invitation.accept'
              AND idempotency_key=${key}::uuid) AS receipts`;
      expect(counts).toMatchObject({ audits: 1, receipts: 1 });
    });
  }, 120_000);

  test.each(["resend", "revoke"] as const)("denies cross-organization %s", async (operation) => {
    await rollbackCase(context!, async (sql) => {
      const invitation = await create(sql);
      await expect(change(sql, operation, invitation.invitationId, randomUUID()))
        .rejects.toMatchObject({ code: "42501" });
    });
  }, 120_000);

  test("expires at the recorded boundary with one audit event and no membership", async () => {
    await rollbackCase(context!, async (sql) => {
      const principal = await createSecurityPrincipal(sql, "pending");
      const [identity] = await sql<{ normalized_email: string }[]>`SELECT normalized_email FROM public.identities
        WHERE id=${principal.identityId}::uuid`;
      // Seed elapsed time directly; live invitation expiry is immutable.
      const [boundary] = await sql<{ id: string; expires_at: string }[]>`INSERT INTO public.invitations
        (org_id,email,normalized_email,role,role_key,token,status,created_by_identity_id,
          expires_at,migration_review_required,created_at,updated_at)
        VALUES (${fixture.organizationId}::uuid,${identity!.normalized_email},${identity!.normalized_email},
          'viewer','viewer',NULL,'pending',${fixture.organizationAdmin.identityId}::uuid,
          transaction_timestamp(),false,transaction_timestamp()-interval '72 hours',transaction_timestamp())
        RETURNING id,expires_at::text`;
      const invitation = { invitationId: boundary!.id };
      await expect(asAuthenticated(sql, principal, (probe) => probe`SELECT * FROM public.mmhr_get_my_invitations()`))
        .resolves.toEqual([]);
      await expect(asAuthenticated(sql, principal, (probe) => probe`
        SELECT public.mmhr_accept_invitation(${invitation.invitationId}::uuid,${identity!.normalized_email},
          ${randomUUID()}::uuid,${randomUUID()}::uuid)`)).rejects.toMatchObject({ code: "42501" });
      const expire = () => asAuthenticated(sql, fixture.organizationAdmin, async (probe) => {
        const [row] = await probe<{ result: { status: string; outcome: string } }[]>`
          SELECT public.mmhr_expire_invitation(${invitation.invitationId}::uuid,
            ${boundary!.expires_at}::timestamptz,${randomUUID()}::uuid) AS result`;
        return row!.result;
      });
      await expect(expire()).resolves.toMatchObject({ status: "expired", outcome: "expired" });
      await expect(expire()).resolves.toMatchObject({ status: "expired", outcome: "replayed" });
      const [counts] = await sql`SELECT
        (SELECT count(*)::integer FROM public.audit_events WHERE entity_id=${invitation.invitationId}
          AND action='invitation.expire') AS audits,
        (SELECT count(*)::integer FROM public.org_members WHERE identity_id=${principal.identityId}::uuid) AS memberships`;
      expect(counts).toMatchObject({ audits: 1, memberships: 0 });
    });
  }, 120_000);

  test.each(["banned", "deleted", "anonymous", "expired_session", "revoked_session", "contained",
    "invitation_review", "organization_review"] as const)(
    "denies invitation reads and acceptance for %s", async (restriction) => {
      await rollbackCase(context!, async (sql) => {
        const principal = await createSecurityPrincipal(sql, "pending");
        const [identity] = await sql<{ normalized_email: string }[]>`SELECT normalized_email FROM public.identities
          WHERE id=${principal.identityId}::uuid`;
        const invitation = await create(sql, fixture.organizationAdmin, identity!.normalized_email);
        if (restriction === "banned") await sql`UPDATE auth.users SET banned_until=clock_timestamp()+interval '1 hour' WHERE id=${principal.subject}::uuid`;
        if (restriction === "deleted") await sql`UPDATE auth.users SET deleted_at=clock_timestamp() WHERE id=${principal.subject}::uuid`;
        if (restriction === "anonymous") await sql`UPDATE auth.users SET is_anonymous=true WHERE id=${principal.subject}::uuid`;
        if (restriction === "expired_session") await sql`UPDATE auth.sessions SET not_after=clock_timestamp()-interval '1 minute' WHERE id=${principal.sessionId}::uuid`;
        if (restriction === "revoked_session") await sql`DELETE FROM auth.sessions WHERE id=${principal.sessionId}::uuid`;
        if (restriction === "contained") await sql`UPDATE public.identities SET authorization_not_before=clock_timestamp() WHERE id=${principal.identityId}::uuid`;
        if (restriction === "invitation_review") await sql`UPDATE public.invitations SET migration_review_required=true WHERE id=${invitation.invitationId}::uuid`;
        if (restriction === "organization_review") await sql`UPDATE public.orgs SET migration_review_required=true WHERE id=${fixture.organizationId}::uuid`;
        await expect(asAuthenticated(sql, principal, (probe) => probe`SELECT * FROM public.mmhr_get_my_invitations()`))
          .resolves.toEqual([]);
        await expect(asAuthenticated(sql, principal, (probe) => probe`
          SELECT public.mmhr_accept_invitation(${invitation.invitationId}::uuid,${identity!.normalized_email},
            ${randomUUID()}::uuid,${randomUUID()}::uuid)`)).rejects.toMatchObject({ code: "42501" });
        const [state] = await sql`SELECT status FROM public.invitations WHERE id=${invitation.invitationId}::uuid`;
        expect(state!.status).toBe("pending");
      });
    }, 120_000,
  );
});
