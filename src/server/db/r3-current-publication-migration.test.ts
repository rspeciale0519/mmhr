import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

const migration = readFileSync(join(process.cwd(), "drizzle", "0121_r3_current_evaluation_publication.sql"), "utf8");
const lowerMigration = migration.toLowerCase();

describe("R3 current evaluation publication migration", () => {
  test("defines a locked customer-only first-page discovery RPC", () => {
    expect(migration).toContain("public.mmhr_get_current_evaluation_publication");
    expect(migration).toContain("r1_lock_security");
    expect(migration).toContain("r1_request_has_permission('portal.customer.access'");
    expect(migration).toContain("'Current publication read denied'");
    expect(migration).toContain("r3_read_evaluation_publication");
    expect(migration).not.toContain("mmhr_review_evaluation_publication");
  });

  test("validates the exact scope payload and bounded first-page limit", () => {
    expect(migration).toContain("IF payload IS NULL OR jsonb_typeof(payload) IS DISTINCT FROM 'object' OR correlation_id IS NULL THEN");
    expect(migration).toContain("SELECT count(*) FROM jsonb_object_keys(payload)");
    expect(migration).toContain("NOT BETWEEN 2 AND 3");
    expect(migration).toContain("key.name NOT IN ('organizationId','intakeId','limit')");
    expect(migration).toContain("page_limit integer := 25");
    expect(migration).toContain("IF (payload->>'limit')::numeric NOT BETWEEN 1 AND 50 THEN");
    const lexicalCheck = migration.indexOf("coalesce(payload->>'limit','') !~ '^[1-9][0-9]{0,9}$'");
    const numericCheck = migration.indexOf("IF (payload->>'limit')::numeric NOT BETWEEN 1 AND 50 THEN");
    expect(lexicalCheck).toBeGreaterThan(-1);
    expect(numericCheck).toBeGreaterThan(lexicalCheck);
  });

  test("returns only the latest current publication and delegates stale checks", () => {
    expect(migration).toContain("ORDER BY publication_row.sequence DESC");
    expect(migration).toContain("mmhr_private.r3_publication_state(publication_row.id) = 'published'");
    expect(migration).toContain("'publication', publication");
    expect(migration).toContain("mmhr_private.r3_read_evaluation_publication");
  });

  test("keeps the function authenticated-only with no raw access", () => {
    expect(lowerMigration).toContain("revoke all on function public.mmhr_get_current_evaluation_publication(jsonb, uuid)");
    expect(migration).toContain("FROM PUBLIC, anon, authenticated, service_role, mmhr_worker");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.mmhr_get_current_evaluation_publication(jsonb, uuid) TO authenticated");
  });
});
