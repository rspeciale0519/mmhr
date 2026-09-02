import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const migration = readFileSync("drizzle/0031_r2b_vendor_evidence_commands.sql", "utf8");

describe("R2B vendor evidence command migration review", () => {
  test("uses fixed audited record and approval RPCs", () => {
    expect(migration).toContain("mmhr_record_vendor_evidence");
    expect(migration).toContain("mmhr_approve_vendor_evidence");
    expect(migration).toContain("crm.vendor.evidence.record");
    expect(migration).toContain("crm.vendor.evidence.approve");
    expect(migration).toContain("r1_finish_security_command");
  });
  test("enforces source, fact, and evidence organization scope", () => {
    expect(migration).toContain("payload->'source'->>'organizationId'");
    expect(migration).toContain("vendor_profiles v WHERE v.organization_id = organization_id");
    expect(migration).toContain("vendor_evidence_versions (id, organization_id, fact_id");
  });
  test("keeps raw tables closed", () => {
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.mmhr_record_vendor_evidence");
    expect(migration).not.toContain("GRANT SELECT ON TABLE public.vendor_");
  });
});
