import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { applyAllMigrations, type RehearsalContext, startRehearsal, stopRehearsal } from "./r1-migration-rehearsal";
import {
  asAuthenticated, createCommandFixture, createMembership, createSecurityPrincipal, rollbackCase,
  type SecurityCommandFixture, type SecurityPrincipal, type SecurityTransaction,
} from "./r1-security-command-fixtures";

type Assurance = "aal1" | "aal2";
type VendorRow = { organizationId: string; name: string; status: string; portalOn: boolean; activeMembers: number;
  profileStatus: string | null; pendingInvitations: { invitationId: string; email: string; expiresAt: string; expired: boolean }[] };
type Directory = { version: number; items: VendorRow[]; truncated: boolean };
type Result = Record<string, string>;

const emailOf = (principal: SecurityPrincipal) => `security-${principal.subject}@example.invalid`;

const commandNames = {
  create: "mmhr_create_staff_vendor",
  portal: "mmhr_enable_staff_vendor_portal",
  invite: "mmhr_invite_staff_vendor_admin",
} as const;

function command(kind: keyof typeof commandNames) {
  return (sql: SecurityTransaction, principal: SecurityPrincipal, payload: object,
    idempotencyKey = randomUUID(), assurance: Assurance = "aal2") =>
    asAuthenticated(sql, principal, async (probe) => {
      // The function name comes from the fixed map above, never from input.
      const [row] = await probe.unsafe<{ result: Result }[]>(
        `SELECT public.${commandNames[kind]}($1::text::jsonb, $2::uuid, $3::uuid) AS result`,
        [JSON.stringify(payload), randomUUID(), idempotencyKey]);
      return row!.result;
    }, assurance);
}
const createVendor = command("create");
const enablePortal = command("portal");
const inviteAdmin = command("invite");

function readDirectory(sql: SecurityTransaction, principal: SecurityPrincipal, assurance: Assurance = "aal2") {
  return asAuthenticated(sql, principal, async (probe) => {
    const [row] = await probe<{ page: Directory }[]>`
      SELECT public.mmhr_get_staff_vendor_directory(${JSON.stringify({})}::text::jsonb) AS page`;
    return row!.page;
  }, assurance);
}

function myInvitations(sql: SecurityTransaction, principal: SecurityPrincipal) {
  return asAuthenticated(sql, principal, (probe) => probe<{ invitation_id: string; organization_id: string }[]>`
    SELECT invitation_id, organization_id FROM public.mmhr_get_my_invitations()`, "aal1");
}

function accept(sql: SecurityTransaction, principal: SecurityPrincipal, invitationId: string) {
  return asAuthenticated(sql, principal, async (probe) => {
    const [row] = await probe<{ result: Result }[]>`
      SELECT public.mmhr_accept_invitation(${invitationId}::uuid, ${emailOf(principal)}, ${randomUUID()}::uuid,
        ${invitationId}::uuid) AS result`;
    return row!.result;
  }, "aal1");
}

function readInbox(sql: SecurityTransaction, principal: SecurityPrincipal, organizationId: string) {
  return asAuthenticated(sql, principal, async (probe) => {
    const [row] = await probe<{ inbox: { items: unknown[] } }[]>`
      SELECT public.mmhr_get_vendor_rfps(${JSON.stringify({ organizationId })}::text::jsonb, ${randomUUID()}::uuid) AS inbox`;
    return row!.inbox;
  }, "aal1");
}

function hasPortal(sql: SecurityTransaction, principal: SecurityPrincipal, organizationId: string) {
  return asAuthenticated(sql, principal, async (probe) => {
    const rows = await probe`SELECT 1 FROM public.mmhr_authorize('portal.vendor.access', ${organizationId}::uuid)`;
    return rows.length === 1;
  }, "aal1");
}

async function capacity(sql: SecurityTransaction) {
  await sql.savepoint((probe) => probe`SELECT mmhr_private.r1_assert_administration_capacity(clock_timestamp())`);
}

async function pendingInvitee(sql: SecurityTransaction, mfa = true) {
  const principal = await createSecurityPrincipal(sql, "pending");
  if (!mfa) await sql`UPDATE auth.mfa_factors SET status = 'unverified' WHERE user_id = ${principal.subject}::uuid`;
  return principal;
}

/** Staff add a vendor, turn on its portal, and invite one first administrator. */
async function setUpVendor(sql: SecurityTransaction, staff: SecurityPrincipal, invitee: SecurityPrincipal) {
  const vendor = await createVendor(sql, staff, { name: `Isolated vendor ${randomUUID()}` });
  const organizationId = vendor.organizationId!;
  await enablePortal(sql, staff, { organizationId });
  const invitation = await inviteAdmin(sql, staff, { organizationId, email: emailOf(invitee) });
  return { organizationId, invitationId: invitation.invitationId! };
}

async function registerCustomer(sql: SecurityTransaction) {
  const customer = await createSecurityPrincipal(sql);
  const [row] = await asAuthenticated(sql, customer, (probe) => probe<{ result: { organizationId: string } }[]>`
    SELECT public.mmhr_start_customer_workspace(${randomUUID()}::uuid) AS result
  `, "aal1");
  return { customer, organizationId: row!.result.organizationId };
}

async function existingVendorUser(sql: SecurityTransaction, fixture: SecurityCommandFixture) {
  const vendor = await createSecurityPrincipal(sql);
  const [org] = await sql<{ id: string }[]>`
    INSERT INTO public.orgs (name, type, status, activated_at, migration_review_required)
    VALUES ('Isolated active vendor fixture', 'vendor', 'active', now(), false) RETURNING id
  `;
  await createMembership(sql, org!.id, fixture.organizationAdmin, "organization_admin");
  await createMembership(sql, org!.id, vendor, "organization_admin");
  await sql`INSERT INTO public.portal_access_grants (organization_id, portal, issued_by_identity_id, issue_reason)
    VALUES (${org!.id}::uuid, 'vendor', ${fixture.pair[0].identityId}::uuid, 'Isolated vendor portal fixture')`;
  return { vendor, organizationId: org!.id };
}

describe("staff vendor setup", () => {
  let context: RehearsalContext;
  let fixture: SecurityCommandFixture;

  beforeAll(async () => {
    context = await startRehearsal("staff-vendor");
    await applyAllMigrations(context);
    fixture = await context.client.begin(createCommandFixture);
  }, 240_000);

  afterAll(async () => {
    if (context) await stopRehearsal(context);
  }, 180_000);

  test("staff add a pending vendor, turn on its portal, and invite its first admin while capacity holds", async () => {
    await rollbackCase(context, async (sql) => {
      const staff = fixture.pair[0];
      const invitee = await pendingInvitee(sql);
      const name = `Isolated vendor ${randomUUID()}`;
      const created = await createVendor(sql, staff, { name });
      expect(created).toMatchObject({ outcomeCode: "created" });
      const organizationId = created.organizationId!;
      const [state] = await sql<{ status: string; type: string; profile: string; members: number; audits: number }[]>`
        SELECT o.status::text, o.type::text, p.status AS profile,
          (SELECT count(*)::int FROM public.org_members m WHERE m.org_id = o.id) AS members,
          (SELECT count(*)::int FROM public.audit_events e WHERE e.entity_id = o.id::text
            AND e.action = 'staff.vendor.create' AND e.actor_identity_id = ${staff.identityId}::uuid) AS audits
        FROM public.orgs o JOIN public.vendor_profiles p ON p.organization_id = o.id WHERE o.id = ${organizationId}::uuid`;
      expect(state).toEqual({ status: "pending", type: "vendor", profile: "prospect", members: 0, audits: 1 });
      await capacity(sql);

      await expect(enablePortal(sql, staff, { organizationId })).resolves.toMatchObject({ outcomeCode: "enabled" });
      const invited = await inviteAdmin(sql, staff, { organizationId, email: emailOf(invitee).toUpperCase() });
      expect(invited).toMatchObject({ outcomeCode: "invited", email: emailOf(invitee) });
      await capacity(sql);

      const [audits] = await sql<{ portal: number; invite: number; staffMembers: number }[]>`
        SELECT
          (SELECT count(*)::int FROM public.audit_events WHERE organization_id = ${organizationId}::uuid
            AND action = 'portal_access.grant') AS portal,
          (SELECT count(*)::int FROM public.audit_events WHERE organization_id = ${organizationId}::uuid
            AND action = 'staff.vendor.invite' AND entity_id = ${invited.invitationId!}) AS invite,
          (SELECT count(*)::int FROM public.org_members WHERE org_id = ${organizationId}::uuid
            AND identity_id = ${staff.identityId}::uuid) AS "staffMembers"`;
      expect(audits).toEqual({ portal: 1, invite: 1, staffMembers: 0 });

      const page = await readDirectory(sql, staff);
      expect(page.items.find((item) => item.organizationId === organizationId)).toMatchObject({
        name, status: "pending", portalOn: true, activeMembers: 0, profileStatus: "prospect",
        pendingInvitations: [{ invitationId: invited.invitationId, email: emailOf(invitee), expired: false }],
      });
    });
  });

  test("acceptance with MFA activates the vendor, opens its portal, keeps capacity, and capacity refuses when the admin leaves", async () => {
    await rollbackCase(context, async (sql) => {
      const invitee = await pendingInvitee(sql);
      const { organizationId, invitationId } = await setUpVendor(sql, fixture.pair[0], invitee);
      await expect(myInvitations(sql, invitee)).resolves.toEqual(
        expect.arrayContaining([expect.objectContaining({ invitation_id: invitationId, organization_id: organizationId })]));
      await capacity(sql);

      await expect(accept(sql, invitee, invitationId)).resolves.toMatchObject({ outcome: "accepted" });
      const [state] = await sql<{ status: string; activated: boolean; admins: number; activations: number }[]>`
        SELECT o.status::text, o.activated_at IS NOT NULL AS activated,
          (SELECT count(*)::int FROM public.org_members m WHERE m.org_id = o.id AND m.status = 'active'
            AND m.role_key = 'organization_admin' AND m.identity_id = ${invitee.identityId}::uuid) AS admins,
          (SELECT count(*)::int FROM public.audit_events e WHERE e.entity_type = 'organization'
            AND e.entity_id = o.id::text AND e.action = 'organization.activate') AS activations
        FROM public.orgs o WHERE o.id = ${organizationId}::uuid`;
      expect(state).toEqual({ status: "active", activated: true, admins: 1, activations: 1 });
      await capacity(sql);
      await expect(hasPortal(sql, invitee, organizationId)).resolves.toBe(true);
      await expect(readInbox(sql, invitee, organizationId)).resolves.toMatchObject({ items: [] });

      await sql`UPDATE public.org_members SET status = 'revoked', revoked_at = clock_timestamp(),
        revoked_reason = 'Isolated departure' WHERE org_id = ${organizationId}::uuid AND identity_id = ${invitee.identityId}::uuid`;
      await expect(capacity(sql)).rejects.toMatchObject({ code: "42501" });
    });
  });

  test("acceptance without MFA is refused and the vendor stays pending", async () => {
    await rollbackCase(context, async (sql) => {
      const invitee = await pendingInvitee(sql, false);
      const { organizationId, invitationId } = await setUpVendor(sql, fixture.pair[0], invitee);
      await expect(accept(sql, invitee, invitationId)).rejects.toMatchObject({ code: "42501", message: "Two-step sign-in required" });
      const [state] = await sql<{ status: string; members: number }[]>`
        SELECT o.status::text, (SELECT count(*)::int FROM public.org_members m WHERE m.org_id = o.id) AS members
        FROM public.orgs o WHERE o.id = ${organizationId}::uuid`;
      expect(state).toEqual({ status: "pending", members: 0 });
      await capacity(sql);
    });
  });

  test("repeat calls create no duplicate vendor, grant, or invitation", async () => {
    await rollbackCase(context, async (sql) => {
      const staff = fixture.pair[0];
      const invitee = await pendingInvitee(sql);
      const name = `Isolated vendor ${randomUUID()}`;
      const createKey = randomUUID();
      const first = await createVendor(sql, staff, { name }, createKey);
      await expect(createVendor(sql, staff, { name }, createKey))
        .resolves.toMatchObject({ outcomeCode: "replayed", organizationId: first.organizationId });
      await expect(createVendor(sql, staff, { name: ` ${name.toUpperCase()} ` })).rejects.toMatchObject({ code: "23505" });
      await expect(createVendor(sql, staff, { name: "Changed name" }, createKey)).rejects.toMatchObject({ code: "22023" });

      const organizationId = first.organizationId!;
      const portalKey = randomUUID();
      const portal = await enablePortal(sql, staff, { organizationId }, portalKey);
      await expect(enablePortal(sql, staff, { organizationId }, portalKey)).resolves.toMatchObject({ outcomeCode: "replayed", grantId: portal.grantId });
      await expect(enablePortal(sql, staff, { organizationId })).resolves.toMatchObject({ outcomeCode: "existing", grantId: portal.grantId });

      const inviteKey = randomUUID();
      const invited = await inviteAdmin(sql, staff, { organizationId, email: emailOf(invitee) }, inviteKey);
      await expect(inviteAdmin(sql, staff, { organizationId, email: emailOf(invitee) }, inviteKey))
        .resolves.toMatchObject({ outcomeCode: "replayed", invitationId: invited.invitationId });
      await expect(inviteAdmin(sql, staff, { organizationId, email: emailOf(invitee) }))
        .resolves.toMatchObject({ outcomeCode: "existing", invitationId: invited.invitationId });

      const [counts] = await sql<{ orgs: number; grants: number; invitations: number; audits: number }[]>`
        SELECT
          (SELECT count(*)::int FROM public.orgs WHERE lower(name) = lower(${name})) AS orgs,
          (SELECT count(*)::int FROM public.portal_access_grants WHERE organization_id = ${organizationId}::uuid) AS grants,
          (SELECT count(*)::int FROM public.invitations WHERE org_id = ${organizationId}::uuid) AS invitations,
          (SELECT count(*)::int FROM public.audit_events WHERE organization_id = ${organizationId}::uuid) AS audits`;
      expect(counts).toEqual({ orgs: 1, grants: 1, invitations: 1, audits: 3 });
    });
  });

  test("an expired pending invitation is marked expired and replaced", async () => {
    await rollbackCase(context, async (sql) => {
      const staff = fixture.pair[0];
      const invitee = await pendingInvitee(sql);
      const created = await createVendor(sql, staff, { name: `Isolated vendor ${randomUUID()}` });
      const organizationId = created.organizationId!;
      const [old] = await sql<{ id: string }[]>`
        INSERT INTO public.invitations (org_id, email, normalized_email, role, role_key, status, created_by_identity_id,
          expires_at, migration_review_required, created_at, updated_at)
        VALUES (${organizationId}::uuid, ${emailOf(invitee)}, ${emailOf(invitee)}, 'admin', 'organization_admin', 'pending',
          ${staff.identityId}::uuid, clock_timestamp() - interval '1 hour', false,
          clock_timestamp() - interval '4 days', clock_timestamp() - interval '4 days') RETURNING id`;
      const invited = await inviteAdmin(sql, staff, { organizationId, email: emailOf(invitee) });
      expect(invited).toMatchObject({ outcomeCode: "invited" });
      expect(invited.invitationId).not.toBe(old!.id);
      const [status] = await sql<{ status: string }[]>`SELECT status::text FROM public.invitations WHERE id = ${old!.id}::uuid`;
      expect(status!.status).toBe("expired");
      await expect(accept(sql, invitee, invited.invitationId!)).resolves.toMatchObject({ outcome: "accepted" });
    });
  });

  test("an invitation that the staff command did not issue cannot activate a pending vendor", async () => {
    await rollbackCase(context, async (sql) => {
      const staff = fixture.pair[0];
      const invitee = await pendingInvitee(sql);
      const created = await createVendor(sql, staff, { name: `Isolated vendor ${randomUUID()}` });
      const organizationId = created.organizationId!;
      const [direct] = await sql<{ id: string }[]>`
        INSERT INTO public.invitations (org_id, email, normalized_email, role, role_key, status, created_by_identity_id,
          expires_at, migration_review_required, created_at, updated_at)
        VALUES (${organizationId}::uuid, ${emailOf(invitee)}, ${emailOf(invitee)}, 'admin', 'organization_admin', 'pending',
          ${staff.identityId}::uuid, clock_timestamp() + interval '1 day', false, clock_timestamp(), clock_timestamp())
        RETURNING id`;
      await expect(myInvitations(sql, invitee)).resolves.toEqual([]);
      await expect(accept(sql, invitee, direct!.id)).rejects.toMatchObject({ code: "42501" });
      const [state] = await sql<{ status: string }[]>`SELECT status::text FROM public.orgs WHERE id = ${organizationId}::uuid`;
      expect(state!.status).toBe("pending");
    });
  });

  test("customers and vendors cannot call the staff vendor actions", async () => {
    await rollbackCase(context, async (sql) => {
      const { customer } = await registerCustomer(sql);
      const { vendor, organizationId } = await existingVendorUser(sql, fixture);
      for (const caller of [customer, vendor]) {
        for (const assurance of ["aal1", "aal2"] as const) {
          await expect(readDirectory(sql, caller, assurance)).rejects.toMatchObject({ code: "42501" });
          await expect(createVendor(sql, caller, { name: `Denied ${randomUUID()}` }, randomUUID(), assurance))
            .rejects.toMatchObject({ code: "42501" });
          await expect(enablePortal(sql, caller, { organizationId }, randomUUID(), assurance))
            .rejects.toMatchObject({ code: "42501" });
          await expect(inviteAdmin(sql, caller, { organizationId, email: "denied@example.invalid" }, randomUUID(), assurance))
            .rejects.toMatchObject({ code: "42501" });
        }
      }
      const [counts] = await sql<{ invitations: number }[]>`
        SELECT count(*)::int AS invitations FROM public.invitations WHERE org_id = ${organizationId}::uuid`;
      expect(counts!.invitations).toBe(0);
    });
  });

  test("staff need AAL2 for every staff vendor RPC", async () => {
    await rollbackCase(context, async (sql) => {
      const staff = fixture.pair[0];
      const created = await createVendor(sql, staff, { name: `Isolated vendor ${randomUUID()}` });
      const organizationId = created.organizationId!;
      await expect(readDirectory(sql, staff, "aal1")).rejects.toMatchObject({ code: "42501" });
      await expect(createVendor(sql, staff, { name: `Low assurance ${randomUUID()}` }, randomUUID(), "aal1"))
        .rejects.toMatchObject({ code: "42501" });
      await expect(enablePortal(sql, staff, { organizationId }, randomUUID(), "aal1")).rejects.toMatchObject({ code: "42501" });
      await expect(inviteAdmin(sql, staff, { organizationId, email: "low@example.invalid" }, randomUUID(), "aal1"))
        .rejects.toMatchObject({ code: "42501" });
    });
  });

  test("staff accounts, customer organizations, and bad input are refused", async () => {
    await rollbackCase(context, async (sql) => {
      const staff = fixture.pair[0];
      const created = await createVendor(sql, staff, { name: `Isolated vendor ${randomUUID()}` });
      const organizationId = created.organizationId!;
      await expect(inviteAdmin(sql, staff, { organizationId, email: emailOf(fixture.pair[1]) })).rejects.toMatchObject({ code: "42501" });
      await expect(enablePortal(sql, staff, { organizationId: fixture.organizationId })).rejects.toMatchObject({ code: "42501" });
      await expect(inviteAdmin(sql, staff, { organizationId: fixture.organizationId, email: "customer@example.invalid" }))
        .rejects.toMatchObject({ code: "42501" });
      await expect(createVendor(sql, staff, { name: "  " })).rejects.toMatchObject({ code: "22023" });
      await expect(createVendor(sql, staff, { name: "Vendor", extra: true })).rejects.toMatchObject({ code: "22023" });
      await expect(inviteAdmin(sql, staff, { organizationId, email: "not-an-email" })).rejects.toMatchObject({ code: "22023" });
    });
  });

  test("vendor A cannot read vendor B, and neither gains customer access", async () => {
    await rollbackCase(context, async (sql) => {
      const staff = fixture.pair[0];
      const first = await pendingInvitee(sql), second = await pendingInvitee(sql);
      const vendorA = await setUpVendor(sql, staff, first);
      const vendorB = await setUpVendor(sql, staff, second);
      await accept(sql, first, vendorA.invitationId);
      await accept(sql, second, vendorB.invitationId);
      await capacity(sql);
      await expect(readInbox(sql, first, vendorA.organizationId)).resolves.toMatchObject({ items: [] });
      await expect(readInbox(sql, first, vendorB.organizationId)).rejects.toMatchObject({ code: "42501" });
      await expect(readInbox(sql, second, vendorA.organizationId)).rejects.toMatchObject({ code: "42501" });
      await expect(hasPortal(sql, first, vendorB.organizationId)).resolves.toBe(false);
      await expect(myInvitations(sql, first)).resolves.toEqual([]);
      const { customer, organizationId } = await registerCustomer(sql);
      await expect(asAuthenticated(sql, first, (probe) => probe`
        SELECT 1 FROM public.mmhr_authorize('workspace.access', ${organizationId}::uuid)`, "aal1")).resolves.toHaveLength(0);
      await expect(asAuthenticated(sql, customer, (probe) => probe`
        SELECT 1 FROM public.mmhr_authorize('workspace.access', ${vendorA.organizationId}::uuid)`, "aal1")).resolves.toHaveLength(0);
    });
  });
});
