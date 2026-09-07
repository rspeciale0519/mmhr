import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { applyAllMigrations, startRehearsal, stopRehearsal, type RehearsalContext } from "./r1-migration-rehearsal";
import { asAuthenticated, createCommandFixture, createMembership, rollbackCase, type SecurityCommandFixture } from "./r1-security-command-fixtures";

describe("R2B relationship RPC", () => {
  let context: RehearsalContext | undefined;
  let fixture: SecurityCommandFixture;
  let relatedOrganizationId: string;
  beforeAll(async () => {
    context = await startRehearsal("r2b-relationship");
    await applyAllMigrations(context);
    fixture = await context.client.begin(async (sql) => {
      const f = await createCommandFixture(sql);
      const [related] = await sql<{ id: string }[]>`INSERT INTO public.orgs (name,type,status,activated_at,migration_review_required) VALUES ('Related partner','vendor','active',now(),false) RETURNING id`;
      relatedOrganizationId = related!.id;
      await createMembership(sql, relatedOrganizationId, f.organizationAdmin, "organization_admin");
      return f;
    });
  }, 240000);
  afterAll(async () => { if (context) await stopRehearsal(context); }, 180000);
  test("creates, replays, updates, and rejects stale relationships", async () => {
    await rollbackCase(context!, async (sql) => {
      const invoke = async (payload: Record<string, unknown>) => asAuthenticated(sql, fixture.pair[0], async (probe) => {
        const [row] = await probe<{ result: Record<string, unknown> }[]>`SELECT public.mmhr_record_relationship(${JSON.stringify(payload)}::jsonb,${String(payload.correlationId)}::uuid,${String(payload.idempotencyKey)}::uuid) AS result`;
        return row!.result;
      });
      const relationshipId = randomUUID();
      const base = { organizationId: fixture.organizationId, actorIdentityId: fixture.pair[0].identityId, relationshipId };
      const create = { ...base, action: "create", relationshipType: "customer_vendor", subjectOrganizationId: fixture.organizationId, subjectContactId: null, relatedOrganizationId, relatedContactId: null, ownerIdentityId: fixture.pair[0].identityId, influence: "medium", preference: "Quarterly review", correlationId: randomUUID(), idempotencyKey: randomUUID() };
      await expect(invoke(create)).resolves.toMatchObject({ relationshipId, influence: "medium", revision: 1 });
      await expect(invoke(create)).resolves.toMatchObject({ relationshipId, outcomeCode: "replayed" });
      const update = { ...base, action: "update", expectedRevision: 1, influence: "high", preference: "Monthly review", correlationId: randomUUID(), idempotencyKey: randomUUID() };
      await expect(invoke(update)).resolves.toMatchObject({ relationshipId, influence: "high", revision: 2 });
      await expect(invoke({ ...update, correlationId: randomUUID(), idempotencyKey: randomUUID() })).rejects.toThrow("Relationship is stale");
    });
  }, 120000);
});
