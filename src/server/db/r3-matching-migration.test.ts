import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migration = readFileSync(join(process.cwd(), "drizzle", "0040_r3_deterministic_matching.sql"), "utf8");
const schema = readFileSync(join(process.cwd(), "src", "server", "db", "schema", "r3-matching.ts"), "utf8");

describe("R3 deterministic matching migration", () => {
  test("defines approved rule versions and scoped run snapshots", () => {
    expect(migration).toContain("CREATE TABLE public.matching_rule_sets");
    expect(migration).toContain("CREATE TABLE public.matching_runs");
    expect(migration).toContain("matching_rule_sets_scope_version_uq");
    expect(migration).toContain("matching_runs_intake_scope_fk");
    expect(migration).toContain("matching_rule_sets_approval_ck");
  });
  test("keeps raw tables closed and command execution fixed", () => {
    expect((migration.match(/AS RESTRICTIVE FOR ALL TO anon, authenticated USING \(false\) WITH CHECK \(false\)/g) ?? []).length).toBe(2);
    expect(migration).toContain("SET search_path = ''");
    expect(migration).toContain("r1_start_security_command('workspace.access'");
    expect(migration).toContain("r1_finish_security_command");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.mmhr_run_deterministic_matching");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.mmhr_run_deterministic_matching");
  });
  test("scores only approved requirements and published vendor facts", () => {
    expect(migration).toContain("rs.status = 'approved'");
    expect(migration).toContain("vf.status='published'");
    expect(migration).toContain("deterministic_score=score");
    expect(migration).toContain("scoring_configuration_version=v_rule_version");
  });
  test("keeps Drizzle rule and run constraints aligned", () => {
    for (const name of ["matching_rule_sets_organization_id_uq", "matching_rule_sets_scope_version_uq", "matching_rule_sets_version_ck", "matching_rule_sets_status_ck", "matching_rule_sets_rules_ck", "matching_rule_sets_approval_ck", "matching_runs_intake_scope_fk", "matching_runs_rule_scope_fk", "matching_runs_rule_version_ck", "matching_runs_count_ck", "matching_runs_snapshot_ck", "matching_runs_intake_time_idx"]) {
      expect(schema).toContain(name);
    }
  });
});
