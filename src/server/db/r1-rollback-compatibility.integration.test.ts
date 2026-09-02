import { afterAll, beforeAll, describe, expect, test } from "vitest";

import {
  captureLegacySnapshot,
  type LegacySnapshot,
  seedLegacySnapshot,
} from "./r1-legacy-snapshot";
import {
  applyAllMigrations,
  applyBaselineMigration,
  type RehearsalContext,
  startRehearsal,
  stopRehearsal,
} from "./r1-migration-rehearsal";

describe("R1.4 read-only application rollback compatibility", () => {
  let context: RehearsalContext | undefined;
  let beforeMigration: LegacySnapshot;
  let afterMigration: LegacySnapshot;

  beforeAll(async () => {
    context = await startRehearsal("rollback");
    await applyBaselineMigration(context);
    await seedLegacySnapshot(context);
    beforeMigration = await captureLegacySnapshot(context);
    await applyAllMigrations(context);
    afterMigration = await captureLegacySnapshot(context);
  }, 300_000);

  afterAll(async () => {
    if (context) await stopRehearsal(context);
  }, 180_000);

  test("preserves every original column and value", () => {
    expect(afterMigration).toEqual(beforeMigration);
  });

  test("keeps the legacy admin value while mapping it for review", async () => {
    expect(beforeMigration.members).toHaveLength(1);
    expect(beforeMigration.members[0]!.role).toBe("admin");

    const [member] = await context!.client<
      {
        role: string;
        role_key: string;
        migration_review_required: boolean;
      }[]
    >`
      SELECT role, role_key, migration_review_required
      FROM org_members
      WHERE id = ${beforeMigration.members[0]!.id}
    `;
    expect(member).toEqual({
      role: "admin",
      role_key: "organization_admin",
      migration_review_required: true,
    });
  });

  test("records all additive migrations", async () => {
    const [history] = await context!.client<{ count: number }[]>`
      SELECT count(*)::integer AS count
      FROM drizzle.__drizzle_migrations
    `;
    expect(history!.count).toBe(27);
  });
});
