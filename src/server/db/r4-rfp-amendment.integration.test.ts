import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { applyAllMigrations, startRehearsal, stopRehearsal, type RehearsalContext } from "./r1-migration-rehearsal";
import { asAuthenticated, createCommandFixture, createMembership, rollbackCase,
  type SecurityCommandFixture, type SecurityTransaction, type SecurityPrincipal } from "./r1-security-command-fixtures";

describe("R4 RFP amendment RPC", () => {
  let context: RehearsalContext | undefined;
  let fixture: SecurityCommandFixture;
  beforeAll(async () => {
    context = await startRehearsal("r4-rfp-amendment");
    await applyAllMigrations(context);
    fixture = await context.client.begin(async (sql) => {
      const f = await createCommandFixture(sql);
      await createMembership(sql, f.organizationId, f.pair[1]);
      await sql`INSERT INTO public.user_permission_overrides
        (identity_id,permission_key,scope_kind,organization_id,scope_key,effect,issued_by_identity_id,issue_reason)
        VALUES (${f.pair[1].identityId}::uuid,'workspace.access','organization',${f.organizationId}::uuid,
          ${"organization:" + f.organizationId},'allow',${f.pair[0].identityId}::uuid,'Isolated amendment reviewer')`;
      return f;
    });
  }, 240_000);
  afterAll(async () => { if (context) await stopRehearsal(context); }, 180_000);

  async function seed(sql: SecurityTransaction, legacy = false) {
    const rfpId = randomUUID(), intakeId = randomUUID(), vendorProfileId = randomUUID();
    await sql`INSERT INTO public.intakes
      (id,organization_id,status,revision,submitted_at,created_by_identity_id,updated_by_identity_id)
      VALUES (${intakeId}::uuid,${fixture.organizationId}::uuid,'submitted',1,clock_timestamp(),
        ${fixture.pair[0].identityId}::uuid,${fixture.pair[0].identityId}::uuid)`;
    await sql`INSERT INTO public.rfp_versions
      (id,organization_id,rfp_id,source_intake_id,version,status,title,sections,created_by_identity_id)
      VALUES (${rfpId}::uuid,${fixture.organizationId}::uuid,${rfpId}::uuid,${intakeId}::uuid,
        1,'draft','RFP','[{"sectionKey":"fit","title":"Fit","questionCount":2}]'::jsonb,${fixture.pair[0].identityId}::uuid)`;
    if (legacy) {
      await sql`UPDATE public.rfp_versions SET status='approved',
        approved_by_identity_id=${fixture.organizationAdmin.identityId}::uuid,
        approved_at=clock_timestamp(),approval_reference='approval:legacy' WHERE id=${rfpId}::uuid`;
    } else {
      await asAuthenticated(sql, fixture.pair[1], async (probe) => {
        await probe`SELECT public.mmhr_approve_rfp_version(${JSON.stringify({
          rfpId, organizationId: fixture.organizationId, actorIdentityId: fixture.pair[1].identityId,
          version: 1, approvalReference: "approval:base",
        })}::jsonb,${randomUUID()}::uuid,${randomUUID()}::uuid)`;
      });
    }
    await sql`INSERT INTO public.vendor_profiles
      (id,organization_id,status,created_by_identity_id,updated_by_identity_id)
      VALUES (${vendorProfileId}::uuid,${fixture.organizationId}::uuid,'active',
        ${fixture.pair[0].identityId}::uuid,${fixture.pair[0].identityId}::uuid)`;
    return { amendmentId: randomUUID(), rfpId, organizationId: fixture.organizationId,
      vendorProfileId, baseVersion: 1, version: 1 };
  }

  async function invoke(sql: SecurityTransaction, payload: Record<string, unknown>,
    principal: SecurityPrincipal = fixture.pair[0], assurance: "aal1" | "aal2" = "aal2") {
    return asAuthenticated(sql, principal, async (probe) => {
      const [row] = await probe<{ result: Record<string, unknown> }[]>`
        SELECT public.mmhr_record_rfp_amendment(${JSON.stringify(payload)}::jsonb,
          ${String(payload.correlationId)}::uuid,${String(payload.idempotencyKey)}::uuid) AS result`;
      return row!.result;
    }, assurance);
  }

  async function draft(sql: SecurityTransaction, legacy = false) {
    const base = await seed(sql, legacy);
    const payload = { ...base, action: "create", actorIdentityId: fixture.pair[0].identityId,
      title: "Vendor terms", items: [{ amendmentKey: "pricing", sectionKey: "commercial",
        title: "Pricing", text: "Vendor-specific pricing terms." }],
      correlationId: randomUUID(), idempotencyKey: randomUUID() };
    await expect(invoke(sql, payload)).resolves.toMatchObject({ outcomeCode: "created" });
    await expect(invoke(sql, payload)).resolves.toMatchObject({ outcomeCode: "replayed" });
    return base;
  }

  function approval(base: Awaited<ReturnType<typeof seed>>, principal = fixture.pair[1]) {
    return { ...base, action: "approve", actorIdentityId: principal.identityId,
      approvalReference: "approval:amendment", correlationId: randomUUID(), idempotencyKey: randomUUID() };
  }

  test("records and approves an additive amendment with replay", async () => {
    await rollbackCase(context!, async (sql) => {
      const base = await draft(sql);
      const payload = approval(base);
      await expect(invoke(sql, payload, fixture.pair[1])).resolves.toMatchObject({
        amendmentId: base.amendmentId, status: "approved", outcomeCode: "approved" });
      await expect(invoke(sql, payload, fixture.pair[1])).resolves.toMatchObject({ outcomeCode: "replayed" });
    });
  }, 120_000);

  test.each(["organizationAdmin", "target"] as const)("denies external %s approval", async (key) => {
    await rollbackCase(context!, async (sql) => {
      const base = await draft(sql);
      await expect(invoke(sql, approval(base, fixture[key]), fixture[key])).rejects.toMatchObject({ code: "42501" });
    });
  }, 120_000);

  test("preserves legacy approval history but denies its receipt after the command upgrade", async () => {
    const original = await readFile("drizzle/0086_r4_rfp_amendments.sql", "utf8");
    const marker = "CREATE OR REPLACE FUNCTION public.mmhr_record_rfp_amendment";
    expect(original.indexOf(marker)).toBeGreaterThan(0);
    const correction = await readFile("drizzle/0095_r4-amendment-authorization.sql", "utf8");
    await rollbackCase(context!, async (sql) => {
      // Function replacement stays inside the isolated rollback transaction.
      await sql.unsafe(original.slice(original.indexOf(marker)));
      const base = await draft(sql);
      const payload = approval(base);
      await expect(invoke(sql, payload, fixture.pair[1])).resolves.toMatchObject({ outcomeCode: "approved" });
      const before = await sql`SELECT * FROM public.rfp_amendments WHERE id=${base.amendmentId}::uuid`;
      const eventsBefore = await sql`SELECT * FROM public.audit_events
        WHERE entity_type='rfp_amendment' AND entity_id=${base.amendmentId} ORDER BY id`;
      await sql.unsafe(correction);
      await expect(invoke(sql, payload, fixture.pair[1])).rejects.toMatchObject({
        code: "42501", message: "Legacy amendment requires a new approved version",
      });
      const after = await sql`SELECT * FROM public.rfp_amendments WHERE id=${base.amendmentId}::uuid`;
      const eventsAfter = await sql`SELECT * FROM public.audit_events
        WHERE entity_type='rfp_amendment' AND entity_id=${base.amendmentId} ORDER BY id`;
      expect(after).toEqual(before);
      expect(eventsAfter).toEqual(eventsBefore);
      expect(eventsAfter.some((event) => event.action === "rfp.amendment.approve")).toBe(true);
    });
  }, 120_000);

  test("denies self-approval", async () => {
    await rollbackCase(context!, async (sql) => {
      const base = await draft(sql);
      await expect(invoke(sql, approval(base, fixture.pair[0]))).rejects.toMatchObject({ code: "42501" });
    });
  }, 120_000);

  test.each([null, undefined, "publish"])("rejects invalid action %s before authorization routing", async (action) => {
    await rollbackCase(context!, async (sql) => {
      const base = await draft(sql);
      await expect(invoke(sql, { ...approval(base), action }, fixture.pair[1]))
        .rejects.toMatchObject({ code: "22023" });
      const [row] = await sql`SELECT status FROM public.rfp_amendments WHERE id=${base.amendmentId}::uuid`;
      expect(row!.status).toBe("draft");
    });
  }, 120_000);

  test("denies approval without MFA", async () => {
    await rollbackCase(context!, async (sql) => {
      await expect(invoke(sql, approval(await draft(sql)), fixture.pair[1], "aal1"))
        .rejects.toMatchObject({ code: "42501" });
    });
  }, 120_000);

  test("denies approval against a legacy base without MMHR evidence", async () => {
    await rollbackCase(context!, async (sql) => {
      await expect(invoke(sql, approval(await draft(sql, true)), fixture.pair[1]))
        .rejects.toMatchObject({ code: "42501" });
    });
  }, 120_000);
});
