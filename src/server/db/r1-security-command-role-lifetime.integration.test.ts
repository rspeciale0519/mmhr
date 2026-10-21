import { afterAll, beforeAll, describe, test } from "vitest";

import { startRehearsal, stopRehearsal, type RehearsalContext } from "./r1-migration-rehearsal";
import {
  createCommandFixture,
  rollbackCase,
  type SecurityCommandFixture,
} from "./r1-security-command-fixtures";
import { applyRoleAuthorityMigrations } from "./r1-security-command-migration-cases";
import { verifyRoleSourceLifetime, verifyRoleVersionSourceLifetime } from "./r1-security-command-role-lifetime-cases";
import { roleSourceCases } from "./r1-security-command-role-source-cases";
import { denyRecoveryCases, denySourceCases } from "./r1-security-command-deny-source-cases";

describe("R1 delegated platform-role source lifetime", () => {
  let context: RehearsalContext | undefined;
  let fixture: SecurityCommandFixture;

  beforeAll(async () => {
    context = await startRehearsal("rolelife");
    await applyRoleAuthorityMigrations(context);
    fixture = await context.client.begin((sql) => createCommandFixture(sql));
  }, 240_000);

  afterAll(async () => {
    if (context) await stopRehearsal(context);
  }, 180_000);

  test.each(["revoked", "expired"] as const)(
    "removes delegated role authority after its original source is %s without replacement revival",
    async (loss) => {
      await rollbackCase(context!, (sql) => verifyRoleSourceLifetime(sql, fixture, loss));
    },
    40_000,
  );

  test.each(["revoked", "expired"] as const)(
    "removes delegated shared-version authority after its original source is %s without replacement revival",
    async (loss) => {
      await rollbackCase(context!, (sql) => verifyRoleVersionSourceLifetime(sql, fixture, loss));
    },
    40_000,
  );

  test.each([...roleSourceCases, ...denySourceCases, ...denyRecoveryCases])("%s", async (_name, verify) => {
    await rollbackCase(context!, (sql) => verify(sql, fixture));
  }, 40_000);
});
