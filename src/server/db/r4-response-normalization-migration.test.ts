import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const migration = readFileSync(join(process.cwd(), "drizzle", "0056_r4_response_normalization.sql"), "utf8");
const schema = readFileSync(join(process.cwd(), "src", "server", "db", "schema", "workflow-foundation.ts"), "utf8");
describe("R4 response normalization migration", () => {
  test("stores bounded extraction fields with pending state", () => {
    expect(migration).toContain("rfp_response_normalizations");
    expect(migration).toContain("supported_requirements");
    expect(migration).toContain("rfp_response_normalizations_state_ck");
    expect(migration).toContain("state', 'pending'");
  });
  test("requires scoped inbound events and audited replay safety", () => {
    expect(migration).toContain("inbound_email_organization_id_id_uq");
    expect(migration).toContain("rfp_response_normalizations_event_scope_fk");
    expect(migration).toContain("r4.rsp.normalize");
    expect(migration).toContain("r1_checked_receipt");
    expect(migration).toContain("r1_finish_security_command");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.mmhr_record_rfp_response_normalization");
  });
  test("keeps normalization arrays, counts, review state, and identity references aligned", () => { for (const name of ["rfp_response_normalizations_arrays_ck", "rfp_response_normalizations_count_ck", "rfp_response_normalizations_review_state_ck", "rfp_response_normalizations_reviewed_identity_fk", "rfp_response_normalizations_approved_identity_fk"]) expect(schema).toContain(name); });
});
