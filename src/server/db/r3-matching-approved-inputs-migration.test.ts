import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const migration = readFileSync("drizzle/0113_r3_matching_approved_inputs.sql", "utf8");
const schema = readFileSync("src/server/db/schema/r3-matching.ts", "utf8");
const prior = readFileSync("drizzle/0111_r3_candidate_vendor_scope.sql", "utf8");

describe("R3 approved matching input persistence", () => {
  test("adds private evidence without claiming proof for historical runs", () => {
    expect(migration).toContain('ADD COLUMN "vendor_input_snapshot" jsonb DEFAULT \'[]\'::jsonb NOT NULL');
    expect(migration).toContain("Empty on legacy runs; never a customer read field");
    expect(migration).not.toMatch(/UPDATE public\.matching_runs|DELETE FROM|DROP TABLE|DISABLE (?:TRIGGER|ROW LEVEL SECURITY)/i);
    expect(schema).toContain('vendorInputSnapshot: jsonb("vendor_input_snapshot").notNull().default([])');
    expect(schema).toContain('"matching_runs_vendor_inputs_ck"');
    expect(migration).toContain('ADD CONSTRAINT "matching_runs_vendor_inputs_ck"');
  });

  test("resolves once and uses only the captured approved values", () => {
    expect(migration.match(/FROM mmhr_private\.r3_approved_vendor_inputs\(/g)).toHaveLength(1);
    expect(migration).toContain("candidate.vendor_organization_id, candidate.product_id, v_as_of");
    expect(migration).toContain("jsonb_agg(to_jsonb(vf) ORDER BY vf.field_key, vf.fact_id)");
    expect(migration.match(/jsonb_array_elements\(candidate_inputs\)/g)).toHaveLength(5);
    expect(migration).not.toContain("FROM public.vendor_facts");
    expect(migration).toContain("'candidateId', candidate.id, 'asOf', v_as_of, 'inputs', candidate_inputs");
    expect(migration).toContain("snapshot, vendor_snapshot, context.actor_identity_id, correlation_id");
  });

  test("does not recompute or overwrite evidence during receipt replay", () => {
    const receiptBranch = migration.slice(migration.indexOf("IF receipt IS NOT NULL THEN"), migration.indexOf("  ELSE\n"));
    expect(receiptBranch).toContain("mr.organization_id = v_organization_id");
    expect(receiptBranch).toContain("outcome := 'replayed'");
    expect(receiptBranch).not.toMatch(/approved_vendor_inputs|UPDATE|INSERT/);
    expect(migration).toContain("matching_runs_append_only BEFORE UPDATE OR DELETE");
    expect(migration).toContain("matching_runs_append_only_truncate BEFORE TRUNCATE");
    expect(migration.match(/r1_reject_immutable_mutation\(\)/g)).toHaveLength(2);
  });

  test("keeps caller authority, parent locking and atomic audit intact", () => {
    expect(migration).toContain("'workspace.access', v_organization_id, 'Run deterministic matching'");
    expect(migration).toContain("v_actor_id <> context.actor_identity_id");
    expect(migration).toContain("i.organization_id = v_organization_id FOR UPDATE");
    expect(migration).toContain("ORDER BY ec.id FOR UPDATE");
    expect(migration).toContain("rs.status = 'approved'");
    expect(migration).toContain("'r3.matching.run', 'matching.run', 'matching_run'");
    expect(migration).toContain("SECURITY DEFINER SET search_path = ''");
    expect(migration).toContain("FROM PUBLIC, anon, authenticated, service_role, mmhr_worker");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.mmhr_run_deterministic_matching(jsonb,uuid,uuid) TO authenticated");
    expect(migration).not.toMatch(/GRANT (?:SELECT|INSERT|UPDATE|DELETE|ALL)|CREATE POLICY|DROP POLICY/i);
  });

  test("preserves the public result keys and excludes private evidence", () => {
    function resultKeys(text: string) {
      const start = text.lastIndexOf("RETURN jsonb_build_object(");
      return [...text.slice(start, text.indexOf("END", start)).matchAll(/'([A-Za-z]+)'/g)]
        .map((match) => match[1]);
    }
    expect(resultKeys(migration)).toEqual(resultKeys(prior));
    const masked = migration.slice(migration.indexOf("snapshot := snapshot ||"), migration.indexOf("    END LOOP;"));
    expect(masked).not.toMatch(/vendor_input_snapshot|vendor_snapshot|candidate_inputs|evidence_id|source_id|product_id/);
  });

  test("rejects oversize evidence without truncation and uses conservative capture freshness", () => {
    expect(migration).toContain("octet_length(vendor_snapshot::text) > 4000000");
    expect(migration).toContain("Matching input evidence exceeds the supported size");
    expect(migration).toContain("min((vf->>'captured_at')::timestamptz)");
    expect(migration).not.toMatch(/LIMIT\s+[0-9]+|commission|payout|payment_status/i);
    expect(migration).toContain("round((matched_weight::numeric / total_weight::numeric) * 10000)::integer");
  });
});
