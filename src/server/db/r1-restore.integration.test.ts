import { afterAll, describe, expect, test } from "vitest";

import {
  captureLegacySnapshot,
  restoreLegacySnapshot,
  seedLegacySnapshot,
} from "./r1-legacy-snapshot";
import {
  applyAllMigrations,
  applyBaselineMigration,
  type RehearsalContext,
  startRehearsal,
  stopRehearsal,
} from "./r1-migration-rehearsal";

describe("R1.2 local restore rehearsal", () => {
  let source: RehearsalContext | undefined;
  let target: RehearsalContext | undefined;

  afterAll(async () => {
    if (source) await stopRehearsal(source);
    if (target) await stopRehearsal(target);
  }, 300_000);

  test(
    "restores a baseline backup before the additive migration",
    async () => {
      source = await startRehearsal("restoresrc");
      await applyBaselineMigration(source);
      await seedLegacySnapshot(source);
      const backup = await captureLegacySnapshot(source);
      await stopRehearsal(source);
      source = undefined;

      target = await startRehearsal("restoredst");
      await applyBaselineMigration(target);
      await restoreLegacySnapshot(target, backup);
      await applyAllMigrations(target);

      const restored = await captureLegacySnapshot(target);
      expect(restored).toEqual(backup);

      const [identityCount] = await target.client<{ count: number }[]>`
        SELECT count(*)::integer AS count FROM identities
      `;
      expect(identityCount!.count).toBe(backup.authUsers.length);

      const [linkedMemberships] = await target.client<{ count: number }[]>`
        SELECT count(*)::integer AS count
        FROM org_members AS member
        INNER JOIN identities AS identity
          ON identity.id = member.identity_id
          AND identity.auth_user_id = member.user_id
      `;
      expect(linkedMemberships!.count).toBe(backup.members.length);

      const [migrationHistory] = await target.client<{ count: number }[]>`
        SELECT count(*)::integer AS count
        FROM drizzle.__drizzle_migrations
      `;
      expect(migrationHistory!.count).toBe(2);
    },
    600_000,
  );
});
