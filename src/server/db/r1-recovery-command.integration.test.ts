import { afterAll, beforeAll, describe, test } from "vitest";

import { prepareRecoveryPolicy, prepareWorkerFixtureRole } from "./r1-identity-intent-fixtures";
import { startRehearsal, stopRehearsal, type RehearsalContext } from "./r1-migration-rehearsal";
import { createCommandFixture, rollbackCase, type SecurityCommandFixture } from "./r1-security-command-fixtures";
import { applyRoleRevocationAuthorityMigrations } from "./r1-security-command-migration-cases";
import { recoveryPresenceCases } from "./r1-recovery-command-presence-cases";
import { recoveryAccessCases } from "./r1-recovery-command-access-cases";
import { recoveryAtomicCases } from "./r1-recovery-command-atomic-cases";
import { recoveryDecisionCases } from "./r1-recovery-command-decision-cases";
import { recoveryEndCases } from "./r1-recovery-command-end-cases";
import { recoveryRequestCases } from "./r1-recovery-command-request-cases";
import { verifyConcurrentRecoveryApproval, verifyRecoveryCancellationDispatchRace } from "./r1-recovery-command-concurrency-cases";

describe("R1 public recovery commands", () => {
  let context: RehearsalContext | undefined;
  let foundation: SecurityCommandFixture;

  beforeAll(async () => {
    context = await startRehearsal("intentrecovery");
    await applyRoleRevocationAuthorityMigrations(context);
    console.info("Recovery command rehearsal copied and applied the reviewed 0000-0008 prefix.");
    await prepareWorkerFixtureRole(context);
    foundation = await context.client.begin((sql) => createCommandFixture(sql));
  }, 240_000);

  afterAll(async () => {
    if (context) await stopRehearsal(context);
  }, 180_000);

  test.each([...recoveryPresenceCases, ...recoveryRequestCases, ...recoveryDecisionCases,
    ...recoveryEndCases, ...recoveryAccessCases, ...recoveryAtomicCases])("$name", async (testCase) => {
    await rollbackCase(context!, async (sql) => {
      if (testCase.preparePolicy !== false) await prepareRecoveryPolicy(sql, foundation);
      await testCase.run(sql, foundation);
    });
  }, 40_000);

  test.each([true, false])("serializes concurrent approvals with identical idempotency keys: %s", async (sameKey) => {
    await verifyConcurrentRecoveryApproval(context!, foundation, sameKey);
  }, 40_000);

  test("lets cancellation commit before a waiting worker without dispatching the cancelled reset", async () => {
    await verifyRecoveryCancellationDispatchRace(context!, foundation, "cancel");
  }, 40_000);

  // A winning dispatch intentionally leaves containment active. It is the
  // final case, and the disposable-stack cleanup removes its synthetic state.
  test("lets dispatch commit before a waiting cancellation and keeps the target contained", async () => {
    await verifyRecoveryCancellationDispatchRace(context!, foundation, "dispatch");
  }, 40_000);
});
