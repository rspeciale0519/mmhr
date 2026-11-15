import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { applyAllMigrations, type RehearsalContext, startRehearsal, stopRehearsal } from "./r1-migration-rehearsal";
import {
  asAuthenticated, createCommandFixture, createMembership, createSecurityPrincipal, rollbackCase,
  type SecurityCommandFixture, type SecurityPrincipal, type SecurityTransaction,
} from "./r1-security-command-fixtures";

type QueueItem = { intakeId: string; organizationId: string; callerHasAccess: boolean; staffWithAccess: number };
type Queue = { items: QueueItem[]; nextCursor: unknown };

async function registerCustomer(sql: SecurityTransaction) {
  const customer = await createSecurityPrincipal(sql);
  const [row] = await asAuthenticated(sql, customer, (probe) => probe<{ result: { organizationId: string } }[]>`
    SELECT public.mmhr_start_customer_workspace(${randomUUID()}::uuid) AS result
  `, "aal1");
  return { customer, organizationId: row!.result.organizationId };
}

async function submittedIntake(sql: SecurityTransaction, organizationId: string, owner: SecurityPrincipal, minutesAgo: number) {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO public.intakes (organization_id, status, submitted_at, created_by_identity_id, updated_by_identity_id)
    VALUES (${organizationId}::uuid, 'submitted', clock_timestamp() - make_interval(mins => ${minutesAgo}),
      ${owner.identityId}::uuid, ${owner.identityId}::uuid)
    RETURNING id
  `;
  return row!.id;
}

async function vendorUser(sql: SecurityTransaction, fixture: SecurityCommandFixture) {
  const vendor = await createSecurityPrincipal(sql);
  const [org] = await sql<{ id: string }[]>`
    INSERT INTO public.orgs (name, type, status, activated_at, migration_review_required)
    VALUES ('Isolated vendor fixture', 'vendor', 'active', now(), false) RETURNING id
  `;
  await createMembership(sql, org!.id, fixture.organizationAdmin, "organization_admin");
  await createMembership(sql, org!.id, vendor);
  await sql`INSERT INTO public.portal_access_grants (organization_id, portal, issued_by_identity_id, issue_reason)
    VALUES (${org!.id}::uuid, 'vendor', ${fixture.pair[0].identityId}::uuid, 'Isolated vendor portal fixture')`;
  return vendor;
}

function readQueue(sql: SecurityTransaction, principal: SecurityPrincipal, assurance: "aal1" | "aal2" = "aal2") {
  return asAuthenticated(sql, principal, async (probe) => {
    const [row] = await probe<{ page: Queue }[]>`
      SELECT public.mmhr_get_staff_submission_queue(${JSON.stringify({ limit: 50 })}::text::jsonb) AS page`;
    return row!.page;
  }, assurance);
}

function openCase(sql: SecurityTransaction, principal: SecurityPrincipal, intakeId: string,
  idempotencyKey = randomUUID(), assurance: "aal1" | "aal2" = "aal2") {
  return asAuthenticated(sql, principal, async (probe) => {
    const [row] = await probe<{ result: Record<string, unknown> }[]>`
      SELECT public.mmhr_open_staff_case(${JSON.stringify({ intakeId })}::text::jsonb, ${randomUUID()}::uuid,
        ${idempotencyKey}::uuid) AS result`;
    return row!.result;
  }, assurance);
}

function readIntake(sql: SecurityTransaction, principal: SecurityPrincipal, organizationId: string, intakeId: string,
  assurance: "aal1" | "aal2" = "aal2") {
  return asAuthenticated(sql, principal, (probe) => probe`
    SELECT public.mmhr_get_intake(${organizationId}::uuid, ${intakeId}::uuid) AS intake`, assurance);
}

describe("staff submission queue and open case", () => {
  let context: RehearsalContext;
  let fixture: SecurityCommandFixture;

  beforeAll(async () => {
    context = await startRehearsal("staff-queue");
    await applyAllMigrations(context);
    fixture = await context.client.begin(createCommandFixture);
  }, 240_000);

  afterAll(async () => {
    if (context) await stopRehearsal(context);
  }, 180_000);

  test("staff see submissions from two customer organizations, newest first", async () => {
    await rollbackCase(context, async (sql) => {
      const first = await registerCustomer(sql), second = await registerCustomer(sql);
      const older = await submittedIntake(sql, first.organizationId, first.customer, 20);
      const newer = await submittedIntake(sql, second.organizationId, second.customer, 5);
      await sql`INSERT INTO public.intakes (organization_id, status, created_by_identity_id, updated_by_identity_id)
        VALUES (${first.organizationId}::uuid, 'draft', ${first.customer.identityId}::uuid, ${first.customer.identityId}::uuid)`;
      const page = await readQueue(sql, fixture.pair[0]);
      const ids = page.items.map((item) => item.intakeId);
      expect(ids).toEqual(expect.arrayContaining([older, newer]));
      expect(ids.indexOf(newer)).toBeLessThan(ids.indexOf(older));
      expect(page.items.find((item) => item.intakeId === older)).toMatchObject({
        organizationId: first.organizationId, callerHasAccess: false, staffWithAccess: 0,
      });
      expect(page.items.every((item) => Object.keys(item).sort().join() ===
        "callerHasAccess,intakeId,organizationId,organizationName,staffWithAccess,status,submittedAt")).toBe(true);
    });
  });

  test("open case grants access, writes an audit record, and enables the review read", async () => {
    await rollbackCase(context, async (sql) => {
      const { customer, organizationId } = await registerCustomer(sql);
      const intakeId = await submittedIntake(sql, organizationId, customer, 1);
      await expect(readIntake(sql, fixture.pair[0], organizationId, intakeId)).rejects.toMatchObject({ code: "42501" });
      const result = await openCase(sql, fixture.pair[0], intakeId);
      expect(result).toMatchObject({ intakeId, organizationId, outcomeCode: "opened" });
      const [audit] = await sql<{ actor: string; org: string; reason: string; occurred: Date }[]>`
        SELECT actor_identity_id AS actor, organization_id AS org, reason, occurred_at AS occurred
        FROM public.audit_events WHERE action = 'staff.case.open' AND entity_id = ${String(result.grantId)}`;
      expect(audit).toMatchObject({ actor: fixture.pair[0].identityId, org: organizationId });
      expect(audit!.reason.length).toBeGreaterThan(0);
      expect(audit!.occurred).toBeInstanceOf(Date);
      await expect(readIntake(sql, fixture.pair[0], organizationId, intakeId)).resolves.toHaveLength(1);
      const page = await readQueue(sql, fixture.pair[0]);
      expect(page.items.find((item) => item.intakeId === intakeId)).toMatchObject({ callerHasAccess: true, staffWithAccess: 1 });
      await sql`SELECT mmhr_private.r1_assert_administration_capacity(clock_timestamp())`;
    });
  });

  test("repeating open case creates no duplicate access or audit record", async () => {
    await rollbackCase(context, async (sql) => {
      const { customer, organizationId } = await registerCustomer(sql);
      const intakeId = await submittedIntake(sql, organizationId, customer, 1);
      const key = randomUUID();
      const first = await openCase(sql, fixture.pair[0], intakeId, key);
      await expect(openCase(sql, fixture.pair[0], intakeId, key)).resolves.toMatchObject({ outcomeCode: "replayed", grantId: first.grantId });
      await expect(openCase(sql, fixture.pair[0], intakeId)).resolves.toMatchObject({ outcomeCode: "existing", grantId: first.grantId });
      const [counts] = await sql<{ members: number; grants: number; audits: number }[]>`
        SELECT
          (SELECT count(*)::int FROM public.org_members WHERE org_id = ${organizationId}::uuid
            AND identity_id = ${fixture.pair[0].identityId}::uuid) AS members,
          (SELECT count(*)::int FROM mmhr_private.staff_case_access_grants WHERE organization_id = ${organizationId}::uuid) AS grants,
          (SELECT count(*)::int FROM public.audit_events WHERE action = 'staff.case.open'
            AND organization_id = ${organizationId}::uuid) AS audits`;
      expect(counts).toEqual({ members: 1, grants: 1, audits: 1 });
    });
  });

  test("a revoked case grant is not reissued and stops access", async () => {
    await rollbackCase(context, async (sql) => {
      const { customer, organizationId } = await registerCustomer(sql);
      const intakeId = await submittedIntake(sql, organizationId, customer, 1);
      await openCase(sql, fixture.pair[0], intakeId);
      await sql`UPDATE mmhr_private.staff_case_access_grants SET state = 'revoked', revoked_at = clock_timestamp(),
        revoked_reason = 'Isolated revocation' WHERE organization_id = ${organizationId}::uuid`;
      await expect(readIntake(sql, fixture.pair[0], organizationId, intakeId)).rejects.toMatchObject({ code: "42501" });
      await expect(openCase(sql, fixture.pair[0], intakeId)).rejects.toMatchObject({ code: "42501" });
      await sql`SELECT mmhr_private.r1_assert_administration_capacity(clock_timestamp())`;
    });
  });

  test("customer users cannot call the list or the action", async () => {
    await rollbackCase(context, async (sql) => {
      const { customer, organizationId } = await registerCustomer(sql);
      const intakeId = await submittedIntake(sql, organizationId, customer, 1);
      for (const assurance of ["aal1", "aal2"] as const) {
        await expect(readQueue(sql, customer, assurance)).rejects.toMatchObject({ code: "42501" });
        await expect(openCase(sql, customer, intakeId, randomUUID(), assurance)).rejects.toMatchObject({ code: "42501" });
      }
    });
  });

  test("vendor users cannot call the list or the action", async () => {
    await rollbackCase(context, async (sql) => {
      const { customer, organizationId } = await registerCustomer(sql);
      const intakeId = await submittedIntake(sql, organizationId, customer, 1);
      const vendor = await vendorUser(sql, fixture);
      for (const assurance of ["aal1", "aal2"] as const) {
        await expect(readQueue(sql, vendor, assurance)).rejects.toMatchObject({ code: "42501" });
        await expect(openCase(sql, vendor, intakeId, randomUUID(), assurance)).rejects.toMatchObject({ code: "42501" });
      }
      const [grants] = await sql<{ count: number }[]>`
        SELECT count(*)::int AS count FROM mmhr_private.staff_case_access_grants WHERE identity_id = ${vendor.identityId}::uuid`;
      expect(grants!.count).toBe(0);
    });
  });

  test("staff need AAL2 for both RPCs", async () => {
    await rollbackCase(context, async (sql) => {
      const { customer, organizationId } = await registerCustomer(sql);
      const intakeId = await submittedIntake(sql, organizationId, customer, 1);
      await expect(readQueue(sql, fixture.pair[0], "aal1")).rejects.toMatchObject({ code: "42501" });
      await expect(openCase(sql, fixture.pair[0], intakeId, randomUUID(), "aal1")).rejects.toMatchObject({ code: "42501" });
    });
  });

  test("a customer still cannot read another customer's intake after a staff case opens", async () => {
    await rollbackCase(context, async (sql) => {
      const first = await registerCustomer(sql), second = await registerCustomer(sql);
      const secondIntake = await submittedIntake(sql, second.organizationId, second.customer, 1);
      await openCase(sql, fixture.pair[0], secondIntake);
      await expect(readIntake(sql, first.customer, second.organizationId, secondIntake, "aal1"))
        .rejects.toMatchObject({ code: "42501" });
      await expect(readIntake(sql, second.customer, second.organizationId, secondIntake, "aal1")).resolves.toHaveLength(1);
    });
  });
});
