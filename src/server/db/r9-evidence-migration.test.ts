import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

const migration = readFileSync(join(process.cwd(), "drizzle", "0023_r9_evidence_persistence.sql"), "utf8");

describe("R9 evidence persistence migration review", () => {
  test("creates bounded deletion and operational evidence tables", () => {
    for (const table of ["deletion_requests", "deletion_decisions", "availability_observations", "performance_measurements"]) {
      expect(migration).toContain(`CREATE TABLE public.${table}`);
    }
  });

  test("enables RLS and revokes raw access for every table", () => {
    expect((migration.match(/ENABLE ROW LEVEL SECURITY/g) ?? []).length).toBe(4);
    expect(migration).toContain("FROM PUBLIC, anon, authenticated, service_role, mmhr_worker");
  });

  test("installs restrictive deny policies for every table", () => {
    expect((migration.match(/AS RESTRICTIVE FOR ALL TO anon, authenticated USING \(false\) WITH CHECK \(false\)/g) ?? []).length).toBe(4);
  });

  test("bounds deletion deadlines, holds, and retention", () => {
    expect(migration).toContain("deletion_requests_due_ck");
    expect(migration).toContain("deletion_requests_retention_ck");
    expect(migration).toContain("deletion_decisions_scope_fk");
    expect(migration).toContain("deletion_decisions_request_uq");
  });

  test("bounds availability observations for SLO calculation", () => {
    expect(migration).toContain("availability_observations_duration_ck");
    expect(migration).toContain("availability_observations_outcome_ck");
    expect(migration).toContain("availability_observations_source_ck");
  });

  test("bounds route performance evidence and prevents duplicate samples", () => {
    expect(migration).toContain("performance_measurements_route_ck");
    expect(migration).toContain("performance_measurements_sample_ck");
    expect(migration).toContain("performance_measurements_lcp_ck");
    expect(migration).toContain("performance_measurements_inp_ck");
    expect(migration).toContain("performance_measurements_route_time_uq");
  });

  test("keeps all evidence organization-scoped and redacted", () => {
    expect((migration.match(/organization_id uuid NOT NULL REFERENCES public.orgs/g) ?? []).length).toBe(4);
    expect(migration).toContain("no raw user content");
    expect(migration).toContain("ON DELETE RESTRICT");
  });

  test("records indexes for due work and evidence windows", () => {
    expect(migration).toContain("deletion_requests_due_status_idx");
    expect(migration).toContain("availability_observations_service_time_idx");
    expect(migration).toContain("performance_measurements_route_time_uq");
  });
});
