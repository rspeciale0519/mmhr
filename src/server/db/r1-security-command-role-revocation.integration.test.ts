import { afterAll, beforeAll, describe, test } from "vitest";

import { startRehearsal, stopRehearsal, type RehearsalContext } from "./r1-migration-rehearsal";
import { createCommandFixture, rollbackCase, type SecurityCommandFixture } from "./r1-security-command-fixtures";
import { applyRoleRevocationAuthorityMigrations } from "./r1-security-command-migration-cases";
import { verifyRoleRevocationSourceLifetime } from "./r1-security-command-role-revocation-cases";

describe("R1 role-assignment deny-removal source lifetime", () => {
  let context: RehearsalContext | undefined;
  let fixture: SecurityCommandFixture;

  beforeAll(async () => {
    context = await startRehearsal("rolerevoke");
    await applyRoleRevocationAuthorityMigrations(context);
    fixture = await context.client.begin((sql) => createCommandFixture(sql));
  }, 240_000);

  afterAll(async () => {
    if (context) await stopRehearsal(context);
  }, 180_000);

  test.each(["revoked", "expired"] as const)(
    "preserves the role-deny removal guard after its original source is %s until a fresh explicit grant",
    async (loss) => {
      await rollbackCase(context!, (sql) => verifyRoleRevocationSourceLifetime(sql, fixture, loss));
    },
    40_000,
  );
});
