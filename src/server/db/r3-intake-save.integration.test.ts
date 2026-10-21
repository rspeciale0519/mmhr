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
  createCommandFixture,
  rollbackCase,
  type SecurityCommandFixture,
  type SecurityPrincipal,
  type SecurityTransaction,
} from "./r1-security-command-fixtures";

type SaveResult = Record<string, unknown>;

async function saveIntake(
  sql: SecurityTransaction,
  principal: SecurityPrincipal,
  payload: Record<string, unknown>,
  correlationId = randomUUID(),
  idempotencyKey = randomUUID(),
) {
  return asAuthenticated(sql, principal, async (probe) => {
    const [row] = await probe<{ result: SaveResult }[]>`
      SELECT public.mmhr_save_intake(
        ${JSON.stringify(payload)}::jsonb,
        ${correlationId}::uuid,
        ${idempotencyKey}::uuid
      ) AS result
    `;
    return row!.result;
  });
}

function newPayload(fixture: SecurityCommandFixture, data: Record<string, unknown> = {}) {
  return {
    organizationId: fixture.organizationId,
    actorIdentityId: fixture.pair[0].identityId,
    intakeId: null,
    expectedRevision: 0,
    status: "draft",
    data,
  };
}

async function rowCounts(sql: SecurityTransaction, intakeId: string) {
  const [row] = await sql<{ history: number; audits: number; receipts: number }[]>`
    SELECT
      (SELECT count(*)::integer FROM public.intake_history WHERE intake_id = ${intakeId}::uuid) AS history,
      (SELECT count(*)::integer FROM public.audit_events WHERE entity_type = 'intake' AND entity_id = ${intakeId}) AS audits,
      (SELECT count(*)::integer FROM public.security_command_receipts WHERE entity_id = ${intakeId}::uuid) AS receipts
  `;
  return row!;
}

describe("R3 intake save RPC", () => {
  let context: RehearsalContext | undefined;
  let fixture: SecurityCommandFixture;

  beforeAll(async () => {
    context = await startRehearsal("r3-intake-save");
    await applyAllMigrations(context);
    fixture = await context.client.begin((sql) => createCommandFixture(sql));
  }, 240_000);

  afterAll(async () => {
    if (context) await stopRehearsal(context);
  }, 180_000);

  test("creates, replays, and revisions a scoped intake with immutable history", async () => {
    await rollbackCase(context!, async (sql) => {
      const correlationId = randomUUID();
      const idempotencyKey = randomUUID();
      const payload = newPayload(fixture, {
        companyContext: { sector: "services" },
        budget: { range: "mid" },
      });
      const created = await saveIntake(sql, fixture.pair[0], payload, correlationId, idempotencyKey);
      expect(created).toMatchObject({
        organizationId: fixture.organizationId,
        status: "draft",
        revision: 1,
        outcomeCode: "created",
      });
      const replayed = await saveIntake(sql, fixture.pair[0], payload, correlationId, idempotencyKey);
      expect(replayed.outcomeCode).toBe("replayed");
      const updated = await saveIntake(sql, fixture.pair[0], {
        ...payload,
        intakeId: created.intakeId,
        expectedRevision: 1,
        status: "in_progress",
        data: { timeline: { months: 3 } },
      });
      expect(updated).toMatchObject({
        intakeId: created.intakeId,
        revision: 2,
        status: "in_progress",
        outcomeCode: "updated",
      });
      const [history] = await sql<{ count: string }[]>`
        SELECT count(*)::text FROM public.intake_history WHERE intake_id = ${String(created.intakeId)}::uuid
      `;
      expect(history!.count).toBe("2");
    });
  }, 120_000);

  test("denies a cross-organization intake save", async () => {
    await rollbackCase(context!, async (sql) => {
      const payload = {
        ...newPayload(fixture),
        organizationId: "99999999-9999-4999-8999-999999999999",
      };
      await expect(saveIntake(sql, fixture.pair[0], payload)).rejects.toMatchObject({ code: "42501" });
    });
  }, 120_000);

  test("rejects malformed, oversized, and unsupported payloads before writing", async () => {
    await rollbackCase(context!, async (sql) => {
      const base = newPayload(fixture);
      const invalidPayloads = [
        { ...base, unexpected: true },
        { ...base, data: { customizations: { required: true } } },
        { ...base, data: { companyContext: { sector: "x".repeat(2_001) } } },
        { ...base, data: { companyContext: { nested: { unsupported: true } } } },
        { ...base, data: { currentSystems: Array.from({ length: 51 }, () => "System") } },
        { ...base, data: { companyContext: null } },
        { ...base, status: "submitted" },
        { ...base, expectedRevision: 2_147_483_647 },
      ];
      for (const payload of invalidPayloads) {
        await expect(saveIntake(sql, fixture.pair[0], payload)).rejects.toMatchObject({ code: "22023" });
      }
      const [rows] = await sql<{ intakes: number; history: number }[]>`
        SELECT
          (SELECT count(*)::integer FROM public.intakes WHERE organization_id = ${fixture.organizationId}::uuid) AS intakes,
          (SELECT count(*)::integer FROM public.intake_history WHERE organization_id = ${fixture.organizationId}::uuid) AS history
      `;
      expect(rows).toEqual({ intakes: 0, history: 0 });
    });
  }, 120_000);

  test("allows draft and in-progress autosaves with one history row per write", async () => {
    await rollbackCase(context!, async (sql) => {
      const created = await saveIntake(sql, fixture.pair[0], newPayload(fixture, { budget: { range: "low" } }));
      const updated = await saveIntake(sql, fixture.pair[0], {
        ...newPayload(fixture, { budget: { range: "mid" } }),
        intakeId: created.intakeId,
        expectedRevision: 1,
        status: "draft",
      });
      const inProgress = await saveIntake(sql, fixture.pair[0], {
        ...newPayload(fixture, { timeline: { months: 6 } }),
        intakeId: created.intakeId,
        expectedRevision: 2,
        status: "in_progress",
      });
      const continued = await saveIntake(sql, fixture.pair[0], {
        ...newPayload(fixture, { stakeholders: ["owner"] }),
        intakeId: created.intakeId,
        expectedRevision: 3,
        status: "in_progress",
      });
      expect([updated.revision, inProgress.revision, continued.revision]).toEqual([2, 3, 4]);
      await expect(saveIntake(sql, fixture.pair[0], {
        ...newPayload(fixture), intakeId: created.intakeId, expectedRevision: 4, status: "draft",
      })).rejects.toMatchObject({ code: "42501" });
      await expect(rowCounts(sql, String(created.intakeId))).resolves.toMatchObject({ history: 4, audits: 4, receipts: 4 });
    });
  }, 120_000);

  test.each(["submitted", "under_review", "completed", "archived"] as const)(
    "denies a new write after %s",
    async (status) => {
      await rollbackCase(context!, async (sql) => {
        const created = await saveIntake(sql, fixture.pair[0], newPayload(fixture));
        const intakeId = String(created.intakeId);
        await sql`
          UPDATE public.intakes
          SET status = ${status}, submitted_at = now()
          WHERE id = ${intakeId}::uuid
        `;
        const before = await rowCounts(sql, intakeId);
        await expect(saveIntake(sql, fixture.pair[0], {
          ...newPayload(fixture, { timeline: { months: 12 } }),
          intakeId,
          expectedRevision: 1,
          status: "draft",
        })).rejects.toMatchObject({ code: "42501" });
        await expect(rowCounts(sql, intakeId)).resolves.toEqual(before);
      });
    },
    120_000,
  );

  test("requires an active must or nice requirement before submit", async () => {
    await rollbackCase(context!, async (sql) => {
      const created = await saveIntake(sql, fixture.pair[0], newPayload(fixture));
      const intakeId = String(created.intakeId);
      const submission = {
        ...newPayload(fixture, { companyContext: { sector: "services" } }),
        intakeId,
        expectedRevision: 1,
        status: "submitted",
      };
      const before = await rowCounts(sql, intakeId);
      await expect(saveIntake(sql, fixture.pair[0], submission)).rejects.toMatchObject({ code: "22023" });
      await expect(rowCounts(sql, intakeId)).resolves.toEqual(before);
      await sql`
        INSERT INTO public.intake_requirements (
          organization_id, intake_id, stable_key, label, importance, weight,
          created_by_identity_id, updated_by_identity_id
        ) VALUES (
          ${fixture.organizationId}::uuid, ${intakeId}::uuid, 'applicable_requirement',
          'Applicable requirement', 'nice', 1,
          ${fixture.pair[0].identityId}::uuid, ${fixture.pair[0].identityId}::uuid
        )
      `;
      const submitted = await saveIntake(sql, fixture.pair[0], submission);
      expect(submitted).toMatchObject({ intakeId, status: "submitted", revision: 2, outcomeCode: "updated" });
    });
  }, 120_000);

  test("replays an earlier request after a later lifecycle transition without another write", async () => {
    await rollbackCase(context!, async (sql) => {
      const correlationId = randomUUID();
      const idempotencyKey = randomUUID();
      const payload = newPayload(fixture, { budget: { range: "mid" } });
      const created = await saveIntake(sql, fixture.pair[0], payload, correlationId, idempotencyKey);
      const intakeId = String(created.intakeId);
      const moved = await saveIntake(sql, fixture.pair[0], {
        ...payload,
        intakeId,
        expectedRevision: 1,
        status: "in_progress",
      });
      // Simulate a later reviewed transition without altering immutable history.
      await sql`UPDATE public.intakes SET status='completed', submitted_at=now()
        WHERE id=${intakeId}::uuid`;
      const before = await rowCounts(sql, intakeId);
      const replayed = await saveIntake(sql, fixture.pair[0], payload, correlationId, idempotencyKey);
      expect(replayed).toMatchObject({ intakeId, organizationId: fixture.organizationId, status: "completed", revision: moved.revision, outcomeCode: "replayed" });
      await expect(rowCounts(sql, intakeId)).resolves.toEqual(before);
    });
  }, 120_000);

  test("preserves the current AAL2 write requirement without changing AAL1 workspace access", async () => {
    await rollbackCase(context!, async (sql) => {
      await expect(asAuthenticated(sql, fixture.pair[0], (probe) => probe`
        SELECT public.mmhr_save_intake(${JSON.stringify(newPayload(fixture))}::jsonb,
          ${randomUUID()}::uuid, ${randomUUID()}::uuid)
      `, "aal1")).rejects.toMatchObject({ code: "42501" });
    });
  }, 120_000);

  test("keeps private helpers, implementation, and tables unavailable to the runtime role", async () => {
    await rollbackCase(context!, async (sql) => {
      await expect(asAuthenticated(sql, fixture.pair[0], (probe) => probe`
        SELECT mmhr_private.r3_intake_data_is_valid('{}'::jsonb)
      `)).rejects.toMatchObject({ code: "42501" });
      await expect(asAuthenticated(sql, fixture.pair[0], (probe) => probe`
        SELECT mmhr_private.r3_save_intake_impl('{}'::jsonb, ${randomUUID()}::uuid, ${randomUUID()}::uuid)
      `)).rejects.toMatchObject({ code: "42501" });
      await expect(asAuthenticated(sql, fixture.pair[0], (probe) => probe`
        SELECT * FROM public.intakes
      `)).rejects.toMatchObject({ code: "42501" });
      await expect(asAuthenticated(sql, fixture.pair[0], (probe) => probe`
        SELECT * FROM public.intake_history
      `)).rejects.toMatchObject({ code: "42501" });
    });
  }, 120_000);
});
