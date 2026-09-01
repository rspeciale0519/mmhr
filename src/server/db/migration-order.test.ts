import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

const migrationsDirectory = join(process.cwd(), "drizzle");

describe("migration ordering", () => {
  test("does not recreate the CRM product scope index in R3", () => {
    const migration = readFileSync(
      join(migrationsDirectory, "0013_r3_intake_matching_foundation.sql"),
      "utf8",
    );

    expect(migration).not.toContain("CREATE UNIQUE INDEX products_organization_id_id_uq");
  });

  test("keeps migration filenames unique and sequential", () => {
    const names = readdirSync(migrationsDirectory)
      .filter((name) => /^\d{4}_.+\.sql$/.test(name))
      .sort();
    const indices = names.map((name) => Number(name.slice(0, 4)));

    expect(new Set(indices).size).toBe(indices.length);
    expect(indices).toEqual(indices.map((_, index) => index));
  });
});
