import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const migration = readFileSync(join(process.cwd(), "drizzle", "0034_r3_scorecard_entry_commands.sql"), "utf8");

describe("R3 scorecard entry command migration review", () => {
  test("uses a fixed security-definer RPC and closes raw scorecard tables", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.mmhr_record_scorecard_entry");
    expect(migration).toContain("SECURITY DEFINER SET search_path = ''");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.mmhr_record_scorecard_entry");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.mmhr_record_scorecard_entry(jsonb,uuid,uuid) TO authenticated");
  });

  test("enforces input bounds and scorer identity binding", () => {
    expect(migration).toContain("Invalid scorecard entry input");
    expect(migration).toContain("jsonb_array_length(evidence_references) > 50");
    expect(migration).toContain("scorer_id <> context.actor_identity_id");
    expect(migration).toContain("Score entry precedes scorecard creation");
  });

  test("preserves immutable history and optimistic revisions", () => {
    expect(migration).toContain("INSERT INTO public.scorecard_entry_history");
    expect(migration).toContain("scorecard.revision <> expected_revision");
    expect(migration).toContain("sc.revision + 1");
    expect(migration).toContain("r3.scorecard.entry.record");
  });
});
