import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";

import {
  applyAllMigrations,
  startRehearsal,
  stopRehearsal,
  type RehearsalContext,
} from "./r1-migration-rehearsal";
import {
  asAuthenticated,
  createCommandFixture,
  rollbackCase,
  type SecurityCommandFixture,
} from "./r1-security-command-fixtures";

describe("R9 operational evidence RPC", () => {
  let context: RehearsalContext | undefined;
  let fixture: SecurityCommandFixture;

  beforeAll(async () => {
    context = await startRehearsal("r9-operational-evidence");
    await applyAllMigrations(context);
    fixture = await context.client.begin((sql) => createCommandFixture(sql));
  }, 240_000);

  afterAll(async () => {
    if (context) await stopRehearsal(context);
  }, 180_000);

  test("records, replays, and scopes availability and performance evidence", async () => {
    await rollbackCase(context!, async (sql) => {
      const invoke = async (payload: Record<string, unknown>, key: string) =>
        asAuthenticated(sql, fixture.pair[0], async (probe) => {
          const [row] = await probe<{ result: Record<string, unknown> }[]>`
            SELECT public.mmhr_record_operational_evidence(
              ${JSON.stringify(payload)}::jsonb,
              ${randomUUID()}::uuid,
              ${key}::uuid
            ) AS result
          `;
          return row!.result;
        });

      const availabilityKey = randomUUID();
      const availability = {
        kind: "availability",
        observationId: randomUUID(),
        organizationId: fixture.organizationId,
        actorIdentityId: fixture.pair[0].identityId,
        serviceId: "web:primary",
        observedAt: new Date().toISOString(),
        durationSeconds: 60,
        outcome: "available",
        maintenance: false,
        source: "synthetic",
      };
      await expect(invoke(availability, availabilityKey)).resolves.toMatchObject({
        evidenceId: availability.observationId,
        kind: "availability",
        outcomeCode: "recorded",
      });
      await expect(invoke(availability, availabilityKey)).resolves.toMatchObject({ outcomeCode: "replayed" });

      const performance = {
        kind: "performance",
        measurementId: randomUUID(),
        organizationId: fixture.organizationId,
        actorIdentityId: fixture.pair[0].identityId,
        route: "/sign-in",
        measuredAt: new Date().toISOString(),
        sampleCount: 50,
        lcpP75Ms: 1800,
        inpP75Ms: 120,
      };
      await expect(invoke(performance, randomUUID())).resolves.toMatchObject({
        evidenceId: performance.measurementId,
        kind: "performance",
        outcomeCode: "recorded",
      });

      await expect(invoke({ ...availability, organizationId: randomUUID() }, randomUUID()))
        .rejects.toThrow();
    });
  }, 120_000);
});
