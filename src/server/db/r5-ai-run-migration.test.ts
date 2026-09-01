import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

const migration = readFileSync(join(process.cwd(), "drizzle", "0019_r5_ai_run_records.sql"), "utf8");

describe("R5 AI run-record migration review", () => {
  test("creates current run and append-only history tables", () => {
    expect(migration).toContain("CREATE TABLE public.ai_runs");
    expect(migration).toContain("CREATE TABLE public.ai_run_history");
  });

  test("enables row-level security and revokes raw access", () => {
    expect(migration).toContain("ALTER TABLE public.ai_runs ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("ALTER TABLE public.ai_run_history ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("FROM PUBLIC, anon, authenticated, service_role, mmhr_worker");
  });

  test("installs restrictive deny policies", () => {
    const policyCount = (migration.match(/AS RESTRICTIVE FOR ALL TO anon, authenticated USING \(false\) WITH CHECK \(false\)/g) ?? []).length;
    expect(policyCount).toBe(2);
  });

  test("stores identifiers and hashes instead of raw provider payloads", () => {
    expect(migration).toContain("input_artifacts jsonb");
    expect(migration).toContain("output_hash text");
    expect(migration).toContain("provider payloads are never stored in these tables");
  });

  test("bounds capabilities, data classes, statuses, and review decisions", () => {
    expect(migration).toContain("ai_runs_capability_ck");
    expect(migration).toContain("ai_runs_data_class_ck");
    expect(migration).toContain("ai_runs_status_ck");
    expect(migration).toContain("ai_runs_review_ck");
  });

  test("keeps usage, hashes, arrays, and timestamps valid", () => {
    expect(migration).toContain("ai_runs_usage_ck");
    expect(migration).toContain("ai_runs_hash_ck");
    expect(migration).toContain("ai_runs_arrays_ck");
    expect(migration).toContain("ai_runs_time_ck");
  });

  test("preserves organization scope and unique run revisions", () => {
    expect(migration).toContain("ai_runs_organization_id_run_uq");
    expect(migration).toContain("ai_run_history_run_scope_fk");
    expect(migration).toContain("FOREIGN KEY (organization_id, run_id)");
    expect(migration).toContain("ai_run_history_run_revision_uq");
  });

  test("documents immutable approval history", () => {
    expect(migration).toContain("R5 append-only AI run status and approval history");
    expect(migration).toContain("reviewer_id");
    expect(migration).toContain("approval_reference");
  });
});
