import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

const migration = readFileSync(join(process.cwd(), "drizzle", "0022_r8_customer_success_operations.sql"), "utf8");

describe("R8 customer-success and operations migration review", () => {
  test("creates onboarding, project-plan, and work-item tables", () => {
    for (const table of ["onboarding_plans", "onboarding_history", "project_plan_templates", "project_plans", "work_items"]) {
      expect(migration).toContain(`CREATE TABLE public.${table}`);
    }
  });

  test("enables RLS and revokes raw access for every table", () => {
    expect((migration.match(/ENABLE ROW LEVEL SECURITY/g) ?? []).length).toBe(5);
    expect(migration).toContain("FROM PUBLIC, anon, authenticated, service_role, mmhr_worker");
  });

  test("installs restrictive deny policies for every table", () => {
    expect((migration.match(/AS RESTRICTIVE FOR ALL TO anon, authenticated USING \(false\) WITH CHECK \(false\)/g) ?? []).length).toBe(5);
  });

  test("keeps onboarding snapshots and history organization-scoped", () => {
    expect(migration).toContain("onboarding_plans_deal_scope_fk");
    expect(migration).toContain("onboarding_plans_arrays_ck");
    expect(migration).toContain("onboarding_history_scope_fk");
    expect(migration).toContain("onboarding_plans_failure_ck");
  });

  test("requires approved project-plan templates and bounded snapshots", () => {
    expect(migration).toContain("project_plan_templates_approval_ck");
    expect(migration).toContain("project_plan_templates_milestones_ck");
    expect(migration).toContain("project_plans_template_scope_fk");
    expect(migration).toContain("project_plans_revision_ck");
  });

  test("bounds role-scoped queue work and derived overdue inputs", () => {
    expect(migration).toContain("work_items_queue_ck");
    expect(migration).toContain("work_items_status_ck");
    expect(migration).toContain("work_items_priority_ck");
    expect(migration).toContain("work_items_reminder_ck");
    expect(migration).toContain("work_items_escalation_ck");
  });

  test("retains failed work and prevents mutable source deletion", () => {
    expect(migration).toContain("failed work remains retained for reactivation and audit");
    expect(migration).toContain("ON DELETE RESTRICT");
    expect(migration).toContain("onboarding_history_scope_time_idx");
  });

  test("records source indexes for deterministic queue and plan rebuilds", () => {
    expect(migration).toContain("onboarding_plans_status_go_live_idx");
    expect(migration).toContain("project_plan_templates_organization_name_version_uq");
    expect(migration).toContain("work_items_queue_status_due_idx");
  });
});
