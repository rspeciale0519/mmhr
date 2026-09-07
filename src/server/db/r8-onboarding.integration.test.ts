import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { applyAllMigrations, startRehearsal, stopRehearsal, type RehearsalContext } from "./r1-migration-rehearsal";
import { asAuthenticated, createCommandFixture, rollbackCase, type SecurityCommandFixture } from "./r1-security-command-fixtures";

describe("R8 onboarding RPC", () => {
  let context: RehearsalContext | undefined;
  let fixture: SecurityCommandFixture;
  let dealId: string;

  beforeAll(async () => {
    context = await startRehearsal("r8-onboarding");
    await applyAllMigrations(context);
    fixture = await context.client.begin(async (sql) => {
      const f = await createCommandFixture(sql);
      const [deal] = await sql<{ id: string }[]>`
        INSERT INTO public.deals (organization_id, owner_identity_id, stage, status)
        VALUES (${f.organizationId}::uuid, ${f.pair[0].identityId}::uuid, 'contracting', 'open') RETURNING id
      `;
      dealId = deal!.id;
      return f;
    });
  }, 240_000);

  afterAll(async () => {
    if (context) await stopRehearsal(context);
  }, 180_000);

  test("creates, transitions, reactivates, and replays onboarding", async () => {
    await rollbackCase(context!, async (sql) => {
      const invoke = async (payload: Record<string, unknown>) => asAuthenticated(sql, fixture.pair[0], async (probe) => {
        const [row] = await probe<{ result: Record<string, unknown> }[]>`
          SELECT public.mmhr_record_onboarding(${JSON.stringify(payload)}::jsonb,${String(payload.correlationId)}::uuid,${String(payload.idempotencyKey)}::uuid) AS result
        `;
        return row!.result;
      });
      const onboardingId = randomUUID();
      const milestoneId = randomUUID();
      const common = { onboardingId, organizationId: fixture.organizationId, actorIdentityId: fixture.pair[0].identityId };
      const create = {
        ...common, action: "create", dealId, ownerIdentityId: fixture.pair[0].identityId,
        targetGoLiveAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        milestones: [{ milestoneId, title: "Configure SSO", ownerIdentityId: fixture.pair[0].identityId, dueAt: new Date(Date.now() + 3 * 86_400_000).toISOString(), status: "pending", completedAt: null }],
        checkIns: [], risks: [], correlationId: randomUUID(), idempotencyKey: randomUUID(),
      };
      await expect(invoke(create)).resolves.toMatchObject({ onboardingId, status: "planned", revision: 1, outcomeCode: "recorded" });
      await expect(invoke(create)).resolves.toMatchObject({ onboardingId, outcomeCode: "replayed" });
      const transition = (fromStatus: string, toStatus: string, expectedRevision: number, failureReason: string | null, approvalReference: string | null) => ({ ...common, action: "transition", fromStatus, toStatus, expectedRevision, occurredAt: new Date().toISOString(), reason: `Move to ${toStatus}`, failureReason, approvalReference, correlationId: randomUUID(), idempotencyKey: randomUUID() });
      await expect(invoke(transition("planned", "active", 1, null, null))).resolves.toMatchObject({ status: "active", revision: 2 });
      await expect(invoke(transition("active", "failed", 2, "Vendor access was delayed.", null))).resolves.toMatchObject({ status: "failed", revision: 3 });
      await expect(invoke(transition("failed", "reactivated", 3, null, randomUUID()))).resolves.toMatchObject({ status: "reactivated", revision: 4 });
    });
  }, 120_000);
});
