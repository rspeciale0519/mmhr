import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

const migration = readFileSync(join(process.cwd(), "drizzle", "0014_r2b_activity_task_foundation.sql"), "utf8");

describe("R2B activity and task migration review", () => {
  test("creates every required CRM activity table", () => {
    for (const table of ["crm_activities", "crm_tasks", "crm_task_state_history"]) {
      expect(migration).toContain(`CREATE TABLE public.${table}`);
    }
  });

  test("enables row-level security on every CRM activity table", () => {
    for (const table of ["crm_activities", "crm_tasks", "crm_task_state_history"]) {
      expect(migration).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
    }
  });

  test("revokes raw access before reviewed command functions exist", () => {
    expect(migration).toContain("REVOKE ALL ON TABLE public.crm_activities");
    expect(migration).toContain("service_role, mmhr_worker");
  });

  test("installs restrictive deny policies for anonymous and authenticated roles", () => {
    const policyCount = (migration.match(/AS RESTRICTIVE FOR ALL TO anon, authenticated USING \(false\) WITH CHECK \(false\)/g) ?? []).length;
    expect(policyCount).toBe(3);
  });

  test("enforces task organization scope in transition history", () => {
    expect(migration).toContain("crm_task_state_history_task_scope_fk");
    expect(migration).toContain("REFERENCES public.crm_tasks (organization_id, id)");
    expect(migration).toContain("crm_tasks_organization_id_id_uq");
  });

  test("keeps activity and task records organization-addressable", () => {
    expect(migration).toContain("crm_activities_organization_id_id_uq");
    expect(migration).toContain("crm_tasks_organization_id_id_uq");
    expect(migration).toContain("crm_activities_organization_time_idx");
    expect(migration).toContain("crm_tasks_organization_state_due_idx");
  });

  test("documents immutable activity and append-only history posture", () => {
    expect(migration).toContain("immutable organization-scoped activity records");
    expect(migration).toContain("append-only task transition history");
    expect(migration).toContain("writes require an audited command");
  });
});
