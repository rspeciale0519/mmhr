import { afterEach, expect, test, vi } from "vitest";
import { assertRestrictedRehearsal, startRestrictedRehearsal, type RestrictedRehearsal } from "./r1-migration-rehearsal";
import { createTestMigrationOwner } from "./test/migration-owner";
import { createPermissionFixtures } from "@/server/auth/permission-test-fixtures";

afterEach(() => vi.unstubAllEnvs());

test.each(["https://example.invalid", "http://127.0.0.1:57021"])(
  "does not accept caller-created rehearsal credentials for %s", (url) => {
    vi.stubEnv("NODE_ENV", "test");
    const forged = { context: { api: { url, publicKey: "fixture", adminKey: "fixture" },
      apiLoopbackOnly: true, databaseUrl: "caller-selected-database" }, workerUrl: "caller-selected-worker",
      close: async () => {} } as unknown as RestrictedRehearsal;
    expect(() => assertRestrictedRehearsal(forged)).toThrow("active guarded security rehearsal");
    expect(() => createPermissionFixtures(forged)).toThrow("active guarded security rehearsal");
    expect(() => createTestMigrationOwner(forged)).toThrow("active guarded security rehearsal");
  },
);

test("refuses the security fixture lifecycle outside test mode", async () => {
  vi.stubEnv("NODE_ENV", "production");
  await expect(startRestrictedRehearsal("fixture")).rejects.toThrow("Security rehearsals are test-only");
});
