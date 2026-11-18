import { createHash, randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { applyAllMigrations, type RehearsalContext, startRehearsal, stopRehearsal } from "./r1-migration-rehearsal";
import {
  asAuthenticated, createCommandFixture, createMembership, createSecurityPrincipal, rollbackCase,
  type SecurityCommandFixture, type SecurityPrincipal, type SecurityTransaction,
} from "./r1-security-command-fixtures";
import { assignPlatformRole } from "./r1-security-command-administration-fixtures";
import { overrideRequest, setOverride } from "./r1-security-command-permission-fixtures";
import {
  addContributor, addPortalGrant, CONFIG, fixtureDates, prepare, publish, seedSubmittedIntake,
} from "./r3-evaluation-publication-fixtures";
import { invoke, read } from "./test/r6-proposal-quote-fixtures";

type Assurance = "aal1" | "aal2";
type Result = Record<string, string>;
type VendorRow = { organizationId: string; status: string; activeMembers: number; callerHasAccess: boolean };
type Directory = { version: number; items: VendorRow[]; truncated: boolean; callerCanList: boolean };

const emailOf = (principal: SecurityPrincipal) => `security-${principal.subject}@example.invalid`;
const reason = "List vendor for customer comparisons";

const commandNames = {
  create: "mmhr_create_staff_vendor",
  portal: "mmhr_enable_staff_vendor_portal",
  invite: "mmhr_invite_staff_vendor_admin",
  list: "mmhr_list_staff_vendor",
  open: "mmhr_open_staff_vendor_workspace",
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
const listVendor = command("list");
const openWorkspace = command("open");

function readDirectory(sql: SecurityTransaction, principal: SecurityPrincipal) {
  return asAuthenticated(sql, principal, async (probe) => {
    const [row] = await probe<{ page: Directory }[]>`
      SELECT public.mmhr_get_staff_vendor_directory(${JSON.stringify({})}::text::jsonb) AS page`;
    return row!.page;
  });
}

function accept(sql: SecurityTransaction, principal: SecurityPrincipal, invitationId: string) {
  return asAuthenticated(sql, principal, async (probe) => {
    const [row] = await probe<{ result: Result }[]>`
      SELECT public.mmhr_accept_invitation(${invitationId}::uuid, ${emailOf(principal)}, ${randomUUID()}::uuid,
        ${invitationId}::uuid) AS result`;
    return row!.result;
  }, "aal1");
}

function allowed(sql: SecurityTransaction, principal: SecurityPrincipal, permission: string,
  organizationId: string | null, assurance: Assurance = "aal2") {
  return asAuthenticated(sql, principal, async (probe) => {
    const rows = await probe`SELECT 1 FROM public.mmhr_authorize(${permission}, ${organizationId}::uuid)`;
    return rows.length === 1;
  }, assurance);
}

function readInbox(sql: SecurityTransaction, principal: SecurityPrincipal, organizationId: string, assurance: Assurance = "aal1") {
  return read(sql, principal, "mmhr_get_vendor_rfps", { organizationId }, assurance) as Promise<{ items: unknown[] }>;
}

async function capacity(sql: SecurityTransaction) {
  await sql.savepoint((probe) => probe`SELECT mmhr_private.r1_assert_administration_capacity(clock_timestamp())`);
}

async function orgState(sql: SecurityTransaction, organizationId: string) {
  const [row] = await sql<{ status: string; activated: boolean }[]>`
    SELECT status::text, activated_at IS NOT NULL AS activated FROM public.orgs WHERE id = ${organizationId}::uuid`;
  return row!;
}

async function pendingVendor(sql: SecurityTransaction, staff: SecurityPrincipal) {
  const created = await createVendor(sql, staff, { name: `Listed vendor ${randomUUID()}` });
  return { organizationId: created.organizationId!, profileId: created.profileId! };
}

async function listedVendor(sql: SecurityTransaction, staff: SecurityPrincipal) {
  const vendor = await pendingVendor(sql, staff);
  await listVendor(sql, staff, { organizationId: vendor.organizationId, reason });
  return vendor;
}

/** A staff member with admin.access through the platform role command, not a Super Admin. */
async function staffMember(sql: SecurityTransaction, fixture: SecurityCommandFixture) {
  const principal = await createSecurityPrincipal(sql);
  await asAuthenticated(sql, fixture.pair[0], (probe) => assignPlatformRole(probe, principal.identityId, "staff"));
  return principal;
}

async function registerCustomer(sql: SecurityTransaction) {
  const customer = await createSecurityPrincipal(sql);
  const [row] = await asAuthenticated(sql, customer, (probe) => probe<{ result: { organizationId: string } }[]>`
    SELECT public.mmhr_start_customer_workspace(${randomUUID()}::uuid) AS result
  `, "aal1");
  return { customer, organizationId: row!.result.organizationId };
}

async function vendorUser(sql: SecurityTransaction, fixture: SecurityCommandFixture) {
  const vendor = await createSecurityPrincipal(sql);
  const [org] = await sql<{ id: string }[]>`
    INSERT INTO public.orgs (name, type, status, activated_at, migration_review_required)
    VALUES ('Isolated joined vendor fixture', 'vendor', 'active', now(), false) RETURNING id`;
  await createMembership(sql, org!.id, fixture.organizationAdmin, "organization_admin");
  await createMembership(sql, org!.id, vendor, "organization_admin");
  return { vendor, organizationId: org!.id };
}

const hash = (text: string) => createHash("sha256").update(text).digest("hex");

/** Records and approves one product fact through the staff evidence RPCs. */
async function approvedFact(sql: SecurityTransaction, staff: SecurityPrincipal, vendor: { organizationId: string; profileId: string },
  productId: string, fieldKey: string, value: string) {
  const dates = fixtureDates();
  const sourceId = randomUUID(), factId = randomUUID(), evidenceId = randomUUID();
  const citation = `Vendor page states ${fieldKey}`;
  await invoke(sql, staff, "mmhr_record_vendor_evidence", {
    source: { sourceId, organizationId: vendor.organizationId, vendorProfileId: vendor.profileId,
      uri: "https://vendor.example.test/listing", sourceType: "vendor_owned", licenseNote: null,
      capturedAt: dates.capturedAt, active: true, captureMethod: "manual", cadenceDays: 30 },
    fact: { factId, organizationId: vendor.organizationId, vendorProfileId: vendor.profileId, productId,
      fieldKey, value, observedAt: dates.capturedAt, status: "draft" },
    evidence: { evidenceId, organizationId: vendor.organizationId, factId, sourceId, version: 1,
      contentHash: hash(citation), capturedAt: dates.capturedAt, freshUntil: dates.freshUntil, citation },
  }, "aal2", evidenceId);
  const approvalId = randomUUID();
  await invoke(sql, staff, "mmhr_approve_vendor_evidence", {
    approvalId, organizationId: vendor.organizationId, evidenceId, decision: "approved",
    decidedAt: new Date(Date.now() - 60_000).toISOString(), reason: "Source checked",
  }, "aal2", approvalId);
}

/** The full staff path on a vendor with no vendor users: list, open, add product, evidence, approvals. */
async function staffEnteredProduct(sql: SecurityTransaction, staff: SecurityPrincipal) {
  const vendor = await listedVendor(sql, staff);
  await openWorkspace(sql, staff, { organizationId: vendor.organizationId });
  const product = await invoke(sql, staff, "mmhr_create_product", {
    organizationId: vendor.organizationId, vendorProfileId: vendor.profileId, stableKey: "listed_payroll",
    name: "Listed payroll", description: null, status: "draft", idempotencyKey: randomUUID(),
  });
  const productId = String(product.recordId);
  await invoke(sql, staff, "mmhr_update_product", {
    organizationId: vendor.organizationId, productId, status: "active", expectedRevision: 1, idempotencyKey: randomUUID(),
  });
  const [profile] = await sql<{ revision: number }[]>`
    SELECT revision FROM public.vendor_profiles WHERE id = ${vendor.profileId}::uuid`;
  await invoke(sql, staff, "mmhr_approve_vendor_catalog_profile", {
    organizationId: vendor.organizationId, profileId: vendor.profileId, expectedRevision: profile!.revision,
    reason: "Catalog profile checked", approvalReference: "approval:listed-vendor",
  });
  await approvedFact(sql, staff, vendor, productId, "input_payroll", "yes");
  await approvedFact(sql, staff, vendor, productId, "comparison_fact_scopes",
    JSON.stringify({ input_payroll: { version: 1, conditions: [] } }));
  return { ...vendor, productId };
}

async function approvedInputs(sql: SecurityTransaction, organizationId: string, productId: string) {
  return sql<{ field_key: string }[]>`
    SELECT field_key FROM mmhr_private.r3_approved_vendor_inputs(${organizationId}::uuid, ${productId}::uuid, clock_timestamp())
    ORDER BY field_key`;
}

describe("staff vendor listing", () => {
  let context: RehearsalContext;
  let fixture: SecurityCommandFixture;

  beforeAll(async () => {
    context = await startRehearsal("staff-vendor-listing");
    await applyAllMigrations(context);
    fixture = await context.client.begin(createCommandFixture);
  }, 240_000);

  afterAll(async () => {
    if (context) await stopRehearsal(context);
  }, 180_000);

  test("a Super Admin lists a pending vendor with no users, writes one audit event, and replays", async () => {
    await rollbackCase(context, async (sql) => {
      const staff = fixture.pair[0];
      const { organizationId } = await pendingVendor(sql, staff);
      const key = randomUUID();
      const listed = await listVendor(sql, staff, { organizationId, reason }, key);
      expect(listed).toMatchObject({ organizationId, outcomeCode: "listed" });
      expect(listed.activatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/);
      await expect(orgState(sql, organizationId)).resolves.toEqual({ status: "active", activated: true });
      const [audit] = await sql<{ count: number; actor: string; reason: string; after: Record<string, string> }[]>`
        SELECT count(*) OVER ()::int AS count, actor_identity_id AS actor, reason, after_summary AS after
        FROM public.audit_events WHERE action = 'staff.vendor.list' AND entity_id = ${organizationId}`;
      expect(audit).toMatchObject({ count: 1, actor: staff.identityId, reason, after: { status: "active", type: "vendor" } });
      const [members] = await sql<{ count: number }[]>`
        SELECT count(*)::int AS count FROM public.org_members WHERE org_id = ${organizationId}::uuid`;
      expect(members!.count).toBe(0);
      await capacity(sql);

      await expect(listVendor(sql, staff, { organizationId, reason }, key))
        .resolves.toMatchObject({ outcomeCode: "replayed", organizationId, activatedAt: listed.activatedAt });
      await expect(listVendor(sql, staff, { organizationId, reason: "Changed reason" }, key))
        .rejects.toMatchObject({ code: "22023" });
      await expect(listVendor(sql, staff, { organizationId, reason })).rejects.toMatchObject({ code: "42501" });
      const [after] = await sql<{ count: number }[]>`
        SELECT count(*)::int AS count FROM public.audit_events WHERE action = 'staff.vendor.list' AND entity_id = ${organizationId}`;
      expect(after!.count).toBe(1);

      const page = await readDirectory(sql, staff);
      expect(page.callerCanList).toBe(true);
      expect(page.items.find((item) => item.organizationId === organizationId))
        .toMatchObject({ status: "active", activeMembers: 0, callerHasAccess: false });
    });
  });

  test("only a Super Admin with AAL2 can list; staff, overrides, customers, and vendor users are refused", async () => {
    await rollbackCase(context, async (sql) => {
      const { organizationId } = await pendingVendor(sql, fixture.pair[0]);
      const staffOnly = await staffMember(sql, fixture);
      const exporter = await staffMember(sql, fixture);
      await asAuthenticated(sql, fixture.pair[0], (probe) => setOverride(probe, overrideRequest(exporter.identityId)));
      await expect(allowed(sql, exporter, "audit.export", null)).resolves.toBe(true);
      const { customer } = await registerCustomer(sql);
      const { vendor } = await vendorUser(sql, fixture);
      await expect(listVendor(sql, fixture.pair[0], { organizationId, reason }, randomUUID(), "aal1"))
        .rejects.toMatchObject({ code: "42501" });
      for (const caller of [staffOnly, exporter, customer, vendor]) {
        for (const assurance of ["aal1", "aal2"] as const) {
          await expect(listVendor(sql, caller, { organizationId, reason }, randomUUID(), assurance))
            .rejects.toMatchObject({ code: "42501" });
        }
      }
      const directory = await readDirectory(sql, staffOnly);
      expect(directory.callerCanList).toBe(false);
      await expect(orgState(sql, organizationId)).resolves.toEqual({ status: "pending", activated: false });
      const [audits] = await sql<{ count: number }[]>`
        SELECT count(*)::int AS count FROM public.audit_events WHERE action = 'staff.vendor.list'`;
      expect(audits!.count).toBe(0);
    });
  });

  test("listing refuses non-pending, suspended, archived, review-flagged, and non-vendor organizations", async () => {
    await rollbackCase(context, async (sql) => {
      const staff = fixture.pair[0];
      const suspended = await listedVendor(sql, staff);
      await sql`UPDATE public.orgs SET status = 'suspended', suspended_at = clock_timestamp()
        WHERE id = ${suspended.organizationId}::uuid`;
      const archived = await pendingVendor(sql, staff);
      await sql`UPDATE public.orgs SET status = 'archived', archived_at = clock_timestamp()
        WHERE id = ${archived.organizationId}::uuid`;
      const flagged = await pendingVendor(sql, staff);
      await sql`UPDATE public.orgs SET migration_review_required = true WHERE id = ${flagged.organizationId}::uuid`;
      const [pendingCustomer] = await sql<{ id: string }[]>`
        INSERT INTO public.orgs (name, type, status, migration_review_required)
        VALUES ('Isolated pending customer', 'customer', 'pending', false) RETURNING id`;
      const [pendingInternal] = await sql<{ id: string }[]>`
        INSERT INTO public.orgs (name, type, status, migration_review_required)
        VALUES ('Isolated pending internal', 'internal', 'pending', false) RETURNING id`;
      const active = await listedVendor(sql, staff);
      for (const organizationId of [suspended.organizationId, archived.organizationId, flagged.organizationId,
        pendingCustomer!.id, pendingInternal!.id, active.organizationId, fixture.organizationId, randomUUID()]) {
        await expect(listVendor(sql, staff, { organizationId, reason })).rejects.toMatchObject({ code: "42501" });
      }
      await expect(orgState(sql, flagged.organizationId)).resolves.toEqual({ status: "pending", activated: false });
      for (const bad of [
        { organizationId: active.organizationId }, { organizationId: active.organizationId, reason: "  " },
        { organizationId: active.organizationId, reason, extra: true }, { organizationId: "not-a-uuid", reason },
      ]) {
        await expect(listVendor(sql, staff, bad)).rejects.toMatchObject({ code: "22023" });
      }
    });
  });

  test("staff open an audited workspace on an active vendor only, and repeats reuse it", async () => {
    await rollbackCase(context, async (sql) => {
      const staff = fixture.pair[0];
      const vendor = await listedVendor(sql, staff);
      await expect(allowed(sql, staff, "workspace.access", vendor.organizationId)).resolves.toBe(false);
      const key = randomUUID();
      const opened = await openWorkspace(sql, staff, { organizationId: vendor.organizationId }, key);
      expect(opened).toMatchObject({ organizationId: vendor.organizationId, outcomeCode: "opened" });
      await expect(allowed(sql, staff, "workspace.access", vendor.organizationId)).resolves.toBe(true);
      await expect(openWorkspace(sql, staff, { organizationId: vendor.organizationId }, key))
        .resolves.toMatchObject({ outcomeCode: "replayed", grantId: opened.grantId });
      await expect(openWorkspace(sql, staff, { organizationId: vendor.organizationId }))
        .resolves.toMatchObject({ outcomeCode: "existing", grantId: opened.grantId });
      const [counts] = await sql<{ members: number; grants: number; audits: number; intake: boolean }[]>`
        SELECT
          (SELECT count(*)::int FROM public.org_members WHERE org_id = ${vendor.organizationId}::uuid
            AND role_key = 'viewer') AS members,
          (SELECT count(*)::int FROM mmhr_private.staff_case_access_grants WHERE organization_id = ${vendor.organizationId}::uuid) AS grants,
          (SELECT count(*)::int FROM public.audit_events WHERE action = 'staff.vendor.workspace.open'
            AND organization_id = ${vendor.organizationId}::uuid) AS audits,
          (SELECT bool_and(intake_id IS NULL) FROM mmhr_private.staff_case_access_grants
            WHERE organization_id = ${vendor.organizationId}::uuid) AS intake`;
      expect(counts).toEqual({ members: 1, grants: 1, audits: 1, intake: true });
      await capacity(sql);
      const page = await readDirectory(sql, staff);
      expect(page.items.find((item) => item.organizationId === vendor.organizationId))
        .toMatchObject({ activeMembers: 0, callerHasAccess: true });

      const staffOnly = await staffMember(sql, fixture);
      await expect(openWorkspace(sql, staffOnly, { organizationId: vendor.organizationId }))
        .resolves.toMatchObject({ outcomeCode: "opened" });
      await expect(allowed(sql, staffOnly, "workspace.access", vendor.organizationId)).resolves.toBe(true);
      await expect(openWorkspace(sql, staff, { organizationId: vendor.organizationId }, randomUUID(), "aal1"))
        .rejects.toMatchObject({ code: "42501" });
      await capacity(sql);
    });
  });

  test("the workspace is refused on pending, suspended, archived, customer, and internal organizations", async () => {
    await rollbackCase(context, async (sql) => {
      const staff = fixture.pair[0];
      const pending = await pendingVendor(sql, staff);
      const suspended = await listedVendor(sql, staff);
      const archived = await listedVendor(sql, staff);
      await sql`UPDATE public.orgs SET status = 'suspended', suspended_at = clock_timestamp()
        WHERE id = ${suspended.organizationId}::uuid`;
      await sql`UPDATE public.orgs SET status = 'archived', archived_at = clock_timestamp()
        WHERE id = ${archived.organizationId}::uuid`;
      const { customer, organizationId: customerOrg } = await registerCustomer(sql);
      for (const organizationId of [pending.organizationId, suspended.organizationId, archived.organizationId, customerOrg]) {
        await expect(openWorkspace(sql, staff, { organizationId })).rejects.toMatchObject({ code: "42501" });
      }
      const { vendor } = await vendorUser(sql, fixture);
      const listed = await listedVendor(sql, staff);
      for (const caller of [customer, vendor]) {
        await expect(openWorkspace(sql, caller, { organizationId: listed.organizationId })).rejects.toMatchObject({ code: "42501" });
      }
      // A grant opened before suspension stops working when the vendor is suspended.
      await openWorkspace(sql, staff, { organizationId: listed.organizationId });
      await sql`UPDATE public.orgs SET status = 'suspended', suspended_at = clock_timestamp()
        WHERE id = ${listed.organizationId}::uuid`;
      await expect(allowed(sql, staff, "workspace.access", listed.organizationId)).resolves.toBe(false);
      // Last: an active internal organization without an administrator fails the capacity check.
      const [internal] = await sql<{ id: string }[]>`
        INSERT INTO public.orgs (name, type, status, activated_at, migration_review_required)
        VALUES ('Isolated internal workspace', 'internal', 'active', now(), false) RETURNING id`;
      await expect(openWorkspace(sql, staff, { organizationId: internal!.id })).rejects.toMatchObject({ code: "42501" });
      const [grants] = await sql<{ count: number }[]>`
        SELECT count(*)::int AS count FROM mmhr_private.staff_case_access_grants WHERE organization_id = ${internal!.id}::uuid`;
      expect(grants!.count).toBe(0);
    });
  });

  test("a grant on vendor A gives nothing on vendor B or a customer, and a vendor grant row never opens a customer", async () => {
    await rollbackCase(context, async (sql) => {
      const staff = await staffMember(sql, fixture);
      const vendorA = await listedVendor(sql, fixture.pair[0]);
      const vendorB = await listedVendor(sql, fixture.pair[0]);
      await openWorkspace(sql, staff, { organizationId: vendorA.organizationId });
      const { organizationId: customerOrg } = await registerCustomer(sql);
      await expect(allowed(sql, staff, "workspace.access", vendorA.organizationId)).resolves.toBe(true);
      await expect(allowed(sql, staff, "workspace.access", vendorB.organizationId)).resolves.toBe(false);
      await expect(allowed(sql, staff, "workspace.access", customerOrg)).resolves.toBe(false);

      // A vendor-kind grant row (no intake) planted on a customer organization grants nothing.
      // Internal organizations never reach the grant branch; the open command refuses them.
      const membershipId = await createMembership(sql, customerOrg, staff);
      await sql`INSERT INTO mmhr_private.staff_case_access_grants (organization_id, identity_id, membership_id,
          intake_id, state, reason, correlation_id, opened_at)
        VALUES (${customerOrg}::uuid, ${staff.identityId}::uuid, ${membershipId}::uuid, NULL, 'active',
          'Isolated planted grant', ${randomUUID()}::uuid, clock_timestamp())`;
      await expect(allowed(sql, staff, "workspace.access", customerOrg)).resolves.toBe(false);
      await expect(asAuthenticated(sql, staff, async (probe) => {
        const [row] = await probe<{ active: boolean }[]>`
          SELECT mmhr_private.r1_staff_case_access_is_active(${staff.identityId}::uuid, ${customerOrg}::uuid) AS active`;
        return row!.active;
      })).rejects.toMatchObject({ code: "42501" });
      const [direct] = await sql<{ active: boolean }[]>`
        SELECT mmhr_private.r1_staff_case_access_is_active(${staff.identityId}::uuid, ${customerOrg}::uuid) AS active`;
      expect(direct!.active).toBe(false);
    });
  });

  test("the staff grant never gives vendor portal access", async () => {
    await rollbackCase(context, async (sql) => {
      const staff = fixture.pair[0];
      const vendor = await listedVendor(sql, staff);
      await enablePortal(sql, staff, { organizationId: vendor.organizationId });
      await openWorkspace(sql, staff, { organizationId: vendor.organizationId });
      for (const assurance of ["aal1", "aal2"] as const) {
        await expect(allowed(sql, staff, "workspace.access", vendor.organizationId, assurance)).resolves.toBe(true);
        await expect(allowed(sql, staff, "portal.vendor.access", vendor.organizationId, assurance)).resolves.toBe(false);
      }
      await expect(readInbox(sql, staff, vendor.organizationId)).rejects.toMatchObject({ code: "42501" });
    });
  });

  test("staff enter a product with no vendor users and it reaches approved comparison inputs", async () => {
    await rollbackCase(context, async (sql) => {
      const entered = await staffEnteredProduct(sql, fixture.pair[0]);
      await expect(approvedInputs(sql, entered.organizationId, entered.productId)).resolves.toEqual([
        { field_key: "comparison_fact_scopes" }, { field_key: "input_payroll" },
      ]);
      const [members] = await sql<{ vendorUsers: number }[]>`
        SELECT count(*)::int AS "vendorUsers" FROM public.org_members m WHERE m.org_id = ${entered.organizationId}::uuid
          AND NOT EXISTS (SELECT 1 FROM mmhr_private.staff_case_access_grants g WHERE g.membership_id = m.id)`;
      expect(members!.vendorUsers).toBe(0);
      await capacity(sql);
    });
  });

  test("suspended, archived, and unlisted vendors stay out of comparison inputs", async () => {
    await rollbackCase(context, async (sql) => {
      const staff = fixture.pair[0];
      for (const status of ["suspended", "archived"] as const) {
        const entered = await staffEnteredProduct(sql, staff);
        await sql.unsafe(`UPDATE public.orgs SET status = '${status}', ${status}_at = clock_timestamp() WHERE id = $1::uuid`,
          [entered.organizationId]);
        await expect(approvedInputs(sql, entered.organizationId, entered.productId)).resolves.toEqual([]);
      }
      // A review-flagged vendor cannot be listed, so it stays pending and out of comparisons.
      const flagged = await pendingVendor(sql, staff);
      await sql`UPDATE public.orgs SET migration_review_required = true WHERE id = ${flagged.organizationId}::uuid`;
      await expect(listVendor(sql, staff, { organizationId: flagged.organizationId, reason })).rejects.toMatchObject({ code: "42501" });
      const [product] = await sql<{ id: string }[]>`
        INSERT INTO public.products (organization_id, vendor_profile_id, stable_key, name, status,
          created_by_identity_id, updated_by_identity_id)
        VALUES (${flagged.organizationId}::uuid, ${flagged.profileId}::uuid, 'flagged_payroll', 'Flagged payroll', 'active',
          ${staff.identityId}::uuid, ${staff.identityId}::uuid) RETURNING id`;
      await expect(approvedInputs(sql, flagged.organizationId, product!.id)).resolves.toEqual([]);
    });
  }, 120_000);

  test("the first vendor user of a listed vendor needs MFA and a staff-issued admin invitation", async () => {
    await rollbackCase(context, async (sql) => {
      const staff = fixture.pair[0];
      const vendor = await listedVendor(sql, staff);
      await openWorkspace(sql, staff, { organizationId: vendor.organizationId });

      const noFactor = await createSecurityPrincipal(sql, "pending");
      await sql`UPDATE auth.mfa_factors SET status = 'unverified' WHERE user_id = ${noFactor.subject}::uuid`;
      const refused = await inviteAdmin(sql, staff, { organizationId: vendor.organizationId, email: emailOf(noFactor) });
      await expect(accept(sql, noFactor, refused.invitationId!)).rejects.toMatchObject({ message: "Two-step sign-in required" });

      const direct = await createSecurityPrincipal(sql, "pending");
      const [planted] = await sql<{ id: string }[]>`
        INSERT INTO public.invitations (org_id, email, normalized_email, role, role_key, status, created_by_identity_id,
          expires_at, migration_review_required, created_at, updated_at)
        VALUES (${vendor.organizationId}::uuid, ${emailOf(direct)}, ${emailOf(direct)}, 'contributor', 'contributor', 'pending',
          ${staff.identityId}::uuid, clock_timestamp() + interval '1 day', false, clock_timestamp(), clock_timestamp())
        RETURNING id`;
      await expect(accept(sql, direct, planted!.id)).rejects.toMatchObject({ code: "42501" });
      await capacity(sql);

      const admin = await createSecurityPrincipal(sql, "pending");
      const invited = await inviteAdmin(sql, staff, { organizationId: vendor.organizationId, email: emailOf(admin) });
      await expect(accept(sql, admin, invited.invitationId!)).resolves.toMatchObject({ outcome: "accepted" });
      await expect(orgState(sql, vendor.organizationId)).resolves.toEqual({ status: "active", activated: true });
      await capacity(sql);
      const page = await readDirectory(sql, staff);
      expect(page.items.find((item) => item.organizationId === vendor.organizationId)).toMatchObject({ activeMembers: 1 });

      await sql`UPDATE public.org_members SET status = 'revoked', revoked_at = clock_timestamp(),
        revoked_reason = 'Isolated departure' WHERE org_id = ${vendor.organizationId}::uuid AND identity_id = ${admin.identityId}::uuid`;
      await expect(capacity(sql)).rejects.toMatchObject({ code: "42501" });
    });
  });

  test("after RFP delivery the vendor's first admin joins and sees it; staff are never recipients or responders", async () => {
    await rollbackCase(context, async (sql) => {
      const [staff, approver] = fixture.pair;
      const customer = await createSecurityPrincipal(sql);
      await addContributor(sql, fixture.organizationId, customer);
      await addPortalGrant(sql, fixture.organizationId, staff.identityId);
      await createMembership(sql, fixture.organizationId, approver);
      await sql`INSERT INTO public.user_permission_overrides(identity_id,permission_key,scope_kind,organization_id,scope_key,effect,issued_by_identity_id,issue_reason)
        VALUES(${approver.identityId}::uuid,'workspace.access','organization',${fixture.organizationId}::uuid,
        ${`organization:${fixture.organizationId}`},'allow',${staff.identityId}::uuid,'Isolated listing RFP fixture')`;
      const intakeId = await seedSubmittedIntake(sql, fixture, customer);
      const entered = await staffEnteredProduct(sql, staff);
      await enablePortal(sql, staff, { organizationId: entered.organizationId });

      // Version 2, as the staff publication page sends, reads the comparison_fact_scopes fact.
      const publication = await prepare(sql, staff, { organizationId: fixture.organizationId, intakeId, expectedRevision: 2,
        configuration: { version: 2, criteria: CONFIG.criteria } });
      await publish(sql, staff, { organizationId: fixture.organizationId, publicationId: publication.publicationId,
        expectedDigest: publication.inputDigest, approvalReference: "approval:listed-vendor", reason: "Listed vendor workflow" });
      const options = await sql<{ id: string }[]>`SELECT id FROM public.evaluation_publication_options
        WHERE organization_id = ${fixture.organizationId}::uuid AND publication_id = ${String(publication.publicationId)}::uuid
          AND product_id = ${entered.productId}::uuid`;
      expect(options).toHaveLength(1);
      await invoke(sql, customer, "mmhr_select_initial_evaluation_options", { organizationId: fixture.organizationId, intakeId,
        publicationId: publication.publicationId, expectedDigest: publication.inputDigest, optionIds: [options[0]!.id] }, "aal1");
      const review = await read(sql, staff, "mmhr_get_evaluation_disclosure_review", { organizationId: fixture.organizationId, intakeId, pageSize: 25 });
      for (const item of review.items as { candidateId: string; reviewDigest: string }[]) {
        await invoke(sql, staff, "mmhr_record_evaluation_disclosure", { organizationId: fixture.organizationId, intakeId,
          candidateId: item.candidateId, expectedReviewDigest: item.reviewDigest, discussionAt: new Date(Date.now() - 60_000).toISOString(),
          discussionReference: "Isolated customer discussion", conflictDisclosure: "Isolated commission disclosure", reason: "Listed vendor workflow" });
      }
      const rfpId = randomUUID();
      await invoke(sql, staff, "mmhr_create_rfp_questionnaire", { organizationId: fixture.organizationId, intakeId, rfpId, sourceRevision: 2,
        title: "Listed vendor request", content: "Describe payroll support." });
      await invoke(sql, approver, "mmhr_approve_rfp_version", { organizationId: fixture.organizationId, rfpId, version: 1,
        actorIdentityId: approver.identityId, approvalReference: "approval:listed-vendor-rfp" });
      const workflow = await read(sql, staff, "mmhr_get_rfp_workflow", { organizationId: fixture.organizationId, intakeId });
      await invoke(sql, staff, "mmhr_deliver_rfp_to_portals", { organizationId: fixture.organizationId, rfpId, version: 1,
        deadlineAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        expectedDigest: (workflow.rfps as { deliveryDigest: string }[])[0]!.deliveryDigest });
      const [recipient] = await sql<{ id: string }[]>`SELECT rr.id FROM public.rfp_recipients rr
        JOIN public.rfp_versions r ON r.id = rr.rfp_version_id
        WHERE r.rfp_id = ${rfpId}::uuid AND rr.vendor_organization_id = ${entered.organizationId}::uuid`;
      expect(recipient).toBeDefined();

      const scope = { organizationId: fixture.organizationId, rfpId, version: 1 };
      const recipients = () => read(sql, staff, "mmhr_get_rfp_notification_recipients", scope)
        .then((page) => (page.items as { recipientIdentityId: string }[]).map((item) => item.recipientIdentityId));
      await expect(recipients()).resolves.toEqual([]);
      await expect(readInbox(sql, staff, entered.organizationId)).rejects.toMatchObject({ code: "42501" });
      const response = { supportedRequirements: ["Payroll exports are supported."], unsupportedRequirements: [],
        caveats: [], dependencies: [], commitments: [], implementationDetails: [], missingAnswers: [], proposedFollowUps: [] };
      for (const assurance of ["aal1", "aal2"] as const) {
        await expect(invoke(sql, staff, "mmhr_submit_portal_response", { organizationId: entered.organizationId,
          recipientId: recipient!.id, expectedRevision: 0, response }, assurance)).rejects.toMatchObject({ code: "42501" });
      }

      const admin = await createSecurityPrincipal(sql, "pending");
      const invited = await inviteAdmin(sql, staff, { organizationId: entered.organizationId, email: emailOf(admin) });
      await accept(sql, admin, invited.invitationId!);
      await expect(readInbox(sql, admin, entered.organizationId)).resolves.toMatchObject({ items: [expect.anything()] });
      await expect(recipients()).resolves.toEqual([admin.identityId]);
      await expect(readInbox(sql, staff, entered.organizationId)).rejects.toMatchObject({ code: "42501" });
      await capacity(sql);

      // A workspace.access override on the same vendor does not make the grant-bound staff member the vendor.
      await sql`INSERT INTO public.user_permission_overrides(identity_id,permission_key,scope_kind,organization_id,scope_key,effect,issued_by_identity_id,issue_reason)
        VALUES(${staff.identityId}::uuid,'workspace.access','organization',${entered.organizationId}::uuid,
        ${`organization:${entered.organizationId}`},'allow',${approver.identityId}::uuid,'Isolated vendor override')`;
      await capacity(sql);
      await expect(allowed(sql, staff, "workspace.access", entered.organizationId)).resolves.toBe(true);
      for (const assurance of ["aal1", "aal2"] as const) {
        await expect(allowed(sql, staff, "portal.vendor.access", entered.organizationId, assurance)).resolves.toBe(false);
      }
      await expect(readInbox(sql, staff, entered.organizationId)).rejects.toMatchObject({ code: "42501" });
      await expect(recipients()).resolves.toEqual([admin.identityId]);
      await expect(invoke(sql, staff, "mmhr_submit_portal_response", { organizationId: entered.organizationId,
        recipientId: recipient!.id, expectedRevision: 0, response }, "aal1")).rejects.toMatchObject({ code: "42501" });
    });
  }, 120_000);
});
