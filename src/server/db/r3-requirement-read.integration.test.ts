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
  rollbackCase,
  type SecurityCommandFixture,
  type SecurityPrincipal,
  type SecurityTransaction,
} from "./r1-security-command-fixtures";
import { asRuntimeRole } from "./r1-identity-intent-fixtures";

type RequirementRow = {
  requirement_id: string;
  organization_id: string;
  intake_id: string;
  stable_key: string;
  label: string;
  importance: string;
  weight: number;
  response: unknown;
  status: string;
  requirement_type: string;
  revision: number;
  created_at: string;
  updated_at: string;
};

async function seedIntake(
  sql: SecurityTransaction,
  fixture: SecurityCommandFixture,
  status = "draft",
  organizationId = fixture.organizationId,
) {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO public.intakes (organization_id, status, created_by_identity_id, updated_by_identity_id)
    VALUES (${organizationId}::uuid, ${status}, ${fixture.pair[0].identityId}::uuid, ${fixture.pair[0].identityId}::uuid)
    RETURNING id
  `;
  return row!.id;
}

async function seedRequirement(
  sql: SecurityTransaction,
  fixture: SecurityCommandFixture,
  intakeId: string,
  overrides: Record<string, unknown> = {},
) {
  const requirementId = String(overrides.requirementId ?? randomUUID());
  const response = overrides.response === undefined ? null : JSON.stringify(overrides.response);
  const organizationId = String(overrides.organizationId ?? fixture.organizationId);
  const ownerIdentityId = overrides.ownerIdentityId === null
    ? null
    : String(overrides.ownerIdentityId ?? fixture.pair[0].identityId);
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO public.intake_requirements (
      id, organization_id, intake_id, stable_key, label, importance, weight,
      owner_identity_id, response, status, requirement_type, evidence_references,
      vendor_response_links, created_by_identity_id, updated_by_identity_id
    ) VALUES (
      ${requirementId}::uuid, ${organizationId}::uuid, ${intakeId}::uuid,
      ${String(overrides.stableKey ?? `requirement_${requirementId.replaceAll("-", "").slice(0, 8)}`)},
      ${String(overrides.label ?? "Requirement")}, ${String(overrides.importance ?? "nice")},
      ${Number(overrides.weight ?? 1)}, ${ownerIdentityId}::uuid,
      ${response}::jsonb, ${String(overrides.status ?? "active")}, ${String(overrides.requirementType ?? "structured")},
      ${JSON.stringify(overrides.evidenceReferences ?? [])}::jsonb,
      ${JSON.stringify(overrides.vendorResponseLinks ?? [])}::jsonb,
      ${fixture.pair[0].identityId}::uuid, ${fixture.pair[0].identityId}::uuid
    )
    RETURNING id
  `;
  return row!.id;
}

async function readPage(
  sql: SecurityTransaction,
  principal: SecurityPrincipal,
  organizationId: string | null,
  intakeId: string | null,
  afterId: string | null = null,
  pageSize: number | null = 25,
  assurance: "aal1" | "aal2" = "aal1",
) {
  return asAuthenticated(sql, principal, (probe) => probe<RequirementRow[]>`
    SELECT * FROM public.mmhr_get_intake_requirements_page(
      ${organizationId}::uuid, ${intakeId}::uuid, ${afterId}::uuid, ${pageSize}
    )
  `, assurance);
}

async function readDefaultPage(sql: SecurityTransaction, principal: SecurityPrincipal, organizationId: string, intakeId: string) {
  return asAuthenticated(sql, principal, (probe) => probe<RequirementRow[]>`
    SELECT * FROM public.mmhr_get_intake_requirements_page(${organizationId}::uuid, ${intakeId}::uuid)
  `);
}

describe("R3 intake requirement read RPC", () => {
  let context: RehearsalContext;
  let fixture: SecurityCommandFixture;

  beforeAll(async () => {
    context = await startRehearsal("r3-requirement-read");
    await applyAllMigrations(context);
    fixture = await context.client.begin(createCommandFixture);
  }, 240_000);

  afterAll(async () => {
    if (context) await stopRehearsal(context);
  }, 180_000);

  test("returns the exact safe projection for AAL1 and AAL2 without writes", async () => {
    await rollbackCase(context, async (sql) => {
      const intakeId = await seedIntake(sql, fixture);
      await seedRequirement(sql, fixture, intakeId, { stableKey: "null_response", response: null });
      await seedRequirement(sql, fixture, intakeId, { stableKey: "sql_null_response" });
      await seedRequirement(sql, fixture, intakeId, { stableKey: "false_response", response: false });
      await seedRequirement(sql, fixture, intakeId, { stableKey: "zero_response", response: 0 });
      const paddedLabel = "  Café 東京  ";
      await seedRequirement(sql, fixture, intakeId, {
        stableKey: "unicode_label",
        label: paddedLabel,
        response: { note: "  preserve  " },
      });
      const [before] = await sql<{ audits: number; histories: number; receipts: number }[]>`
        SELECT
          (SELECT count(*)::integer FROM public.audit_events) AS audits,
          (SELECT count(*)::integer FROM public.intake_requirement_history) AS histories,
          (SELECT count(*)::integer FROM public.security_command_receipts) AS receipts
      `;
      const aal1 = await readPage(sql, fixture.pair[0], fixture.organizationId, intakeId, null, 25, "aal1");
      const aal2 = await readPage(sql, fixture.pair[0], fixture.organizationId, intakeId, null, 25, "aal2");
      expect(aal1.map((row) => row.requirement_id)).toEqual(aal2.map((row) => row.requirement_id));
      expect(Object.keys(aal1[0]!).sort()).toEqual([
        "created_at", "importance", "intake_id", "label", "organization_id", "requirement_id",
        "requirement_type", "response", "revision", "stable_key", "status", "updated_at", "weight",
      ]);
      expect(aal1.every((row) => row.organization_id === fixture.organizationId && row.intake_id === intakeId)).toBe(true);
      expect(aal1.find((row) => row.stable_key === "null_response")!.response).toBeNull();
      expect(aal1.find((row) => row.stable_key === "sql_null_response")!.response).toBeNull();
      expect(aal1.find((row) => row.stable_key === "false_response")!.response).toBe(false);
      expect(aal1.find((row) => row.stable_key === "zero_response")!.response).toBe(0);
      expect(aal1.find((row) => row.stable_key === "unicode_label")!.label).toBe(paddedLabel);
      expect(aal1.some((row) => "owner_identity_id" in row || "correlation_id" in row || "evidence_references" in row)).toBe(false);
      expect(aal1.some((row) => "vendor_response_links" in row || "created_by_identity_id" in row || "updated_by_identity_id" in row)).toBe(false);
      const [after] = await sql<{ audits: number; histories: number; receipts: number }[]>`
        SELECT
          (SELECT count(*)::integer FROM public.audit_events) AS audits,
          (SELECT count(*)::integer FROM public.intake_requirement_history) AS histories,
          (SELECT count(*)::integer FROM public.security_command_receipts) AS receipts
      `;
      expect(after).toEqual(before);
    });
  });

  test("returns only active requirements with scoped cursor pagination", async () => {
    await rollbackCase(context, async (sql) => {
      const intakeId = await seedIntake(sql, fixture);
      const archivedId = await seedRequirement(sql, fixture, intakeId, { status: "archived", stableKey: "archived_requirement" });
      const activeIds = await Promise.all(Array.from({ length: 4 }, (_, index) =>
        seedRequirement(sql, fixture, intakeId, { stableKey: `active_${index}` })));
      const sorted = [...activeIds].sort();
      const first = await readPage(sql, fixture.pair[0], fixture.organizationId, intakeId, null, 2);
      expect(first.map((row) => row.requirement_id)).toEqual(sorted.slice(0, 3));
      expect(first.map((row) => row.requirement_id)).not.toContain(archivedId);
      const second = await readPage(sql, fixture.pair[0], fixture.organizationId, intakeId, sorted[1]!, 2);
      expect(second.map((row) => row.requirement_id)).toEqual(sorted.slice(2));
    });
  });

  test("uses the omitted default page size and caps the look-ahead page at 50", async () => {
    await rollbackCase(context, async (sql) => {
      const intakeId = await seedIntake(sql, fixture);
      await sql`
        INSERT INTO public.intake_requirements (
          organization_id, intake_id, stable_key, label, created_by_identity_id, updated_by_identity_id
        )
        SELECT ${fixture.organizationId}::uuid, ${intakeId}::uuid,
          'page_' || g::text, 'Page requirement',
          ${fixture.pair[0].identityId}::uuid, ${fixture.pair[0].identityId}::uuid
        FROM generate_series(1, 51) AS g
      `;
      expect(await readDefaultPage(sql, fixture.pair[0], fixture.organizationId, intakeId)).toHaveLength(26);
      expect(await readPage(sql, fixture.pair[0], fixture.organizationId, intakeId, null, 50)).toHaveLength(51);
      for (const size of [0, -1, 51, null]) {
        await expect(readPage(sql, fixture.pair[0], fixture.organizationId, intakeId, null, size)).rejects.toMatchObject({ code: "22023" });
      }
    });
  });

  test("rejects a bad legacy response and preserves valid near-limit JSON", async () => {
    await rollbackCase(context, async (sql) => {
      const intakeId = await seedIntake(sql, fixture);
      let badResponse: unknown = "leaf";
      for (let index = 0; index < 6; index += 1) badResponse = { nested: badResponse };
      const badId = await seedRequirement(sql, fixture, intakeId, { stableKey: "bad_legacy", response: badResponse });
      await expect(readPage(sql, fixture.pair[0], fixture.organizationId, intakeId)).rejects.toMatchObject({ code: "22023" });
      expect(badId).toBeTruthy();
      const goodIntakeId = await seedIntake(sql, fixture);
      const value = Array.from({ length: 5 }, () => "x".repeat(1_800));
      expect(Buffer.byteLength(JSON.stringify({ value }), "utf8")).toBeGreaterThan(8_000);
      const goodId = await seedRequirement(sql, fixture, goodIntakeId, { stableKey: "near_limit", response: { value } });
      const rows = await readPage(sql, fixture.pair[0], fixture.organizationId, goodIntakeId);
      expect(rows.find((row) => row.requirement_id === goodId)!.response).toEqual({ value });
    });
  });

  test("denies wrong organizations, wrong intakes, and missing parents", async () => {
    await rollbackCase(context, async (sql) => {
      const intakeId = await seedIntake(sql, fixture);
      const [otherOrganization] = await sql<{ id: string }[]>`
        INSERT INTO public.orgs (name, type, status, activated_at, migration_review_required)
        VALUES ('R3 requirement read other customer', 'customer', 'active', now(), false)
        RETURNING id
      `;
      const otherIntakeId = await seedIntake(sql, fixture, "draft", otherOrganization!.id);
      const otherRequirementId = await seedRequirement(sql, fixture, otherIntakeId, {
        organizationId: otherOrganization!.id,
        stableKey: "other_org_requirement",
      });
      expect(otherRequirementId).toBeTruthy();
      await expect(readPage(sql, fixture.pair[0], otherOrganization!.id, otherIntakeId)).rejects.toMatchObject({ code: "42501" });
      await expect(readPage(sql, fixture.pair[0], fixture.organizationId, otherIntakeId)).rejects.toMatchObject({ code: "42501" });
      await expect(readPage(sql, fixture.pair[0], otherOrganization!.id, intakeId)).rejects.toMatchObject({ code: "42501" });
      const missingOrganization = randomUUID();
      await expect(readPage(sql, fixture.pair[0], missingOrganization, intakeId)).rejects.toMatchObject({ code: "42501" });
      await expect(readPage(sql, fixture.pair[0], fixture.organizationId, randomUUID())).rejects.toMatchObject({ code: "42501" });
      await expect(readPage(sql, fixture.pair[0], randomUUID(), randomUUID())).rejects.toMatchObject({ code: "42501" });
      await expect(readPage(sql, fixture.pair[0], null, intakeId)).rejects.toMatchObject({ code: "22023" });
      await expect(readPage(sql, fixture.pair[0], fixture.organizationId, null)).rejects.toMatchObject({ code: "22023" });
    });
  });

  test("denies reads after membership revocation", async () => {
    await rollbackCase(context, async (sql) => {
      const intakeId = await seedIntake(sql, fixture);
      await seedRequirement(sql, fixture, intakeId);
      await asAuthenticated(sql, fixture.organizationAdmin, (probe) => changeMembershipStatus(
        probe, fixture.organizationId, fixture.actorMembershipId, "revoked", commandInput(),
      ));
      await expect(readPage(sql, fixture.pair[0], fixture.organizationId, intakeId)).rejects.toMatchObject({ code: "42501" });
    });
  });

  test("rejects malformed page arguments and raw table access", async () => {
    await rollbackCase(context, async (sql) => {
      const intakeId = await seedIntake(sql, fixture);
      await seedRequirement(sql, fixture, intakeId);
      await expect(readPage(sql, fixture.pair[0], null, intakeId)).rejects.toMatchObject({ code: "22023" });
      await expect(readPage(sql, fixture.pair[0], fixture.organizationId, null)).rejects.toMatchObject({ code: "22023" });
      await expect(asAuthenticated(sql, fixture.pair[0], (probe) => probe`
        SELECT * FROM public.intake_requirements
      `)).rejects.toMatchObject({ code: "42501" });
    });
  });

  test("does not grant the read RPC to anon, service_role, or mmhr_worker", async () => {
    await rollbackCase(context, async (sql) => {
      const intakeId = await seedIntake(sql, fixture);
      for (const role of ["anon", "service_role", "mmhr_worker"] as const) {
        await expect(asRuntimeRole(sql, role, (probe) => probe`
          SELECT * FROM public.mmhr_get_intake_requirements_page(
            ${fixture.organizationId}::uuid, ${intakeId}::uuid
          )
        `)).rejects.toMatchObject({ code: "42501" });
      }
    });
  });
});
