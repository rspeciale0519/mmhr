import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

import { evaluatePublishedOption } from "@/server/matching/option-publication-contract";

const migration = readFileSync("drizzle/0116_r3_evaluation_publication_inputs.sql", "utf8");
const lowerMigration = migration.toLowerCase();

describe("R3 publication input capture migration", () => {
  test("keeps capture and evaluation private, read-only, and UTC-stable", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION mmhr_private.r3_collect_publication_inputs(");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION mmhr_private.r3_evaluate_publication_option(");
    expect(migration).toContain("LANGUAGE plpgsql");
    expect(migration).toContain("SET search_path = ''");
    expect(migration).toContain("SET timezone = 'UTC'");
    expect(migration).toContain("trim_scale((response_value #>> '{}')::numeric)::text");
    expect(migration).toContain("r3_publication_scalar_matches");
    expect(lowerMigration).not.toMatch(/\b(insert\s+into|update\s+public|delete\s+from|alter\s+table)\b/);
    expect(migration).toContain("REVOKE ALL ON FUNCTION mmhr_private.r3_collect_publication_inputs(uuid, uuid, jsonb, timestamptz)");
    expect(migration).toContain("REVOKE ALL ON FUNCTION mmhr_private.r3_evaluate_publication_option(jsonb, jsonb, jsonb)");
    expect(lowerMigration).not.toContain("grant execute");
  });

  test("captures the scoped intake, answered requirements, and all approved products", () => {
    for (const field of [
      "'intake'", "'id'", "'revision'", "'status'", "'submittedAt'", "'companyContext'",
      "'currentSystems'", "'complianceNeeds'", "'budget'", "'timeline'", "'stakeholders'", "'decisionProcess'",
      "'requirements'", "'requirementId'", "'importance'", "'weight'", "'response'", "'products'",
      "'productId'", "'vendorOrganizationId'", "'productRevision'", "'profileRevision'", "'inputs'",
    ]) expect(migration).toContain(field);
    expect(migration).toContain("mmhr_private.r3_approved_vendor_inputs(p.organization_id, p.id, as_of)");
    expect(migration).toContain("jsonb_array_length(inputs.rows) > 0");
    expect(migration).toContain("ORDER BY product_id");
    expect(migration).toContain("ORDER BY input_row.fact_id, input_row.field_key");
    expect(migration).toContain("octet_length(snapshot::text) > 20000000");
    expect(migration).toContain("Publication input snapshot exceeds 20 MB");
    expect(migration).not.toContain("'asOf'");
  });

  test("rejects unsafe or incomplete configuration and input shapes", () => {
    for (const fragment of [
      "criteria_count > 2000",
      "normalized_key = ANY(seen_keys)",
      "Publication configuration criteria must exactly match requirements",
      "response path must resolve to a scalar",
      "fact_key ~ '^(commission|payout|referral|payment_status)'",
      "jsonb_object_keys(case when jsonb_typeof(input_row) = 'object' then input_row else '{}'::jsonb end)",
      "octet_length((item->'response')::text) > 8000",
      "r3_publication_number_is_js_representable",
      "((exact_value::double precision)::text)::numeric",
      "SET extra_float_digits = 3",
      "Publication numeric response is not safely representable",
    ]) expect(lowerMigration).toContain(fragment.toLowerCase());
    expect(migration).toContain("active_answered_count < 1 OR active_answered_count > 2000");
    expect(migration).toContain("REVOKE ALL ON FUNCTION mmhr_private.r3_publication_number_is_js_representable(jsonb)");
  });

  test("keeps the TypeScript oracle contract as an independent parity vector", () => {
    const requirements = [
      {
        requirementId: "00000000-0000-4000-8000-000000000001",
        revision: 1,
        key: "hosting",
        label: "Hosting model",
        importance: "must" as const,
        weight: 2,
        response: { answer: "Cloud" },
      },
      {
        requirementId: "00000000-0000-4000-8000-000000000002",
        revision: 3,
        key: "region",
        label: "Region",
        importance: "nice" as const,
        weight: 1,
        response: { answer: "US" },
      },
    ];
    const result = evaluatePublishedOption(
      requirements,
      {
        version: 1,
        criteria: [
          { requirementKey: "hosting", factKey: "hosting", responsePath: ["answer"] },
          { requirementKey: "region", factKey: "region", responsePath: ["answer"] },
        ],
      },
      [
        {
          fact_id: "00000000-0000-4000-8000-000000000011",
          field_key: "hosting",
          value: " cloud ",
          provenance: "evidence" as const,
          evidence_id: "00000000-0000-4000-8000-000000000021",
          source_id: "00000000-0000-4000-8000-000000000022",
          review_id: "00000000-0000-4000-8000-000000000023",
          evidence_version: 1,
          content_hash: "a".repeat(64),
          observed_at: "2026-09-01T00:00:00Z",
          captured_at: "2026-09-02T00:00:00Z",
          valid_until: "2026-10-01T00:00:00Z",
          override_id: null,
          approved_at: "2026-09-02T00:00:00Z",
        },
      ],
    );
    expect(result).toMatchObject({
      eligibility: "eligible",
      deterministicScore: 6667,
      confidenceBasisPoints: 6667,
      fitReasons: ["hosting"],
      limitations: ["region"],
    });

    const numericResult = evaluatePublishedOption(
      [{
        requirementId: "00000000-0000-4000-8000-000000000003",
        revision: 1,
        key: "quantity",
        label: "Quantity",
        importance: "must" as const,
        weight: 1,
        response: { answer: 1 },
      }],
      { version: 1, criteria: [{ requirementKey: "quantity", factKey: "quantity", responsePath: ["answer"] }] },
      [{
        fact_id: "00000000-0000-4000-8000-000000000012",
        field_key: "quantity",
        value: "1.0",
        provenance: "evidence" as const,
        evidence_id: "00000000-0000-4000-8000-000000000024",
        source_id: "00000000-0000-4000-8000-000000000025",
        review_id: "00000000-0000-4000-8000-000000000026",
        evidence_version: 1,
        content_hash: "b".repeat(64),
        observed_at: "2026-09-01T00:00:00Z",
        captured_at: "2026-09-02T00:00:00Z",
        valid_until: "2026-10-01T00:00:00Z",
        override_id: null,
        approved_at: "2026-09-02T00:00:00Z",
      }],
    );
    expect(numericResult.fitReasons).toEqual([]);
    expect(numericResult.limitations).toEqual(["quantity"]);
  });
});
