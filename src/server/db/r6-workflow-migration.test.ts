import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

const migration = readFileSync(join(process.cwd(), "drizzle", "0020_r6_demo_proposal_handoff.sql"), "utf8");

describe("R6 demo, proposal, and handoff migration review", () => {
  test("creates the R6 current and history tables", () => {
    for (const table of ["demo_rounds", "demo_round_history", "demo_feedback", "proposal_versions", "proposal_comparisons", "contract_handoffs", "contract_handoff_history"]) {
      expect(migration).toContain(`CREATE TABLE public.${table}`);
    }
  });

  test("enables RLS and revokes raw access for every table", () => {
    expect((migration.match(/ENABLE ROW LEVEL SECURITY/g) ?? []).length).toBe(7);
    expect(migration).toContain("FROM PUBLIC, anon, authenticated, service_role, mmhr_worker");
  });

  test("installs restrictive deny policies for every table", () => {
    expect((migration.match(/AS RESTRICTIVE FOR ALL TO anon, authenticated USING \(false\) WITH CHECK \(false\)/g) ?? []).length).toBe(7);
  });

  test("preserves organization-scoped deal links", () => {
    expect((migration.match(/FOREIGN KEY \(organization_id, deal_id\)/g) ?? []).length).toBe(4);
    expect(migration).toContain("REFERENCES public.deals (organization_id, id)");
  });

  test("bounds demo scheduling and feedback", () => {
    expect(migration).toContain("demo_rounds_schedule_ck");
    expect(migration).toContain("demo_rounds_time_ck");
    expect(migration).toContain("demo_feedback_score_ck");
    expect(migration).toContain("demo_feedback_refs_ck");
  });

  test("keeps proposal versions source-backed and immutable by version", () => {
    expect(migration).toContain("proposal_versions_status_ck");
    expect(migration).toContain("proposal_versions_refs_ck");
    expect(migration).toContain("proposal_versions_organization_deal_vendor_version_uq");
  });

  test("requires approved comparison and handoff scope", () => {
    expect(migration).toContain("proposal_comparisons_versions_ck");
    expect(migration).toContain("proposal_comparisons_approvers_ck");
    expect(migration).toContain("contract_handoffs_scope_ck");
    expect(migration).toContain("contract_handoffs_status_ck");
  });

  test("preserves status history and negotiation boundary", () => {
    expect(migration).toContain("contract_handoff_history_scope_fk");
    expect(migration).toContain("legal negotiation remains between customer and vendor");
    expect(migration).toContain("demo_round_history_scope_fk");
  });
});
