import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, test } from "vitest";

import {
  applyAllMigrations,
  type RehearsalContext,
  startRehearsal,
  stopRehearsal,
} from "./r1-migration-rehearsal";
import {
  asAuthenticated,
  changeMembershipStatus,
  commandInput,
  createCommandFixture,
  createSecurityPrincipal,
  rollbackCase,
  type SecurityCommandFixture,
  type SecurityPrincipal,
  type SecurityTransaction,
} from "./r1-security-command-fixtures";
import { asRuntimeRole } from "./r1-identity-intent-fixtures";

type IntakeSummary = {
  intake_id: string;
  organization_id: string;
  status: string;
  revision: number;
  created_at: string;
  updated_at: string;
};

type IntakeDetail = {
  intakeId: string;
  organizationId: string;
  status: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
  data: Record<string, unknown>;
};

async function seedIntake(
  sql: SecurityTransaction,
  organizationId: string,
  identityId: string,
  status: "draft" | "in_progress" | "submitted" = "draft",
  data: Record<string, unknown> = {},
) {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO public.intakes (
      organization_id, status, company_context, current_systems, compliance_needs,
      budget, timeline, stakeholders, decision_process, submitted_at,
      created_by_identity_id, updated_by_identity_id
    ) VALUES (
      ${organizationId}::uuid, ${status},
      ${data.companyContext ? JSON.stringify(data.companyContext) : null}::jsonb,
      ${data.currentSystems ? JSON.stringify(data.currentSystems) : null}::jsonb,
      ${data.complianceNeeds ? JSON.stringify(data.complianceNeeds) : null}::jsonb,
      ${data.budget ? JSON.stringify(data.budget) : null}::jsonb,
      ${data.timeline ? JSON.stringify(data.timeline) : null}::jsonb,
      ${data.stakeholders ? JSON.stringify(data.stakeholders) : null}::jsonb,
      ${data.decisionProcess ? JSON.stringify(data.decisionProcess) : null}::jsonb,
      CASE WHEN ${status} = 'submitted' THEN now() ELSE NULL END,
      ${identityId}::uuid, ${identityId}::uuid
    )
    RETURNING id
  `;
  return row!.id;
}

async function readPage(
  sql: SecurityTransaction,
  principal: SecurityPrincipal,
  organizationId: string | null = null,
  afterId: string | null = null,
  pageSize: number | null = 25,
  assurance: "aal1" | "aal2" = "aal1",
) {
  return asAuthenticated(sql, principal, (probe) => probe<IntakeSummary[]>`
    SELECT * FROM public.mmhr_get_intakes_page(
      ${organizationId}::uuid,
      ${afterId}::uuid,
      ${pageSize}
    )
  `, assurance);
}

async function readDetail(
  sql: SecurityTransaction,
  principal: SecurityPrincipal,
  organizationId: string | null,
  intakeId: string | null,
  assurance: "aal1" | "aal2" = "aal1",
) {
  return asAuthenticated(sql, principal, async (probe) => {
    const [row] = await probe<{ result: IntakeDetail }[]>`
      SELECT public.mmhr_get_intake(
        ${organizationId}::uuid,
        ${intakeId}::uuid
      ) AS result
    `;
    return row!.result;
  }, assurance);
}

async function readDefaultPage(
  sql: SecurityTransaction,
  principal: SecurityPrincipal,
  organizationId: string,
) {
  return asAuthenticated(sql, principal, (probe) => probe<IntakeSummary[]>`
    SELECT * FROM public.mmhr_get_intakes_page(${organizationId}::uuid)
  `);
}

describe("R3 intake read RPCs", () => {
  let context: RehearsalContext;
  let fixture: SecurityCommandFixture;

  beforeAll(async () => {
    context = await startRehearsal("r3-intake-read");
    await applyAllMigrations(context);
    fixture = await context.client.begin(createCommandFixture);
  }, 240_000);

  afterAll(async () => {
    if (context) await stopRehearsal(context);
  }, 180_000);

  test("returns only scoped summary fields for AAL1 and AAL2 reads", async () => {
    await rollbackCase(context, async (sql) => {
      const firstId = await seedIntake(sql, fixture.organizationId, fixture.pair[0].identityId, "draft", {
        companyContext: { sector: "services" },
      });
      const secondId = await seedIntake(sql, fixture.organizationId, fixture.pair[0].identityId, "in_progress", {
        timeline: { months: 6 },
      });
      const [before] = await sql<{ history: number; audits: number }[]>`
        SELECT
          (SELECT count(*)::integer FROM public.intake_history) AS history,
          (SELECT count(*)::integer FROM public.audit_events) AS audits
      `;
      const aal1 = await readPage(sql, fixture.pair[0], fixture.organizationId, null, 25, "aal1");
      const aal2 = await readPage(sql, fixture.pair[0], fixture.organizationId, null, 25, "aal2");
      expect(aal1.map((row) => row.intake_id)).toEqual(aal2.map((row) => row.intake_id));
      expect(aal1.map((row) => row.intake_id)).toEqual([firstId, secondId].sort());
      expect(Object.keys(aal1[0]!).sort()).toEqual([
        "created_at", "intake_id", "organization_id", "revision", "status", "updated_at",
      ]);
      expect(aal1.every((row) => row.organization_id === fixture.organizationId)).toBe(true);
      const [after] = await sql<{ history: number; audits: number }[]>`
        SELECT
          (SELECT count(*)::integer FROM public.intake_history) AS history,
          (SELECT count(*)::integer FROM public.audit_events) AS audits
      `;
      expect(after).toEqual(before);
    });
  });

  test("returns the allowed detail shape and intake data without internal actor fields", async () => {
    await rollbackCase(context, async (sql) => {
      const intakeId = await seedIntake(sql, fixture.organizationId, fixture.pair[0].identityId, "in_progress", {
        companyContext: { sector: "services" },
        currentSystems: ["spreadsheet"],
        complianceNeeds: ["retention"],
        budget: { range: "mid" },
        timeline: { months: 6 },
        stakeholders: ["owner"],
        decisionProcess: { approver: "owner" },
      });
      const detail = await readDetail(sql, fixture.pair[0], fixture.organizationId, intakeId, "aal1");
      expect(Object.keys(detail).sort()).toEqual([
        "createdAt", "data", "intakeId", "organizationId", "revision", "status", "submittedAt", "updatedAt",
      ]);
      expect(detail).toMatchObject({
        intakeId,
        organizationId: fixture.organizationId,
        status: "in_progress",
        revision: 1,
        submittedAt: null,
      });
      expect(detail.data).toEqual({
        companyContext: { sector: "services" },
        currentSystems: ["spreadsheet"],
        complianceNeeds: ["retention"],
        budget: { range: "mid" },
        timeline: { months: 6 },
        stakeholders: ["owner"],
        decisionProcess: { approver: "owner" },
      });
      expect(detail).not.toHaveProperty("createdByIdentityId");
      expect(detail).not.toHaveProperty("updatedByIdentityId");
      expect(detail).not.toHaveProperty("correlationId");
    });
  });

  test("uses sorted cursor pagination with one look-ahead row", async () => {
    await rollbackCase(context, async (sql) => {
      const ids = await Promise.all(Array.from({ length: 4 }, () =>
        seedIntake(sql, fixture.organizationId, fixture.pair[0].identityId)));
      const sortedIds = [...ids].sort();
      const first = await readPage(sql, fixture.pair[0], fixture.organizationId, null, 2);
      expect(first.map((row) => row.intake_id)).toEqual(sortedIds.slice(0, 3));
      const second = await readPage(sql, fixture.pair[0], fixture.organizationId, sortedIds[1]!, 2);
      expect(second.map((row) => row.intake_id)).toEqual(sortedIds.slice(2));
      expect(await readPage(sql, fixture.pair[0], fixture.organizationId, sortedIds[3]!, 2)).toEqual([]);
    });
  });

  test("enforces the default and maximum page size and rejects invalid bounds", async () => {
    await rollbackCase(context, async (sql) => {
      await sql`
        INSERT INTO public.intakes (organization_id, created_by_identity_id, updated_by_identity_id)
        SELECT ${fixture.organizationId}::uuid, ${fixture.pair[0].identityId}::uuid, ${fixture.pair[0].identityId}::uuid
        FROM generate_series(1, 51)
      `;
      expect(await readDefaultPage(sql, fixture.pair[0], fixture.organizationId)).toHaveLength(26);
      expect(await readPage(sql, fixture.pair[0], fixture.organizationId, null, 50)).toHaveLength(51);
      for (const size of [0, -1, 51, null]) {
        await expect(readPage(sql, fixture.pair[0], fixture.organizationId, null, size)).rejects.toMatchObject({ code: "22023" });
      }
    });
  });

  test("denies unauthorized, cross-organization, missing, and same-organization wrong-intake reads", async () => {
    await rollbackCase(context, async (sql) => {
      const ownIntakeId = await seedIntake(sql, fixture.organizationId, fixture.pair[0].identityId);
      const unauthorized = await createSecurityPrincipal(sql);
      const [otherOrganization] = await sql<{ id: string }[]>`
        INSERT INTO public.orgs (name, type, status, activated_at, migration_review_required)
        VALUES ('R3 other customer', 'customer', 'active', now(), false) RETURNING id
      `;
      const otherIntakeId = await seedIntake(sql, otherOrganization!.id, fixture.pair[0].identityId);
      await expect(readPage(sql, unauthorized, fixture.organizationId)).rejects.toMatchObject({ code: "42501" });
      await expect(readPage(sql, fixture.pair[0], otherOrganization!.id)).rejects.toMatchObject({ code: "42501" });
      await expect(readDetail(sql, fixture.pair[0], fixture.organizationId, randomUUID())).rejects.toMatchObject({ code: "42501" });
      await expect(readDetail(sql, fixture.pair[0], fixture.organizationId, otherIntakeId)).rejects.toMatchObject({ code: "42501" });
      await expect(readDetail(sql, fixture.pair[0], fixture.organizationId, ownIntakeId, "aal2")).resolves.toMatchObject({ intakeId: ownIntakeId });
    });
  });

  test("denies reads after the organization membership is revoked", async () => {
    await rollbackCase(context, async (sql) => {
      await seedIntake(sql, fixture.organizationId, fixture.pair[0].identityId);
      await asAuthenticated(sql, fixture.organizationAdmin, (probe) => changeMembershipStatus(
        probe,
        fixture.organizationId,
        fixture.actorMembershipId,
        "revoked",
        commandInput(),
      ));
      await expect(readPage(sql, fixture.pair[0], fixture.organizationId)).rejects.toMatchObject({ code: "42501" });
    });
  });

  test("rejects nested null legacy data and preserves stored whitespace", async () => {
    await rollbackCase(context, async (sql) => {
      const nullDataId = await seedIntake(sql, fixture.organizationId, fixture.pair[0].identityId, "draft", {
        companyContext: { sector: null },
      });
      await expect(readDetail(sql, fixture.pair[0], fixture.organizationId, nullDataId)).rejects.toMatchObject({ code: "22023" });
      const whitespaceId = await seedIntake(sql, fixture.organizationId, fixture.pair[0].identityId, "draft", {
        companyContext: { sector: "  services  " },
      });
      const detail = await readDetail(sql, fixture.pair[0], fixture.organizationId, whitespaceId);
      expect(detail.data).toEqual({ companyContext: { sector: "  services  " } });
    });
  });

  test("loads a valid near-limit legacy map without changing its values", async () => {
    await rollbackCase(context, async (sql) => {
      const companyContext = Object.fromEntries(
        Array.from({ length: 50 }, (_, index) => [
          `f${index.toString().padStart(2, "0")}`,
          `${index.toString().padStart(2, "0")}:${"x".repeat(1_898)}`,
        ]),
      );
      const serialized = JSON.stringify(companyContext);
      expect(Buffer.byteLength(serialized, "utf8")).toBeGreaterThan(90_000);
      const intakeId = await seedIntake(sql, fixture.organizationId, fixture.pair[0].identityId, "draft", {
        companyContext,
      });
      const [stored] = await sql<{ bytes: number }[]>`
        SELECT pg_column_size(jsonb_strip_nulls(jsonb_build_object(
          'companyContext', company_context, 'currentSystems', current_systems,
          'complianceNeeds', compliance_needs, 'budget', budget, 'timeline', timeline,
          'stakeholders', stakeholders, 'decisionProcess', decision_process
        )))::integer AS bytes
        FROM public.intakes WHERE id = ${intakeId}::uuid
      `;
      expect(stored!.bytes).toBeLessThanOrEqual(100_000);
      const detail = await readDetail(sql, fixture.pair[0], fixture.organizationId, intakeId);
      expect(detail.data).toEqual({ companyContext });
    });
  });

  test("rejects malformed detail arguments and missing organization arguments", async () => {
    await rollbackCase(context, async (sql) => {
      await expect(readPage(sql, fixture.pair[0], null)).rejects.toMatchObject({ code: "22023" });
      await expect(readDetail(sql, fixture.pair[0], null, randomUUID())).rejects.toMatchObject({ code: "22023" });
      await expect(readDetail(sql, fixture.pair[0], fixture.organizationId, null)).rejects.toMatchObject({ code: "22023" });
    });
  });

  test("keeps raw intake tables unavailable to the authenticated runtime role", async () => {
    await rollbackCase(context, async (sql) => {
      await expect(asAuthenticated(sql, fixture.pair[0], (probe) => probe`
        SELECT * FROM public.intakes
      `)).rejects.toMatchObject({ code: "42501" });
      await expect(asAuthenticated(sql, fixture.pair[0], (probe) => probe`
        SELECT * FROM public.intake_history
      `)).rejects.toMatchObject({ code: "42501" });
    });
  });

  test("does not grant the read RPC to anon, service_role, or mmhr_worker", async () => {
    await rollbackCase(context, async (sql) => {
      for (const role of ["anon", "service_role", "mmhr_worker"] as const) {
        await expect(asRuntimeRole(sql, role, (probe) => probe`
          SELECT * FROM public.mmhr_get_intakes_page(${fixture.organizationId}::uuid)
        `)).rejects.toMatchObject({ code: "42501" });
        await expect(asRuntimeRole(sql, role, (probe) => probe`
          SELECT public.mmhr_get_intake(${fixture.organizationId}::uuid, ${"00000000-0000-0000-0000-000000000000"}::uuid)
        `)).rejects.toMatchObject({ code: "42501" });
      }
    });
  });
});
