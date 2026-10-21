import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

const migration = readFileSync(join(process.cwd(), "drizzle", "0122_r3_disclosure_authority.sql"), "utf8");

describe("R3 disclosure authority migration", () => {
  test("adds a separate internal AAL2 organization action", () => {
    expect(migration).toContain("('evaluation.disclose', 'action', 'Review and disclose provider identities after an authorized MMHR discussion.', false, true, 'aal2', true, NULL)");
    expect(migration).toContain("SELECT mmhr_private.r1_sync_permission_registry();");
    expect(migration).toContain("SELECT mmhr_private.r1_lock_security();");
  });

  test("activates only Super Admin version 10 and copies prior defaults", () => {
    expect(migration).toContain("r.stable_key = 'super_admin' AND r.version = 9 AND r.state = 'active'");
    expect(migration).toContain("r.stable_key = 'super_admin' AND r.version = 10");
    expect(migration).toContain("SELECT next_role.id, d.permission_key, d.effect");
    expect(migration).toContain("VALUES (next_role.id, 'evaluation.disclose', 'allow')");
    expect(migration).toContain("'r3-disclosure-authority'");
    expect(migration).toContain("'role_version.deactivate'");
    expect(migration).toContain("'role_version.activate'");
    expect(migration).toContain("mmhr_private.r1_assert_administration_capacity(checked_at)");
    expect(migration).not.toContain("organization_admin'::text");
    expect(migration).not.toContain("contributor'::text");
  });

  test("keeps the authority migration recoverable without raw grants", () => {
    expect(migration).toContain("Recovery: revoke the new action or apply a reviewed forward role version.");
    expect(migration).not.toMatch(/GRANT\s+.*evaluation\.disclose/i);
    expect(migration).not.toContain("CREATE TABLE");
  });
});
