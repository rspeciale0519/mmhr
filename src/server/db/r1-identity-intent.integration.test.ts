import { afterAll, beforeAll, describe, test } from "vitest";

import { startRehearsal, stopRehearsal, type RehearsalContext } from "./r1-migration-rehearsal";
import { adapterCases } from "./r1-identity-intent-adapter-cases";
import { concurrentIntentCases } from "./r1-identity-intent-concurrency-cases";
import { dispatchCases } from "./r1-identity-intent-dispatch-cases";
import { prepareWorkerFixtureRole } from "./r1-identity-intent-fixtures";
import { applyIdentityIntentMigrations, rehearseIdentityIntentMigration } from "./r1-identity-intent-migration-cases";
import { reconciliationCases } from "./r1-identity-intent-reconciliation-cases";
import { resultCases } from "./r1-identity-intent-result-cases";
import { createCommandFixture, rollbackCase, type SecurityCommandFixture } from "./r1-security-command-fixtures";

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
