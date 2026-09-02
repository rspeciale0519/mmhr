import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
const migration = readFileSync("drizzle/0032_r2a_lead_routing.sql", "utf8");
describe("R2A lead routing migration review", () => {
  test("uses a fixed audited routing command", () => {
    expect(migration).toContain("mmhr_route_lead");
    expect(migration).toContain("crm.lead.route");
    expect(migration).toContain("r1_finish_security_command");
  });
  test("checks organization ownership and active member assignment", () => {
    expect(migration).toContain("existing.organization_id <> organization_id");
    expect(migration).toContain("m.revoked_at IS NULL");
  });
  test("closes raw lead access", () => {
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.mmhr_route_lead");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.mmhr_route_lead(jsonb,uuid,uuid) TO authenticated");
  });
});
