import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const migration = readFileSync(join(process.cwd(), "drizzle", "0035_r3_candidate_transition_commands.sql"), "utf8");

describe("R3 candidate transition command migration review", () => {
  test("uses a fixed security-definer RPC with authenticated-only execution", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.mmhr_transition_evaluation_candidate");
    expect(migration).toContain("SECURITY DEFINER SET search_path = ''");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.mmhr_transition_evaluation_candidate");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.mmhr_transition_evaluation_candidate(jsonb,uuid,uuid) TO authenticated");
  });
  test("enforces explicit lifecycle transitions and approval-bound reactivation", () => {
    expect(migration).toContain("Invalid candidate transition input");
    expect(migration).toContain("approval_reference");
    expect(migration).toContain("Candidate transition denied");
    expect(migration).toContain("from_state = 'eliminated' AND to_state <> 'active'");
  });
  test("uses organization scope, idempotency, and optimistic revision", () => {
    expect(migration).toContain("r3.candidate.transition");
    expect(migration).toContain("candidate.state <> from_state OR candidate.revision <> expected_revision");
    expect(migration).toContain("jsonb_build_object('version', 1)");
    expect(migration).toContain("ec.revision + 1");
  });
});
