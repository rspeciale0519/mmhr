import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

const migration = readFileSync(join(process.cwd(), "drizzle", "0019_r5_ai_run_records.sql"), "utf8");
const commandMigration = readFileSync(join(process.cwd(), "drizzle", "0087_r5_ai_run_commands.sql"), "utf8");
const evaluationMigration = readFileSync(join(process.cwd(), "drizzle", "0088_r5_ai_evaluation_records.sql"), "utf8");
const runSchema = readFileSync(join(process.cwd(), "src", "server", "db", "schema", "ai-run.ts"), "utf8");
const evaluationSchema = readFileSync(join(process.cwd(), "src", "server", "db", "schema", "ai-evaluation.ts"), "utf8");

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

  test("keeps the Drizzle run schema aligned with SQL checks and foreign keys", () => {
    for (const constraint of ["ai_runs_identifier_ck", "ai_runs_failure_ck", "ai_run_history_run_scope_fk"]) {
      expect(runSchema).toContain(constraint);
    }
    expect(runSchema).toContain("createdByIdentityId: uuid(\"created_by_identity_id\").references(() => identities.id");
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

  test("adds the creator reference without breaking existing rows", () => {
    expect(commandMigration).toContain("ADD COLUMN created_by_identity_id uuid");
    expect(commandMigration).not.toContain("created_by_identity_id uuid NOT NULL");
    expect(commandMigration).toContain("REFERENCES public.identities(id) ON DELETE RESTRICT");
  });

  test("exposes one audited authenticated command with replay protection", () => {
    expect(commandMigration).toContain("CREATE OR REPLACE FUNCTION public.mmhr_record_ai_run");
    expect(commandMigration).toContain("r5.ai_run.' || v_action");
    expect(commandMigration).toContain("r1_checked_receipt");
    expect(commandMigration).toContain("REVOKE ALL ON FUNCTION public.mmhr_record_ai_run");
    expect(commandMigration).toContain("GRANT EXECUTE ON FUNCTION public.mmhr_record_ai_run");
  });

  test("stores only hashed provider-evaluation evidence with platform approval", () => {
    expect(evaluationMigration).toContain("CREATE TABLE public.ai_evaluation_runs");
    expect(evaluationMigration).toContain("report_hash text NOT NULL");
    expect(evaluationMigration).toContain("CREATE OR REPLACE FUNCTION public.mmhr_record_ai_evaluation");
    expect(evaluationMigration).toContain("'admin.access'");
    expect(evaluationMigration).toContain("r5.ai.evaluation.");
    expect(evaluationMigration).toContain("REVOKE ALL ON TABLE public.ai_evaluation_runs");
  });

  test("keeps the Drizzle evaluation schema aligned with SQL checks and identity references", () => {
    for (const constraint of ["ai_evaluation_runs_capability_ck", "ai_evaluation_runs_data_class_ck", "ai_evaluation_runs_identifier_ck", "ai_evaluation_runs_fixture_count_ck"]) {
      expect(evaluationSchema).toContain(constraint);
    }
    expect(evaluationSchema).toContain("createdByIdentityId: uuid(\"created_by_identity_id\").notNull().references(() => identities.id");
    expect(evaluationSchema).toContain("reviewedByIdentityId: uuid(\"reviewed_by_identity_id\").references(() => identities.id");
  });
});
