import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const read = (name: string) => readFileSync(`drizzle/${name}`, "utf8").replaceAll("\r\n", "\n");
const sql = read("0175_staff_submission_queue.sql");

function functionBody(text: string, header: string) {
  const start = text.indexOf(header);
  expect(start, header).toBeGreaterThanOrEqual(0);
  const end = text.indexOf("\n$$;", start);
  return text.slice(start, end);
}

function lineDiff(before: string, after: string) {
  const old = new Set(before.split("\n")), next = new Set(after.split("\n"));
  return { removed: [...old].filter((line) => !next.has(line)), added: [...next].filter((line) => !old.has(line)) };
}

describe("staff submission queue migration", () => {
  test("adds one private deny-first table and drops nothing", () => {
    expect(sql.match(/CREATE TABLE /g)).toHaveLength(1);
    expect(sql).toContain('CREATE TABLE "mmhr_private"."staff_case_access_grants"');
    expect(sql).toContain("ALTER TABLE mmhr_private.staff_case_access_grants ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)");
    expect(sql).not.toMatch(/DROP |DISABLE ROW LEVEL SECURITY|GRANT [^;]*TO (anon|service_role|mmhr_worker)|GRANT [^;]* ON TABLE/);
    expect(sql.indexOf("SELECT mmhr_private.r1_lock_security()")).toBeLessThan(sql.indexOf("CREATE OR REPLACE FUNCTION"));
  });

  test("changes the permission evaluator only by the staff case gate", () => {
    const header = "CREATE OR REPLACE FUNCTION mmhr_private.r1_evaluate_permission(";
    const before = functionBody(read("0008_r1_assignment_deny_authority.sql"), header);
    const gate = "AND mmhr_private.r1_override_allow_is_valid(o.id, authorization_time, durable, visited)\n    ) THEN RETURN false; END IF;";
    expect(before.split(gate)).toHaveLength(2);
    expect(functionBody(sql, header)).toBe(before.replace(gate,
      "AND mmhr_private.r1_override_allow_is_valid(o.id, authorization_time, durable, visited)\n"
      + "    ) AND NOT mmhr_private.r1_staff_case_access_is_active(target_identity_id, selected_organization_id)\n"
      + "    THEN RETURN false; END IF;"));
  });

  test("keeps administration capacity except the bound staff viewer exemption", () => {
    const header = "CREATE OR REPLACE FUNCTION mmhr_private.r1_assert_administration_capacity(";
    const diff = lineDiff(functionBody(read("0101_r1_customer_registration.sql"), header), functionBody(sql, header));
    expect(diff.removed).toEqual(["          AND (m.identity_id<>c.identity_id OR m.role_key<>'contributor'))"]);
    expect(diff.added.join("\n")).toContain("m.role_key='viewer' AND EXISTS (");
    expect(diff.added.join("\n")).toContain("WHERE g.membership_id=m.id AND g.organization_id=o.id AND g.identity_id=m.identity_id)))");
  });

  test("requires staff access with AAL2 for both RPCs and grants only authenticated callers", () => {
    const queue = functionBody(sql, "CREATE FUNCTION public.mmhr_get_staff_submission_queue(");
    expect(queue).toContain("auth.jwt()->>'aal' IS DISTINCT FROM 'aal2'");
    expect(queue).toContain("r1_request_has_permission('admin.access',NULL::uuid)");
    expect(queue).toContain("o.type = 'customer'");
    expect(queue).not.toMatch(/company_context|budget|vendor|commission/);
    const open = functionBody(sql, "CREATE FUNCTION public.mmhr_open_staff_case(");
    expect(open).toContain("r1_start_security_command(\n    'admin.access', NULL::uuid");
    expect(open).toContain("'evaluation.disclose'");
    expect(open).toContain("mmhr_private.r1_finish_security_command(");
    expect(open).not.toContain("payload->>'organizationId'");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.mmhr_get_staff_submission_queue(jsonb) TO authenticated");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.mmhr_open_staff_case(jsonb, uuid, uuid) TO authenticated");
    expect(sql.match(/^GRANT /gm)).toHaveLength(2);
  });

  test("documents a recovery path", () => {
    expect(sql).toContain("-- Recovery (forward repair; keep every row):");
  });
});
