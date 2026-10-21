import { afterAll, beforeAll, describe, test } from "vitest";
import { createCommandFixture, type SecurityCommandFixture } from "./r1-security-command-fixtures";
import { startRehearsal, stopRehearsal, type RehearsalContext } from "./r1-migration-rehearsal";
import {
  closeIdentityWorker, openIdentityWorker, type IdentityWorker,
} from "./r1-identity-worker-fixtures";
import {
  applyIdentityWorkerPrefix, readIdentityWorkerPrefix, type IdentityWorkerPrefix,
} from "./r1-identity-worker-prefix";
import { identityWorkerCandidateCases } from "./r1-identity-worker-candidate-cases";
import { identityWorkerAccessCases } from "./r1-identity-worker-access-cases";
import { identityWorkerRaceCases } from "./r1-identity-worker-race-cases";
import { rehearseIdentityWorkerMigration } from "./r1-identity-worker-migration-cases";

describe("R1 identity worker discovery on an isolated exact 0000–0010 prefix", () => {
  let context: RehearsalContext | undefined;
  let worker: IdentityWorker | undefined;
  let foundation: SecurityCommandFixture;
  let prefix: IdentityWorkerPrefix;

  beforeAll(async () => {
    prefix = await readIdentityWorkerPrefix();
    context = await startRehearsal("worker");
    console.info("Identity worker discovery scratch project:", context.projectId);
    await applyIdentityWorkerPrefix(context, prefix);
    foundation = await context.client.begin((sql) => createCommandFixture(sql));
    worker = await openIdentityWorker(context);
  }, 240_000);

  afterAll(async () => {
    if (!context) return;
    try { if (worker) await closeIdentityWorker(context, worker); }
    finally { await stopRehearsal(context); }
  }, 180_000);

  for (const scenario of [...identityWorkerCandidateCases, ...identityWorkerRaceCases, ...identityWorkerAccessCases]) {
    test(scenario.name, async () => { await scenario.run(context!, worker!, foundation); }, 60_000);
  }

  test("rolls back a failed0010 and preserves the previous worker commands after forward recovery", async () => {
    await rehearseIdentityWorkerMigration(prefix);
  }, 600_000);
});
