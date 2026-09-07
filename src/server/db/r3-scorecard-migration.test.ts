import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

const migration = readFileSync(join(process.cwd(), "drizzle", "0017_r3_scorecard_persistence.sql"), "utf8");
const schema = readFileSync(join(process.cwd(), "src", "server", "db", "schema", "r3-scorecard.ts"), "utf8");

describe("R3 scorecard migration review", () => {
  test("creates scorecards, criteria, current entries, and immutable history", () => {
    for (const table of ["scorecards", "scorecard_criteria", "scorecard_entries", "scorecard_entry_history"]) {
      expect(migration).toContain(`CREATE TABLE public.${table}`);
    }
  });

  test("enables row-level security on every scorecard table", () => {
    for (const table of ["scorecards", "scorecard_criteria", "scorecard_entries", "scorecard_entry_history"]) {
      expect(migration).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
    }
  });

  test("revokes raw access for all runtime roles", () => {
    expect(migration).toContain("REVOKE ALL ON TABLE");
    expect(migration).toContain("FROM PUBLIC, anon, authenticated, service_role, mmhr_worker");
  });

  test("installs restrictive deny policies for every scorecard table", () => {
    const policyCount = (migration.match(/AS RESTRICTIVE FOR ALL TO anon, authenticated USING \(false\) WITH CHECK \(false\)/g) ?? []).length;
    expect(policyCount).toBe(4);
  });

  test("binds scorecards to the same organization, intake, and candidate", () => {
    expect(migration).toContain("scorecards_intake_scope_fk");
    expect(migration).toContain("scorecards_candidate_scope_fk");
    expect(migration).toContain("evaluation_candidates_organization_id_id_uq");
    expect(migration).toContain("REFERENCES public.evaluation_candidates (organization_id, id)");
  });

  test("keeps weighted criteria and scorer entries unique and bounded", () => {
    expect(migration).toContain("scorecard_criteria_scope_key_uq");
    expect(migration).toContain("scorecard_entries_scorer_criterion_uq");
    expect(migration).toContain("scorecard_entries_value_ck");
    expect(migration).toContain("scorecard_entries_criterion_scope_fk");
  });

  test("preserves replacement history without destructive overwrites", () => {
    expect(migration).toContain("scorecard_entry_history");
    expect(migration).toContain("scorecard_entry_history_scope_time_idx");
    expect(migration).toContain("immutable scorer entry history");
  });

  test("limits scorecard state and configuration versions", () => {
    expect(migration).toContain("scorecards_status_ck");
    expect(migration).toContain("scorecards_configuration_version_ck");
    expect(migration).toContain("scorecards_revision_ck");
    expect(migration).toContain("scorecards_candidate_uq");
  });

  test("keeps Drizzle scorecard scope and evidence constraints aligned", () => {
    for (const name of ["scorecards_intake_scope_fk", "scorecards_candidate_scope_fk", "scorecard_criteria_scorecard_scope_fk", "scorecard_entries_scorecard_scope_fk", "scorecard_entries_criterion_scope_fk", "scorecard_entries_evidence_ck", "scorecard_entry_history_scorecard_scope_fk", "scorecard_entry_history_criterion_scope_fk", "scorecard_entry_history_evidence_ck"]) {
      expect(schema).toContain(name);
    }
  });
});
