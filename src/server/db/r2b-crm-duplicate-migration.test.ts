import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const migration = readFileSync("drizzle/0030_r2b_crm_duplicates.sql", "utf8");
const schema = readFileSync("src/server/db/schema/crm-duplicate.ts", "utf8");

describe("R2B duplicate migration review", () => {
  test("creates review-only scoped candidates", () => {
    expect(migration).toContain("CREATE TABLE public.crm_duplicate_candidates");
    expect(migration).toContain("crm_duplicate_candidates_scope_uq");
    expect(migration).toContain("crm_duplicate_candidates_distinct_ck");
    expect(migration).toContain("CONSTRAINT crm_duplicate_candidates_state_ck CHECK (state = 'open')");
  });

  test("uses normalized-key validation and audited replay lifecycle", () => {
    expect(migration).toContain("candidate->>'signal' <> 'normalized_key'");
    expect(migration).toContain("r1_checked_receipt");
    expect(migration).toContain("r1_finish_security_command");
    expect(migration).toContain("crm.duplicate.detect");
  });

  test("checks both records in the requested organization", () => {
    expect(migration).toContain("FROM public.contacts c WHERE c.organization_id = organization_id");
    expect(migration).toContain("FROM public.products p WHERE p.organization_id = organization_id");
    expect(migration).toContain("FROM public.deals p WHERE p.organization_id = organization_id");
  });

  test("denies raw table access and never grants merge operations", () => {
    expect(migration).toContain("crm_duplicate_candidates_deny_all");
    expect(migration).toContain("REVOKE ALL ON TABLE public.crm_duplicate_candidates");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.mmhr_record_crm_duplicate_candidates(jsonb,uuid,uuid) TO authenticated");
    expect(migration).not.toContain("DELETE FROM public.crm_duplicate_candidates");
    expect(migration).not.toContain("UPDATE public.crm_duplicate_candidates");
  });
  test("keeps candidate key validation aligned", () => { expect(schema).toContain("crm_duplicate_candidates_candidate_key_ck"); });
});
