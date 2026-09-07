import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const migration = readFileSync("drizzle/0028_r2b_crm_search.sql", "utf8");

describe("R2B CRM search migration review", () => {
  test("uses a fixed security-definer read function", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.mmhr_search_crm(payload jsonb)");
    expect(migration).toContain("STABLE SECURITY DEFINER SET search_path = ''");
    expect(migration).toContain("r1_request_has_permission('workspace.access', organization_id)");
  });

  test("restricts every resource query to the requested organization", () => {
    expect(migration.match(/p\.organization_id = organization_id/g)?.length).toBeGreaterThanOrEqual(5);
    expect(migration).toContain("p.organization_id = organization_id AND (cursor_id IS NULL OR p.id > cursor_id)");
  });

  test("closes anonymous and worker execution", () => {
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.mmhr_search_crm(jsonb)");
    expect(migration).toContain("FROM PUBLIC, anon, authenticated, service_role, mmhr_worker");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.mmhr_search_crm(jsonb) TO authenticated");
  });

  test("returns only the reviewed result fields", () => {
    expect(migration).toContain("'recordId'");
    expect(migration).toContain("'organizationId'");
    expect(migration).toContain("'resource'");
    expect(migration).toContain("'label'");
    expect(migration).toContain("'status'");
  });

  test("keeps the status contract aligned with resource output values", () => {
    expect(migration).toContain("'retired','inactive'");
    expect(migration).toContain("'lead','discovery','qualified','evaluation','proposal','selected','contracted'");
    expect(migration).toContain("'selection','contracting','won','lost','archived'");
    expect(migration).toContain("CASE WHEN p.status = 'open' THEN p.stage ELSE p.status END");
  });
});
