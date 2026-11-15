import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const read = (name: string) => readFileSync(`drizzle/${name}`, "utf8").replaceAll("\r\n", "\n");
const sql = read("0176_staff_case_evaluator_short_circuit.sql");

function functionBody(text: string, header: string) {
  const start = text.indexOf(header);
  expect(start, header).toBeGreaterThanOrEqual(0);
  return text.slice(start, text.indexOf("\n$$;", start));
}

describe("staff case evaluator short circuit migration", () => {
  test("replaces only the registry, four helpers, and the evaluator, after the security lock", () => {
    expect(sql.match(/CREATE (OR REPLACE )?FUNCTION /g)).toHaveLength(6);
    expect(sql).not.toMatch(/CREATE TABLE|DROP |GRANT |REVOKE |POLICY|ALTER TABLE|INSERT |UPDATE |DELETE /);
    expect(sql.indexOf("SELECT mmhr_private.r1_lock_security()")).toBeLessThan(sql.indexOf("CREATE OR REPLACE FUNCTION"));
    expect(sql).toContain("PERFORM mmhr_private.r1_assert_administration_capacity(clock_timestamp())");
  });

  test("keeps the 0122 registry rows and removes only the clause that blocks inlining", () => {
    const header = "CREATE OR REPLACE FUNCTION mmhr_private.r1_permission_registry()";
    const before = functionBody(read("0122_r3_disclosure_authority.sql"), header);
    expect(before.split("SET search_path = ''\n")).toHaveLength(2);
    const after = functionBody(sql, header);
    expect(after).toBe(before.replace("SET search_path = ''\n", ""));
    expect(after).not.toMatch(/SECURITY DEFINER|SET search_path/);
    expect(after.match(/\n {4}\('/g)).toHaveLength(39);
  });

  test("changes the 0008 evaluator only by the short-circuit staff case gate", () => {
    const header = "CREATE OR REPLACE FUNCTION mmhr_private.r1_evaluate_permission(";
    const before = functionBody(read("0008_r1_assignment_deny_authority.sql"), header);
    const gate = "AND mmhr_private.r1_override_allow_is_valid(o.id, authorization_time, durable, visited)\n    ) THEN RETURN false; END IF;";
    expect(before.split(gate)).toHaveLength(2);
    expect(functionBody(sql, header)).toBe(before.replace(gate, [
      "AND mmhr_private.r1_override_allow_is_valid(o.id, authorization_time, durable, visited)",
      "    ) THEN",
      "      -- Read only after the override check fails. Same rule as",
      "      -- mmhr_private.r1_staff_case_access_is_active, written inline.",
      "      IF organization_type <> 'customer' OR NOT EXISTS (",
      "        SELECT 1 FROM mmhr_private.staff_case_access_grants g",
      "        JOIN public.org_members gm ON gm.id = g.membership_id AND gm.org_id = g.organization_id",
      "          AND gm.identity_id = g.identity_id AND gm.status = 'active' AND gm.role_key = 'viewer'",
      "        WHERE g.identity_id = target_identity_id AND g.organization_id = selected_organization_id",
      "          AND g.state = 'active'",
      "      ) THEN RETURN false; END IF;",
      "    END IF;",
    ].join("\n")));
  });

  test.each([
    ["r1_scope_supported", "0004_r1_security_commands.sql", "CREATE FUNCTION mmhr_private.r1_scope_supported("],
    ["r1_verified_identity", "0004_r1_security_commands.sql", "CREATE FUNCTION mmhr_private.r1_verified_identity("],
    ["r1_override_allow_is_valid", "0004_r1_security_commands.sql", "CREATE FUNCTION mmhr_private.r1_override_allow_is_valid("],
  ])("keeps the %s query and signature, now in PL/pgSQL", (name, source, header) => {
    const before = functionBody(read(source), header);
    const after = functionBody(sql, `CREATE OR REPLACE FUNCTION mmhr_private.${name}(`);
    const signature = (body: string) => body.slice(body.indexOf("(") + 1, body.indexOf(")\nRETURNS")).replace(/\s+/g, " ").trim();
    expect(signature(after)).toBe(signature(before).replace("timestamp with time zone", "timestamptz"));
    expect(before).toContain("LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''");
    expect(after).toContain("RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''");
    const query = before.slice(before.indexOf("AS $$\n") + 6).trimEnd();
    // The SQL body is "SELECT EXISTS (...)"; the PL/pgSQL body returns the same EXISTS.
    expect(query.split("\n")[0]).toBe("  SELECT EXISTS (");
    expect(after).toContain(`BEGIN\n  RETURN EXISTS (\n${query.split("\n").slice(1).join("\n")};\nEND`);
  });

  test("keeps the r1_current_role_authority query and first-row result", () => {
    const after = functionBody(sql, "CREATE OR REPLACE FUNCTION mmhr_private.r1_current_role_authority(p_role_id uuid)");
    expect(functionBody(read("0006_r1_role_authority.sql"), "CREATE FUNCTION mmhr_private.r1_current_role_authority(p_role_id uuid)"))
      .toContain("LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''");
    expect(after).toContain("RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''");
    expect(after).toContain([
      "  SELECT a.id INTO authority_id FROM public.role_authority_records a",
      "    JOIN public.role_definitions r ON r.id = a.role_definition_id",
      "    WHERE r.id = $1 AND r.state = 'active' AND a.record_kind = 'role_activation'",
      "      AND a.activated_at = r.activated_at;",
      "  RETURN authority_id;",
    ].join("\n"));
    expect(after).not.toContain("INTO STRICT");
  });

  test("the inline gate uses the same rule as the 0175 helper", () => {
    const helper = functionBody(read("0175_staff_submission_queue.sql"),
      "CREATE FUNCTION mmhr_private.r1_staff_case_access_is_active(");
    for (const rule of ["AND m.status = 'active' AND m.role_key = 'viewer'", "o.type = 'customer'", "g.state = 'active'",
      "m.id = g.membership_id AND m.org_id = g.organization_id", "AND m.identity_id = g.identity_id"]) {
      expect(helper).toContain(rule);
    }
    const evaluator = functionBody(sql, "CREATE OR REPLACE FUNCTION mmhr_private.r1_evaluate_permission(");
    for (const rule of ["AND gm.status = 'active' AND gm.role_key = 'viewer'", "organization_type <> 'customer'",
      "g.state = 'active'", "gm.id = g.membership_id AND gm.org_id = g.organization_id", "AND gm.identity_id = g.identity_id"]) {
      expect(evaluator).toContain(rule);
    }
  });
});
