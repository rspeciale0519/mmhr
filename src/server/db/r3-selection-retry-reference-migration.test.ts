import { readFileSync } from "node:fs";
import { afterEach, describe, expect, test, vi } from "vitest";
import { applyMigrationsBeforeSelectionRetry, type RehearsalContext } from "./r1-migration-rehearsal";

const original = readFileSync("drizzle/0120_r3_initial_selection_commands.sql", "utf8").replace(/\r\n/g, "\n");
const migration = readFileSync("drizzle/0171_r3_selection_retry_reference.sql", "utf8").replace(/\r\n/g, "\n");
const declaration = "CREATE OR REPLACE FUNCTION mmhr_private.r3_initial_selection_result(";

function selectionResult(source: string): string {
  const start = source.indexOf(declaration);
  const end = source.indexOf("\n$$;", start);
  if (start < 0 || end < 0) throw new Error("Selection result function is missing");
  return source.slice(start, end + "\n$$;".length);
}

describe("selection retry reference migration", () => {
  afterEach(() => vi.unstubAllEnvs());

  test("refuses to migrate an unowned rehearsal", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("R1_MIGRATION_REHEARSAL", "1");
    await expect(applyMigrationsBeforeSelectionRetry({} as RehearsalContext))
      .rejects.toThrow("An active owned selection-history rehearsal is required");
  });

  test("changes only the returned request reference", () => {
    const originalFunction = selectionResult(original);
    const originalReference = "'correlationId', correlation_id";
    expect(originalFunction.split(originalReference)).toHaveLength(2);
    expect(selectionResult(migration)).toBe(originalFunction.replace(originalReference, "'correlationId', $3"));
    expect(migration.replace(/^--.*$/gm, "").trim()).toBe(selectionResult(migration));
  });

  test("is registered after the previous migration", () => {
    const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8")) as {
      entries: Array<{ idx: number; tag: string }>;
    };
    const entry = journal.entries.find((item) => item.tag === "0171_r3_selection_retry_reference");
    expect(entry?.idx).toBe(171);
    expect(journal.entries.filter((item) => item.idx === 171)).toHaveLength(1);
  });
});
