import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { applyAllMigrations, startRehearsal, stopRehearsal, type RehearsalContext } from "./r1-migration-rehearsal";
import { asAuthenticated, createCommandFixture, createMembership, rollbackCase, type SecurityCommandFixture } from "./r1-security-command-fixtures";

describe("R2B deal RPC", () => {
  let context: RehearsalContext | undefined;
  let fixture: SecurityCommandFixture;
  let vendorOrganizationId: string;
  beforeAll(async () => {
    context = await startRehearsal("r2b-deal");
    await applyAllMigrations(context);
    fixture = await context.client.begin(async (sql) => {
      const f = await createCommandFixture(sql);
      const [vendor] = await sql<{ id: string }[]>`INSERT INTO public.orgs (name,type,status,activated_at,migration_review_required) VALUES ('Deal vendor','vendor','active',now(),false) RETURNING id`;
      vendorOrganizationId = vendor!.id;
      await createMembership(sql, vendorOrganizationId, f.organizationAdmin, "organization_admin");
      return f;
    });
  }, 240000);
  afterAll(async () => { if (context) await stopRehearsal(context); }, 180000);
  test("creates, replays, transitions, and rejects stale transitions", async () => {
    await rollbackCase(context!, async (sql) => {
      const invoke = async (payload: Record<string, unknown>) => asAuthenticated(sql, fixture.pair[0], async (probe) => {
        const [row] = await probe<{ result: Record<string, unknown> }[]>`SELECT public.mmhr_record_deal(${JSON.stringify(payload)}::jsonb,${String(payload.correlationId)}::uuid,${String(payload.idempotencyKey)}::uuid) AS result`;
        return row!.result;
      });
      const dealId = randomUUID();
      const base = { organizationId: fixture.organizationId, actorIdentityId: fixture.pair[0].identityId, dealId };
      const create = { ...base, action: "create", vendorOrganizationId, productId: null, ownerIdentityId: fixture.pair[0].identityId, stage: "lead", status: "open", expectedCloseAt: null, correlationId: randomUUID(), idempotencyKey: randomUUID() };
      await expect(invoke(create)).resolves.toMatchObject({ dealId, stage: "lead", status: "open", revision: 1 });
      await expect(invoke(create)).resolves.toMatchObject({ dealId, outcomeCode: "replayed" });
      const transition = { ...base, action: "transition", fromStage: "lead", toStage: "discovery", fromStatus: "open", toStatus: "open", expectedRevision: 1, occurredAt: "2026-09-03T00:00:00Z", reason: "Qualify opportunity", correlationId: randomUUID(), idempotencyKey: randomUUID() };
      await expect(invoke(transition)).resolves.toMatchObject({ dealId, stage: "discovery", revision: 2 });
      await expect(invoke({ ...transition, correlationId: randomUUID(), idempotencyKey: randomUUID() })).rejects.toThrow("Deal transition is stale");
    });
  }, 120000);
});
