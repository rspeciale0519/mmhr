import { afterAll, beforeAll, describe, test } from "vitest";

import { prepareWorkerFixtureRole } from "./r1-identity-intent-fixtures";
import { startRehearsal, stopRehearsal, type RehearsalContext } from "./r1-migration-rehearsal";
import { recoveryMfaCases } from "./r1-recovery-mfa-cases";
import { recoveryMfaRegistrationCases } from "./r1-recovery-mfa-registration-cases";
import { recoveryMfaReactivationCases } from "./r1-recovery-mfa-reactivation-cases";
import { recoveryMfaConcurrencyCases } from "./r1-recovery-mfa-concurrency-cases";
import { rehearseRecoveryMfaMigration } from "./r1-recovery-mfa-migration-cases";
import { applyRecoveryMfaPrefix, readRecoveryMfaPrefix } from "./r1-recovery-mfa-prefix";
import { createCommandFixture, rollbackCase, type SecurityCommandFixture } from "./r1-security-command-fixtures";

describe("R1 bound recovery MFA", () => {
  let context: RehearsalContext | undefined;
  let foundation: SecurityCommandFixture;

  beforeAll(async () => {
    const prefix = await readRecoveryMfaPrefix();
    console.info("Recovery MFA source captured in memory before scratch startup: reviewed 0000–0009 only.");
    context = await startRehearsal("intentmfa");
    await applyRecoveryMfaPrefix(context, prefix);
    await prepareWorkerFixtureRole(context);
    foundation = await context.client.begin(createCommandFixture);
  }, 240_000);

  afterAll(async () => {
    if (context) {
      const projectId = context.projectId;
      await stopRehearsal(context);
      console.info("Recovery MFA exact scratch cleanup completed:", projectId);
    }
  }, 180_000);

  test.each([...recoveryMfaCases, ...recoveryMfaRegistrationCases, ...recoveryMfaReactivationCases])("$name", async (testCase) => {
    await rollbackCase(context!, (sql) => testCase.run(sql, foundation));
  }, 40_000);

  test.each(recoveryMfaConcurrencyCases)("$name", async (testCase) => {
    await testCase.run(context!, foundation);
  }, 45_000);
});

test("rehearses the recovery MFA migration failure, retry, and synthetic restore", rehearseRecoveryMfaMigration, 600_000);
