import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const sql = readFileSync("drizzle/0112_r3_approved_vendor_inputs.sql", "utf8");
const lowerSql = sql.toLowerCase();

describe("R3 approved vendor input resolver migration", () => {
  test("defines only the private stable helper and its full result contract", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION mmhr_private.r3_approved_vendor_inputs(");
    expect(sql).toContain("vendor_org uuid");
    expect(sql).toContain("product_id uuid");
    expect(sql).toContain("as_of timestamptz");
    for (const column of [
      "fact_id uuid", "field_key text", "value text", "provenance text",
      "evidence_id uuid", "source_id uuid", "review_id uuid", "evidence_version integer",
      "content_hash text", "observed_at timestamptz", "captured_at timestamptz",
      "valid_until timestamptz", "override_id uuid", "approved_at timestamptz",
    ]) expect(sql).toContain(column);
    expect(sql).toContain("LANGUAGE sql");
    expect(sql).toContain("STABLE");
    expect(sql).not.toContain("SECURITY DEFINER");
    expect(sql).toContain("SET search_path = ''");
  });

  test("keeps the product and vendor approval boundary exact and time-aware", () => {
    expect(sql).toContain("p.organization_id = $1");
    expect(sql).toContain("p.id = $2");
    expect(sql).toContain("o.status = 'active'");
    expect(sql).toContain("o.activated_at <= $3");
    expect(sql).toContain("vp.status = 'active'");
    expect(sql).toContain("vp.approved_at IS NOT NULL");
    expect(sql).toContain("vp.approved_by_identity_id IS NOT NULL");
    expect(sql).toContain("vp.approved_at <= $3");
    expect(sql).toContain("p.status = 'active'");
    expect(sql).toContain("f.observed_at <= $3");
  });

  test("takes the highest evidence version without falling back to an invalid latest row", () => {
    expect(sql).toContain("latest_evidence AS");
    expect(sql).toContain("DISTINCT ON (f.id)");
    expect(sql).toContain("ORDER BY f.id, e.version DESC, e.id DESC");
    expect(sql).toContain("le.fact_status = 'published'");
    expect(sql).toContain("le.review_decision = 'approved'");
    expect(sql).toContain("le.captured_at <= $3");
    expect(sql).toContain("le.fresh_until > $3");
    expect(sql).toContain("le.source_active");
    expect(sql).toContain("le.source_captured_at <= $3");
    expect(sql).toContain("le.approved_at <= $3");
    expect(lowerSql).not.toMatch(/latest_evidence[\s\S]*?where[\s\S]*?e\.version/);
  });

  test("uses only same-provider evidence and preserves private provenance", () => {
    expect(sql).toContain("e.organization_id = f.organization_id");
    expect(sql).toContain("e.fact_id = f.id");
    expect(sql).toContain("le.source_vendor_profile_id = (SELECT vendor_profile_id FROM product_scope)");
    expect(sql).toContain("le.evidence_id");
    expect(sql).toContain("le.source_id");
    expect(sql).toContain("le.review_id");
    expect(sql).toContain("le.content_hash");
    expect(sql).not.toMatch(/GRANT\s+(SELECT|EXECUTE).*r3_approved_vendor_inputs/i);
  });

  test("chooses the newest sourced override and does not fall back after expiry", () => {
    expect(sql).toContain("latest_overrides AS");
    expect(sql).toContain("DISTINCT ON (f.id)");
    expect(sql).toContain("ORDER BY f.id, o.approved_at DESC, o.id DESC");
    expect(sql).toContain("fact_status IN ('draft', 'published')");
    expect(sql).toContain("LEFT JOIN public.vendor_sources AS s");
    expect(sql).toContain("source_vendor_profile_id = (SELECT vendor_profile_id FROM product_scope)");
    expect(sql).toContain("source_active");
    expect(sql).toContain("approved_at <= $3");
    expect(sql).toContain("expires_at > $3");
    expect(sql).toContain("NOT EXISTS (\n      SELECT 1 FROM valid_overrides AS vo WHERE vo.fact_id = le.fact_id");
    expect(sql).toContain("'override'::text");
    expect(sql).toContain("vo.override_id");
  });

  test("requires active source links and bounded freshness for both evidence paths", () => {
    expect(sql).toContain("source_vendor_profile_id = (SELECT vendor_profile_id FROM product_scope)");
    expect(sql).toContain("source_captured_at <= $3");
    expect(sql).toContain("fresh_until > $3");
    expect(sql).toContain("source_id");
    expect(sql).toContain("valid_until");
  });

  test("does not publish, mutate, or grant raw table access", () => {
    expect(sql).not.toMatch(/\b(INSERT\s+INTO|UPDATE\s+public|DELETE\s+FROM|ALTER\s+TABLE)\b/i);
    expect(sql).toContain("REVOKE ALL ON FUNCTION mmhr_private.r3_approved_vendor_inputs");
    expect(sql).toContain("FROM PUBLIC, anon, authenticated, service_role, mmhr_worker");
    expect(sql).not.toContain("GRANT EXECUTE");
    expect(sql).not.toContain("CREATE FUNCTION public.r3_approved_vendor_inputs");
  });
});
