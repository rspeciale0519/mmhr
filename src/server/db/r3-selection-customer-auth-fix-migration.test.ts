import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const sql = readFileSync("drizzle/0126_r3_selection_customer_auth_fix.sql", "utf8");

describe("customer selection authentication correction", () => {
  test("uses verified customer authority without replacing staff helpers", () => {
    expect(sql).not.toContain("r1_start_security_command");
    expect(sql).not.toContain("CREATE OR REPLACE FUNCTION mmhr_private");
    for (const check of ["NOT IN ('aal1','aal2')", "auth.sessions", "email_confirmed_at IS NOT NULL",
      "r1_session_is_aal2", "r1_verified_identity(actor.id,false)", "r1_request_identity_id() IS DISTINCT FROM actor.id",
      "'evaluation.select'", "'portal.customer.access'"]) expect(sql).toContain(check);
  });
  test("locks and checks authority before receipt replay and keeps atomic audit", () => {
    expect(sql.indexOf("r1_lock_security()")).toBeLessThan(sql.indexOf("FROM auth.users"));
    expect(sql.indexOf("'portal.customer.access'")).toBeLessThan(sql.indexOf("r1_checked_receipt"));
    expect(sql).toContain("r1_finish_security_command");
    expect(sql).toContain("initial_candidate_count + selected_count > 5");
    expect(sql).not.toMatch(/DROP |DELETE FROM|GRANT /);
  });
});
