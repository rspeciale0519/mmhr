import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const migration = readFileSync("drizzle/0120_r3_initial_selection_commands.sql", "utf8");
const lowerMigration = migration.toLowerCase();

describe("R3 initial selection command migration", () => {
  test("exposes only authenticated command and read functions", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.mmhr_select_initial_evaluation_options(");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.mmhr_get_initial_evaluation_selections(");
    expect(migration).toContain("SECURITY DEFINER SET search_path = ''");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.mmhr_select_initial_evaluation_options(jsonb,uuid,uuid)");
    expect(migration).toContain("public.mmhr_get_initial_evaluation_selections(jsonb,uuid)");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.mmhr_select_initial_evaluation_options(jsonb,uuid,uuid) TO authenticated");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.mmhr_get_initial_evaluation_selections(jsonb,uuid) TO authenticated");
    expect(migration).not.toContain("actorIdentityId");
  });

  test("validates strict five-option customer input and current publication scope", () => {
    for (const fragment of [
      "count(*) FROM jsonb_object_keys(payload)) <> 5",
      "optionIds",
      "jsonb_array_length(payload->'optionIds') NOT BETWEEN 1 AND 5",
      "Duplicate initial selection option",
      "option_text IS NULL",
      "evaluation.select",
      "portal.customer.access",
      "intake.status <> 'submitted'",
      "r3_read_evaluation_publication",
      "publication.input_digest <> expected_digest",
      "selected_count <> cardinality(selected_option_ids)",
      "Initial candidate limit reached",
      "Initial candidate already exists",
    ]) expect(migration).toContain(fragment);
    expect(lowerMigration).not.toMatch(/limits*<=s*5/);
    expect(migration).toMatch(/IF payload IS NULL OR jsonb_typeof\(payload\) IS DISTINCT FROM 'object' THEN/);
    expect(migration).toMatch(/IF jsonb_typeof\(payload->'optionIds'\) IS DISTINCT FROM 'array' THEN/);
    expect(migration).not.toMatch(/jsonb_array_length\(payload->'optionIds'\).*jsonb_typeof/);
  });

  test("copies the immutable publication comparison without exposing provider fields", () => {
    for (const fragment of [
      "option_row.eligibility", "option_row.deterministic_score", "publication.sequence",
      "option_row.fit_reasons", "option_row.limitations", "option_row.evidence_fresh_at",
      "Candidate-' || upper(substr(candidate_id::text, 1, 8))",
      "evaluation_initial_selection_items",
      "r1_finish_security_command",
      "r3.evaluation.initial_selection.select",
      "'Option ' || o.ordinal::text",
    ]) expect(migration).toContain(fragment);
    expect(migration).not.toContain("vendorOrganizationId");
    expect(migration).not.toContain("productId");
    expect(migration).toContain("initial_candidate_count + selected_count");
  });

  test("replay rechecks authority but does not require current publication state", () => {
    const receipt = migration.indexOf("r1_checked_receipt");
    const replay = migration.indexOf("r3_initial_selection_result(replay_selection_id");
    const currentPublicationCheck = migration.indexOf("r3_read_evaluation_publication");
    expect(receipt).toBeGreaterThan(0);
    expect(replay).toBeGreaterThan(receipt);
    expect(currentPublicationCheck).toBeGreaterThan(replay);
    expect(migration).toContain("'replayed'");
  });

  test("reads historical links with complete scope and rejects legacy overflow", () => {
    expect(migration).toContain("initial_candidate_count > 5");
    expect(migration).toContain("i.id = intake_id AND i.organization_id = organization_id");
    expect(migration).toContain("'Option ' || o.ordinal::text");
    expect(migration).toContain("remainingInitialChoices");
    for (const fragment of [
      "s.organization_id = i.organization_id", "s.intake_id = i.intake_id",
      "s.publication_id = i.publication_id", "p.organization_id = i.organization_id",
      "o.organization_id = i.organization_id", "c.organization_id = i.organization_id",
      "m.organization_id = i.organization_id",
    ]) expect(migration).toContain(fragment);
    const readStart = migration.indexOf("CREATE OR REPLACE FUNCTION public.mmhr_get_initial_evaluation_selections");
    expect(readStart).toBeGreaterThan(0);
    expect(migration.slice(readStart)).not.toContain("r3_read_evaluation_publication(");
  });
});
