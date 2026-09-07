import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { applyAllMigrations, startRehearsal, stopRehearsal, type RehearsalContext } from "./r1-migration-rehearsal";
import { asAuthenticated, changeMembershipStatus, commandInput, createCommandFixture, createMembership, createSecurityPrincipal, rollbackCase, type SecurityCommandFixture,
  type SecurityPrincipal } from "./r1-security-command-fixtures";
import { overrideRequest, setOverride } from "./r1-security-command-permission-fixtures";

describe("organization member read boundaries", () => {
  let context: RehearsalContext;
  let fixture: SecurityCommandFixture;
  beforeAll(async () => {
    context = await startRehearsal("r1-member-read");
    await applyAllMigrations(context);
    fixture = await context.client.begin(createCommandFixture);
  }, 240_000);
  afterAll(async () => { if (context) await stopRehearsal(context); }, 180_000);

  test("returns only allowed member fields for the authorized organization", async () => {
    await rollbackCase(context, async (sql) => {
      const rows = await asAuthenticated(sql, fixture.organizationAdmin, (probe) => probe`
        SELECT * FROM public.mmhr_get_organization_members(${fixture.organizationId}::uuid)`);
      expect(rows).toHaveLength(3);
      expect(Object.keys(rows[0]!).sort()).toEqual(["identity_id", "membership_id", "role_key", "status"]);
      expect(rows.map((row) => row.membership_id).sort()).toEqual([
        fixture.adminMembershipId, fixture.actorMembershipId, fixture.targetMembershipId,
      ].sort());
    });
  });
  test("excludes target memberships awaiting migration review", async () => {
    await rollbackCase(context, async (sql) => {
      await sql`UPDATE public.org_members SET migration_review_required=true WHERE id=${fixture.targetMembershipId}::uuid`;
      const rows = await asAuthenticated(sql, fixture.organizationAdmin, (probe) => probe`
        SELECT * FROM public.mmhr_get_organization_members(${fixture.organizationId}::uuid)`);
      expect(rows.map((row) => row.membership_id)).not.toContain(fixture.targetMembershipId);
      expect(rows).toHaveLength(2);
      const page = await asAuthenticated(sql, fixture.organizationAdmin, (probe) => probe`
        SELECT * FROM public.mmhr_get_organization_members_page(${fixture.organizationId}::uuid)`);
      expect(page.map((row) => row.membership_id)).not.toContain(fixture.targetMembershipId);
      expect(page).toHaveLength(2);
    });
  });
  test("paginates with a look-ahead row and stable cursor boundaries", async () => {
    await rollbackCase(context, async (sql) => {
      const ids = [fixture.adminMembershipId, fixture.actorMembershipId, fixture.targetMembershipId].sort();
      const read = (after: string | null) => asAuthenticated(sql, fixture.organizationAdmin, (probe) => probe`
        SELECT * FROM public.mmhr_get_organization_members_page(${fixture.organizationId}::uuid,${after}::uuid,1)`);
      const first = await read(null);
      expect(first.map((row) => row.membership_id)).toEqual(ids.slice(0, 2));
      expect(Object.keys(first[0]!).sort()).toEqual(["identity_id", "membership_id", "organization_id", "role_key", "status"]);
      expect(first.every((row) => row.organization_id === fixture.organizationId)).toBe(true);
      expect((await read(ids[0]!)).map((row) => row.membership_id)).toEqual(ids.slice(1));
      expect(await read(ids[2]!)).toEqual([]);
    });
  });
  test("denies unauthorized pages, invalid bounds, and an unreviewed organization", async () => {
    await rollbackCase(context, async (sql) => {
      const read = (actor: SecurityPrincipal, organizationId = fixture.organizationId, size: number | null = 50,
        assurance: "aal1" | "aal2" = "aal2") => asAuthenticated(sql, actor, (probe) => probe`
          SELECT * FROM public.mmhr_get_organization_members_page(${organizationId}::uuid,NULL,${size})`, assurance);
      await expect(read(fixture.target)).rejects.toMatchObject({ code: "42501" });
      await expect(read(fixture.organizationAdmin, randomUUID())).rejects.toMatchObject({ code: "42501" });
      await expect(read(fixture.organizationAdmin, fixture.organizationId, 50, "aal1")).rejects.toMatchObject({ code: "42501" });
      for (const size of [0, -1, 101, null]) await expect(read(fixture.organizationAdmin, fixture.organizationId, size))
        .rejects.toMatchObject({ code: "22023" });
      await sql`UPDATE public.orgs SET migration_review_required=true WHERE id=${fixture.organizationId}::uuid`;
      await expect(read(fixture.organizationAdmin)).rejects.toMatchObject({ code: "42501" });
    });
  });
  test("redacts roles without removing the authorized member list", async () => {
    await rollbackCase(context, async (sql) => {
      const backup = await createSecurityPrincipal(sql);
      await createMembership(sql, fixture.organizationId, backup, "organization_admin");
      await asAuthenticated(sql, fixture.pair[0], (probe) => setOverride(probe, {
        ...overrideRequest(fixture.organizationAdmin.identityId), permissionKey: "member.role.read",
        organizationId: fixture.organizationId, effect: "deny",
      }));
      const rows = await asAuthenticated(sql, fixture.organizationAdmin, (probe) => probe`
        SELECT * FROM public.mmhr_get_organization_members_page(${fixture.organizationId}::uuid)`);
      expect(rows).toHaveLength(4);
      expect(rows.every((row) => row.role_key === null)).toBe(true);
    });
  });
  test("lists suspended memberships but not revoked memberships", async () => {
    await rollbackCase(context, async (sql) => {
      await asAuthenticated(sql, fixture.organizationAdmin, (probe) => changeMembershipStatus(probe,
        fixture.organizationId, fixture.targetMembershipId, "suspended", commandInput()));
      const read = () => asAuthenticated(sql, fixture.organizationAdmin, (probe) => probe`
        SELECT * FROM public.mmhr_get_organization_members_page(${fixture.organizationId}::uuid)`);
      expect((await read()).find((row) => row.membership_id === fixture.targetMembershipId)?.status).toBe("suspended");
      await asAuthenticated(sql, fixture.organizationAdmin, (probe) => changeMembershipStatus(probe,
        fixture.organizationId, fixture.targetMembershipId, "revoked", commandInput()));
      expect((await read()).map((row) => row.membership_id)).not.toContain(fixture.targetMembershipId);
    });
  });
});
