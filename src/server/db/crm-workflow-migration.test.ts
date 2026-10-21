import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

const migration = readFileSync(join(process.cwd(), "drizzle", "0016_r2b_deal_vendor_evidence.sql"), "utf8");

describe("R2B deal and vendor-evidence migration review", () => {
  test("creates the deal, renewal, and vendor-evidence tables", () => {
    for (const table of [
      "deals",
      "deal_stage_history",
      "renewals",
      "vendor_sources",
      "vendor_facts",
      "vendor_evidence_versions",
      "vendor_fact_reviews",
      "vendor_fact_overrides",
    ]) {
      expect(migration).toContain(`CREATE TABLE public.${table}`);
    }
  });

  test("enables row-level security on every new table", () => {
    for (const table of [
      "deals",
      "deal_stage_history",
      "renewals",
      "vendor_sources",
      "vendor_facts",
      "vendor_evidence_versions",
      "vendor_fact_reviews",
      "vendor_fact_overrides",
    ]) {
      expect(migration).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
    }
  });

  test("revokes raw access for all runtime roles", () => {
    expect(migration).toContain("REVOKE ALL ON TABLE");
    expect(migration).toContain("FROM PUBLIC, anon, authenticated, service_role, mmhr_worker");
  });

  test("installs restrictive deny policies for every new table", () => {
    const policyCount = (migration.match(/AS RESTRICTIVE FOR ALL TO anon, authenticated USING \(false\) WITH CHECK \(false\)/g) ?? []).length;
    expect(policyCount).toBe(8);
  });

  test("enforces organization scope across deals, products, and history", () => {
    expect(migration).toContain("deals_product_vendor_scope_fk");
    expect(migration).toContain("deal_stage_history_deal_scope_fk");
    expect(migration).toContain("products_organization_vendor_id_uq");
    expect(migration).toContain("REFERENCES public.products (organization_id, vendor_profile_id, id)");
    expect(migration).toContain("REFERENCES public.deals (organization_id, id)");
  });

  test("preserves renewal windows and terminal outcome rules", () => {
    expect(migration).toContain("renewals_window_ck");
    expect(migration).toContain("renewals_terminal_action_ck");
    expect(migration).toContain("renewals_completed_deal_ck");
    expect(migration).toContain("renewals_organization_status_action_idx");
  });

  test("requires source-backed vendor facts and immutable evidence versions", () => {
    expect(migration).toContain("vendor_facts_vendor_scope_fk");
    expect(migration).toContain("vendor_facts_product_scope_fk");
    expect(migration).toContain("vendor_evidence_fact_scope_fk");
    expect(migration).toContain("vendor_evidence_source_scope_fk");
    expect(migration).toContain("vendor_evidence_organization_fact_version_uq");
  });

  test("enforces approval, freshness, and expiring-override boundaries", () => {
    expect(migration).toContain("vendor_fact_reviews_decision_ck");
    expect(migration).toContain("vendor_evidence_freshness_ck");
    expect(migration).toContain("vendor_fact_overrides_dates_ck");
    expect(migration).toContain("R2B audited, expiring vendor-fact overrides");
  });
});
