import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

import { startRehearsal, stopRehearsal, type RehearsalContext } from "./r1-migration-rehearsal";
import { adapterCases } from "./r1-identity-intent-adapter-cases";
import { concurrentIntentCases } from "./r1-identity-intent-concurrency-cases";
import { dispatchCases } from "./r1-identity-intent-dispatch-cases";
import { prepareWorkerFixtureRole } from "./r1-identity-intent-fixtures";
import { applyIdentityIntentMigrations, rehearseIdentityIntentMigration } from "./r1-identity-intent-migration-cases";
import { reconciliationCases } from "./r1-identity-intent-reconciliation-cases";
import { resultCases } from "./r1-identity-intent-result-cases";
import { asAuthenticated, createCommandFixture, rollbackCase, type SecurityCommandFixture } from "./r1-security-command-fixtures";

describe("R1.4 restricted identity intent worker SQL contract", () => {
  let context: RehearsalContext | undefined;
  let foundation: SecurityCommandFixture;

  beforeAll(async () => {
    context = await startRehearsal("intent");
    console.info("Identity intent scratch project:", context.projectId);
    await applyIdentityIntentMigrations(context);
    await prepareWorkerFixtureRole(context);
    foundation = await context.client.begin((sql) => createCommandFixture(sql));
  }, 240_000);

  afterAll(async () => {
    if (context) await stopRehearsal(context);
  }, 180_000);

  // All authorizations and evidence below are synthetic database fixtures.
  // They do not validate human identity or the unfinished public recovery flow.
  test("uses the database clock for modeled claims and still denies future-issued claims", async () => {
    await rollbackCase(context!, async (sql) => {
      const hostClock = vi.spyOn(Date, "now").mockReturnValue(Date.now() + 60_000);
      try {
        await asAuthenticated(sql, foundation.pair[0], async (runtime) => {
          expect(await runtime`SELECT * FROM public.mmhr_authorize('audit.view', NULL::uuid)`).toHaveLength(1);
          await runtime`SELECT set_config('request.jwt.claims',
            (auth.jwt() || jsonb_build_object('iat',
              floor(extract(epoch FROM clock_timestamp())) + 60))::text, true)`;
          expect(await runtime`SELECT * FROM public.mmhr_authorize('audit.view', NULL::uuid)`).toHaveLength(0);
        });
      } finally {
        hostClock.mockRestore();
      }
    });
  });
  for (const scenario of [...dispatchCases, ...resultCases, ...reconciliationCases, ...adapterCases]) {
    test(scenario.name, async () => {
      await rollbackCase(context!, (sql) => scenario.run(sql, foundation));
    });
  }

  for (const scenario of concurrentIntentCases) {
    test(scenario.name, async () => {
      await scenario.run(context!, foundation);
    });
  }
});

test("rolls back a failed0005 migration and restores legacy records into a fresh copied0000–0005 database", async () => {
  await rehearseIdentityIntentMigration();
}, 600_000);
