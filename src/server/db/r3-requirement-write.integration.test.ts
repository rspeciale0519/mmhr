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
  createSecurityPrincipal,
  rollbackCase,
  type SecurityCommandFixture,
  type SecurityPrincipal,
  type SecurityTransaction,
} from "./r1-security-command-fixtures";

type RequirementResult = Record<string, unknown>;

async function seedIntake(
  sql: SecurityTransaction,
  organizationId: string,
  identityId: string,
  status: "draft" | "in_progress" = "draft",
) {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO public.intakes (organization_id, status, created_by_identity_id, updated_by_identity_id)
    VALUES (${organizationId}::uuid, ${status}, ${identityId}::uuid, ${identityId}::uuid)
    RETURNING id
  `;
  return row!.id;
}

function createPayload(
  fixture: SecurityCommandFixture,
  intakeId: string,
  requirementId = randomUUID(),
  overrides: Record<string, unknown> = {},
) {
  return {
    requirementId,
    organizationId: fixture.organizationId,
    intakeId,
    expectedRevision: 0,
    stableKey: "payroll",
    label: "Payroll platform",
    importance: "must",
    weight: 1,
    ownerIdentityId: fixture.pair[0].identityId,
    response: { value: "mid" },
    requirementType: "structured",
    evidenceReferences: ["https://example.com/evidence"],
    vendorResponseLinks: ["https://vendor.example.com/response"],
    actorIdentityId: fixture.pair[0].identityId,
    ...overrides,
  };
}

async function createRequirement(
  sql: SecurityTransaction,
  principal: SecurityPrincipal,
  payload: Record<string, unknown>,
  correlationId = randomUUID(),
  idempotencyKey = randomUUID(),
  assurance: "aal1" | "aal2" = "aal2",
) {
  return asAuthenticated(sql, principal, async (probe) => {
    const [row] = await probe<{ result: RequirementResult }[]>`
      SELECT public.mmhr_create_intake_requirement(
        ${JSON.stringify(payload)}::jsonb,
        ${correlationId}::uuid,
        ${idempotencyKey}::uuid
      ) AS result
    `;
    return row!.result;
  }, assurance);
}

async function updateRequirement(
  sql: SecurityTransaction,
  principal: SecurityPrincipal,
  payload: Record<string, unknown>,
  correlationId = randomUUID(),
  idempotencyKey = randomUUID(),
  assurance: "aal1" | "aal2" = "aal2",
) {
  return asAuthenticated(sql, principal, async (probe) => {
    const [row] = await probe<{ result: RequirementResult }[]>`
      SELECT public.mmhr_update_intake_requirement(
        ${JSON.stringify(payload)}::jsonb,
        ${correlationId}::uuid,
        ${idempotencyKey}::uuid
      ) AS result
    `;
    return row!.result;
  }, assurance);
}

async function requirementCounts(sql: SecurityTransaction, organizationId: string, requirementId: string) {
  const [row] = await sql<{ requirements: number; history: number; audits: number; receipts: number }[]>`
    SELECT
      (SELECT count(*)::integer FROM public.intake_requirements
        WHERE organization_id = ${organizationId}::uuid AND id = ${requirementId}::uuid) AS requirements,
      (SELECT count(*)::integer FROM public.intake_requirement_history
        WHERE organization_id = ${organizationId}::uuid AND requirement_id = ${requirementId}::uuid) AS history,
      (SELECT count(*)::integer FROM public.audit_events
        WHERE entity_type = 'intake_requirement' AND entity_id = ${requirementId}) AS audits,
      (SELECT count(*)::integer FROM public.security_command_receipts
        WHERE entity_id = ${requirementId}::uuid) AS receipts
  `;
  return row!;
}

describe("R3 intake requirement write RPCs", () => {
  let context: RehearsalContext;
  let fixture: SecurityCommandFixture;

  beforeAll(async () => {
    context = await startRehearsal("r3-requirement-write");
    await applyAllMigrations(context);
    fixture = await context.client.begin(createCommandFixture);
  }, 240_000);

  afterAll(async () => {
    if (context) await stopRehearsal(context);
  }, 180_000);

  test("creates a structured requirement with a fixed identity and audit history", async () => {
    await rollbackCase(context, async (sql) => {
      const intakeId = await seedIntake(sql, fixture.organizationId, fixture.pair[0].identityId);
      const requirementId = randomUUID();
      const result = await createRequirement(sql, fixture.pair[0], createPayload(fixture, intakeId, requirementId));
      expect(result).toMatchObject({
        requirementId,
        organizationId: fixture.organizationId,
        intakeId,
        revision: 1,
        outcomeCode: "created",
      });
      await expect(requirementCounts(sql, fixture.organizationId, requirementId)).resolves.toMatchObject({
        requirements: 1,
        history: 1,
        audits: 1,
        receipts: 1,
      });
    });
  });

  test("creates a custom requirement and accepts the weight 100 boundary", async () => {
    await rollbackCase(context, async (sql) => {
      const intakeId = await seedIntake(sql, fixture.organizationId, fixture.pair[0].identityId, "in_progress");
      const requirementId = randomUUID();
      const payload = createPayload(fixture, intakeId, requirementId, {
        stableKey: "custom_need",
        label: "Custom need",
        importance: "nice",
        weight: 100,
        ownerIdentityId: null,
        response: { answer: "  preserved  " },
        requirementType: "custom",
        evidenceReferences: [],
        vendorResponseLinks: [],
      });
      const result = await createRequirement(sql, fixture.pair[0], payload);
      expect(result).toMatchObject({ requirementId, revision: 1, outcomeCode: "created" });
      const [stored] = await sql<{ stable_key: string; weight: number; requirement_type: string; response: Record<string, unknown> }[]>`
        SELECT stable_key, weight, requirement_type, response
        FROM public.intake_requirements WHERE id = ${requirementId}::uuid
      `;
      expect(stored).toMatchObject({ stable_key: "custom_need", weight: 100, requirement_type: "custom" });
      expect(stored!.response).toEqual({ answer: "  preserved  " });
    });
  });

  test("replays an exact create request once, including after a later parent transition", async () => {
    await rollbackCase(context, async (sql) => {
      const intakeId = await seedIntake(sql, fixture.organizationId, fixture.pair[0].identityId);
      const requirementId = randomUUID();
      const correlationId = randomUUID();
      const idempotencyKey = randomUUID();
      const payload = createPayload(fixture, intakeId, requirementId);
      const created = await createRequirement(sql, fixture.pair[0], payload, correlationId, idempotencyKey);
      const replayed = await createRequirement(sql, fixture.pair[0], payload, correlationId, idempotencyKey);
      expect(replayed).toMatchObject({ ...created, outcomeCode: "replayed" });
      await sql`UPDATE public.intakes SET status = 'submitted', submitted_at = now() WHERE id = ${intakeId}::uuid`;
      const laterReplay = await createRequirement(sql, fixture.pair[0], payload, correlationId, idempotencyKey);
      expect(laterReplay).toMatchObject({ requirementId, intakeId, revision: 1, outcomeCode: "replayed" });
      await expect(requirementCounts(sql, fixture.organizationId, requirementId)).resolves.toMatchObject({ history: 1, audits: 1, receipts: 1 });
    });
  });

  test("rejects duplicate requirement IDs and stable keys without extra history", async () => {
    await rollbackCase(context, async (sql) => {
      const intakeId = await seedIntake(sql, fixture.organizationId, fixture.pair[0].identityId);
      const requirementId = randomUUID();
      const first = createPayload(fixture, intakeId, requirementId);
      await createRequirement(sql, fixture.pair[0], first);
      await expect(createRequirement(sql, fixture.pair[0], { ...first, stableKey: "other_key" })).rejects.toMatchObject({ code: "42501" });
      await expect(createRequirement(sql, fixture.pair[0], { ...first, requirementId: randomUUID() })).rejects.toMatchObject({ code: "42501" });
      await expect(requirementCounts(sql, fixture.organizationId, requirementId)).resolves.toMatchObject({ history: 1, audits: 1, receipts: 1 });
    });
  });

  test("denies cross-organization, actor-mismatch, and AAL1 create requests", async () => {
    await rollbackCase(context, async (sql) => {
      const intakeId = await seedIntake(sql, fixture.organizationId, fixture.pair[0].identityId);
      const payload = createPayload(fixture, intakeId);
      await expect(createRequirement(sql, fixture.pair[0], { ...payload, organizationId: randomUUID() })).rejects.toMatchObject({ code: "42501" });
      await expect(createRequirement(sql, fixture.pair[0], { ...payload, actorIdentityId: fixture.pair[1].identityId })).rejects.toMatchObject({ code: "42501" });
      await expect(createRequirement(sql, fixture.pair[0], payload, randomUUID(), randomUUID(), "aal1")).rejects.toMatchObject({ code: "42501" });
    });
  });

  test("requires an active owner in the same organization", async () => {
    await rollbackCase(context, async (sql) => {
      const intakeId = await seedIntake(sql, fixture.organizationId, fixture.pair[0].identityId);
      const foreignOwner = await createSecurityPrincipal(sql);
      const payload = createPayload(fixture, intakeId);
      await expect(createRequirement(sql, fixture.pair[0], { ...payload, ownerIdentityId: foreignOwner.identityId })).rejects.toMatchObject({ code: "42501" });
      const valid = await createRequirement(sql, fixture.pair[0], { ...payload, requirementId: randomUUID(), ownerIdentityId: fixture.target.identityId });
      expect(valid.outcomeCode).toBe("created");
    });
  });

  test("rejects invalid weights, links, evidence, and deeply nested responses", async () => {
    await rollbackCase(context, async (sql) => {
      const intakeId = await seedIntake(sql, fixture.organizationId, fixture.pair[0].identityId);
      const payload = createPayload(fixture, intakeId);
      let deepResponse: unknown = "leaf";
      for (let index = 0; index < 6; index += 1) deepResponse = { nested: deepResponse };
      const invalid = [
        { ...payload, expectedRevision: 9_999_999_999 },
        { ...payload, expectedRevision: "0" },
        { ...payload, weight: "1" },
        { ...payload, label: 10 },
        { ...payload, weight: 0 },
        { ...payload, evidenceReferences: Array.from({ length: 21 }, () => "https://example.com/evidence") },
        { ...payload, vendorResponseLinks: ["http://example.com/no"] },
        { ...payload, response: deepResponse },
      ];
      for (const item of invalid) {
        await expect(createRequirement(sql, fixture.pair[0], { ...item, requirementId: randomUUID() })).rejects.toMatchObject({ code: "22023" });
      }
    });
  });

  test("updates an active requirement and appends one immutable history revision", async () => {
    await rollbackCase(context, async (sql) => {
      const intakeId = await seedIntake(sql, fixture.organizationId, fixture.pair[0].identityId);
      const requirementId = randomUUID();
      const original = createPayload(fixture, intakeId, requirementId);
      await createRequirement(sql, fixture.pair[0], original);
      const update = { ...original, expectedRevision: 1, label: "Updated payroll platform", weight: 100 };
      const correlationId = randomUUID();
      const result = await updateRequirement(sql, fixture.pair[0], update, correlationId);
      expect(result).toMatchObject({ requirementId, intakeId, revision: 2, outcomeCode: "updated" });
      await expect(requirementCounts(sql, fixture.organizationId, requirementId)).resolves.toMatchObject({ history: 2, audits: 2, receipts: 2 });
      const [history] = await sql<{ correlation_id: string }[]>`
        SELECT correlation_id FROM public.intake_requirement_history
        WHERE requirement_id=${requirementId}::uuid AND revision=2
      `;
      expect(history!.correlation_id).toBe(correlationId);
    });
  });

  test("rejects stale requirement updates", async () => {
    await rollbackCase(context, async (sql) => {
      const intakeId = await seedIntake(sql, fixture.organizationId, fixture.pair[0].identityId);
      const requirementId = randomUUID();
      const original = createPayload(fixture, intakeId, requirementId);
      await createRequirement(sql, fixture.pair[0], original);
      await updateRequirement(sql, fixture.pair[0], { ...original, expectedRevision: 1, label: "First update" });
      await expect(updateRequirement(sql, fixture.pair[0], { ...original, expectedRevision: 1, label: "Stale update" })).rejects.toMatchObject({ code: "42501" });
      await expect(requirementCounts(sql, fixture.organizationId, requirementId)).resolves.toMatchObject({ history: 2, audits: 2, receipts: 2 });
    });
  });

  test("denies updates after the parent intake is submitted", async () => {
    await rollbackCase(context, async (sql) => {
      const intakeId = await seedIntake(sql, fixture.organizationId, fixture.pair[0].identityId);
      const requirementId = randomUUID();
      const original = createPayload(fixture, intakeId, requirementId);
      await createRequirement(sql, fixture.pair[0], original);
      await sql`UPDATE public.intakes SET status = 'submitted', submitted_at = now() WHERE id = ${intakeId}::uuid`;
      await expect(updateRequirement(sql, fixture.pair[0], { ...original, expectedRevision: 1, label: "Blocked update" })).rejects.toMatchObject({ code: "42501" });
      await expect(requirementCounts(sql, fixture.organizationId, requirementId)).resolves.toMatchObject({ history: 1, audits: 1, receipts: 1 });
    });
  });

  test("denies new requirements after submitted, under review, completed, or archived parent states", async () => {
    for (const status of ["submitted", "under_review", "completed", "archived"] as const) {
      await rollbackCase(context, async (sql) => {
        const intakeId = await seedIntake(sql, fixture.organizationId, fixture.pair[0].identityId);
        await sql`
          UPDATE public.intakes SET status = ${status}, submitted_at = now()
          WHERE id = ${intakeId}::uuid
        `;
        const requirementId = randomUUID();
        await expect(createRequirement(sql, fixture.pair[0], createPayload(fixture, intakeId, requirementId))).rejects.toMatchObject({ code: "42501" });
        await expect(requirementCounts(sql, fixture.organizationId, requirementId)).resolves.toEqual({ requirements: 0, history: 0, audits: 0, receipts: 0 });
      });
    }
  });

  test("replays an update after a later parent transition but rejects a changed request with the same key", async () => {
    await rollbackCase(context, async (sql) => {
      const intakeId = await seedIntake(sql, fixture.organizationId, fixture.pair[0].identityId);
      const requirementId = randomUUID();
      const original = createPayload(fixture, intakeId, requirementId);
      await createRequirement(sql, fixture.pair[0], original);
      const correlationId = randomUUID();
      const idempotencyKey = randomUUID();
      const update = { ...original, expectedRevision: 1, label: "Revised payroll platform" };
      const updated = await updateRequirement(sql, fixture.pair[0], update, correlationId, idempotencyKey);
      expect(updated).toMatchObject({ requirementId, revision: 2, outcomeCode: "updated" });
      await sql`UPDATE public.intakes SET status = 'submitted', submitted_at = now() WHERE id = ${intakeId}::uuid`;
      const replayed = await updateRequirement(sql, fixture.pair[0], update, correlationId, idempotencyKey);
      expect(replayed).toMatchObject({ requirementId, revision: 2, outcomeCode: "replayed" });
      await expect(updateRequirement(sql, fixture.pair[0], { ...update, label: "Changed after receipt" }, correlationId, idempotencyKey)).rejects.toMatchObject({ code: "22023" });
      await expect(requirementCounts(sql, fixture.organizationId, requirementId)).resolves.toMatchObject({ history: 2, audits: 2, receipts: 2 });
    });
  });

  test("keeps requirement history immutable and denies raw history access", async () => {
    await rollbackCase(context, async (sql) => {
      const intakeId = await seedIntake(sql, fixture.organizationId, fixture.pair[0].identityId);
      const requirementId = randomUUID();
      await createRequirement(sql, fixture.pair[0], createPayload(fixture, intakeId, requirementId));
      await expect(asAuthenticated(sql, fixture.pair[0], (probe) => probe`
        SELECT * FROM public.intake_requirement_history
      `)).rejects.toMatchObject({ code: "42501" });
      await expect(sql.savepoint((probe) => probe`
        DELETE FROM public.intake_requirement_history WHERE requirement_id = ${requirementId}::uuid
      `)).rejects.toMatchObject({ code: "P0001" });
      await expect(sql.savepoint((probe) => probe`
        UPDATE public.intake_requirement_history SET revision = revision + 1
        WHERE requirement_id = ${requirementId}::uuid
      `)).rejects.toMatchObject({ code: "P0001" });
      await expect(sql.savepoint((probe) => probe`TRUNCATE public.intake_requirement_history`)).rejects.toMatchObject({ code: "P0001" });
      await expect(requirementCounts(sql, fixture.organizationId, requirementId)).resolves.toMatchObject({ history: 1 });
    });
  });

  test("rolls back requirement and history writes when audit insertion fails", async () => {
    await rollbackCase(context, async (sql) => {
      const intakeId = await seedIntake(sql, fixture.organizationId, fixture.pair[0].identityId);
      const requirementId = randomUUID();
      await sql`ALTER TABLE public.audit_events ADD CONSTRAINT r3_requirement_audit_failure CHECK (false) NOT VALID`;
      await expect(createRequirement(sql, fixture.pair[0], createPayload(fixture, intakeId, requirementId))).rejects.toThrow();
      await expect(requirementCounts(sql, fixture.organizationId, requirementId)).resolves.toEqual({ requirements: 0, history: 0, audits: 0, receipts: 0 });
    });
  });

  test("rejects non-object payloads without a JSON extraction error", async () => {
    await rollbackCase(context, async (sql) => {
      for (const payload of [null, [], "invalid", 1]) {
        await expect(createRequirement(sql, fixture.pair[0], payload as never)).rejects.toMatchObject({ code: "22023" });
        await expect(updateRequirement(sql, fixture.pair[0], payload as never)).rejects.toMatchObject({ code: "22023" });
      }
    });
  });

  test("replays a historical receipt with a missing response but rejects a new write with that shape", async () => {
    await rollbackCase(context, async (sql) => {
      const intakeId = await seedIntake(sql, fixture.organizationId, fixture.pair[0].identityId);
      const requirementId = randomUUID();
      const original = createPayload(fixture, intakeId, requirementId);
      await createRequirement(sql, fixture.pair[0], original);
      const correlationId = randomUUID();
      const idempotencyKey = randomUUID();
      const legacy: Record<string, unknown> = { ...original, expectedRevision: 1, label: "Legacy update" };
      delete legacy.response;
      // Simulate the persisted result and exact receipt from the older SQL contract.
      await sql`UPDATE public.intake_requirements SET revision=2, label='Legacy update', response=NULL,
        correlation_id=${correlationId}::uuid, updated_at=now() WHERE id=${requirementId}::uuid`;
      await sql`SELECT mmhr_private.r1_finish_security_command(
        ${fixture.pair[0].identityId}::uuid, 'r3.requirement.update', 'requirement.update', 'intake_requirement',
        ${requirementId}::uuid, ${fixture.organizationId}::uuid, 'Update intake requirement',
        ${correlationId}::uuid, ${idempotencyKey}::uuid, ${JSON.stringify(legacy)}::jsonb,
        '{"version":1}'::jsonb, '{"version":1,"state":"active"}'::jsonb, clock_timestamp())`;
      await sql`UPDATE public.intakes SET status='submitted', submitted_at=now() WHERE id=${intakeId}::uuid`;
      const before = await requirementCounts(sql, fixture.organizationId, requirementId);
      const replay = await updateRequirement(sql, fixture.pair[0], legacy, correlationId, idempotencyKey);
      expect(replay).toMatchObject({ requirementId, intakeId, revision: 2, outcomeCode: "replayed" });
      expect(await requirementCounts(sql, fixture.organizationId, requirementId)).toEqual(before);
      await expect(updateRequirement(sql, fixture.pair[0], legacy)).rejects.toMatchObject({ code: "22023" });
    });
  });
});
