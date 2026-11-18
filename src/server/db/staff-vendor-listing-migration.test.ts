import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const read = (name: string) => readFileSync(`drizzle/${name}`, "utf8").replaceAll("\r\n", "\n");
const sql = read("0179_staff_vendor_listing.sql");

function functionBody(text: string, header: string) {
  const start = text.indexOf(header);
  expect(start, header).toBeGreaterThanOrEqual(0);
  return text.slice(start, text.indexOf("\n$$;", start));
}

function lineDiff(before: string, after: string) {
  const old = before.split("\n"), next = after.split("\n");
  return { removed: old.filter((line) => !next.includes(line)), added: next.filter((line) => !old.includes(line)) };
}

const rpcs = ["public.mmhr_list_staff_vendor(jsonb, uuid, uuid)", "public.mmhr_open_staff_vendor_workspace(jsonb, uuid, uuid)"];

describe("staff vendor listing migration", () => {
  test("changes only the intake column constraint, after which it locks security", () => {
    expect(sql.startsWith('ALTER TABLE "mmhr_private"."staff_case_access_grants" ALTER COLUMN "intake_id" DROP NOT NULL;')).toBe(true);
    expect(sql.match(/ALTER TABLE/g)).toHaveLength(1);
    expect(sql).not.toMatch(/CREATE TABLE|CREATE POLICY|DROP (TABLE|FUNCTION|POLICY|INDEX)|DISABLE ROW LEVEL SECURITY|CREATE INDEX|DELETE FROM/);
    expect(sql.indexOf("SELECT mmhr_private.r1_lock_security()")).toBeLessThan(sql.indexOf("CREATE OR REPLACE FUNCTION"));
    expect(sql).toContain("PERFORM mmhr_private.r1_assert_administration_capacity(clock_timestamp())");
    expect(sql).toContain("-- Recovery (forward repair; keep every row):");
  });

  test("changes the 0175 grant predicate only by the organization type binding", () => {
    const header = "FUNCTION mmhr_private.r1_staff_case_access_is_active(";
    const diff = lineDiff(functionBody(read("0175_staff_submission_queue.sql"), `CREATE ${header}`),
      functionBody(sql, `CREATE OR REPLACE ${header}`));
    expect(diff.removed).toEqual([
      "CREATE FUNCTION mmhr_private.r1_staff_case_access_is_active(p_identity_id uuid, p_organization_id uuid)",
      "    JOIN public.orgs o ON o.id = g.organization_id AND o.type = 'customer'",
    ]);
    expect(diff.added).toEqual([
      "CREATE OR REPLACE FUNCTION mmhr_private.r1_staff_case_access_is_active(p_identity_id uuid, p_organization_id uuid)",
      "    JOIN public.orgs o ON o.id = g.organization_id",
      "      AND (o.type = 'customer' AND g.intake_id IS NOT NULL OR o.type = 'vendor' AND g.intake_id IS NULL)",
    ]);
  });

  test("changes the 0176 evaluator only in the staff grant gate, never for internal or portal permissions", () => {
    const header = "CREATE OR REPLACE FUNCTION mmhr_private.r1_evaluate_permission(";
    const diff = lineDiff(functionBody(read("0176_staff_case_evaluator_short_circuit.sql"), header), functionBody(sql, header));
    expect(diff.removed).toEqual([
      "      IF organization_type <> 'customer' OR NOT EXISTS (",
      "          AND g.state = 'active'",
    ]);
    expect(diff.added).toEqual([
      "      -- A vendor grant never gives a portal permission, so staff never act",
      "      -- as the vendor, receive its RFP notices, or answer its RFPs.",
      "      IF NOT (organization_type = 'customer'",
      "          OR organization_type = 'vendor' AND definition.required_portal IS NULL) OR NOT EXISTS (",
      "          AND g.state = 'active' AND (g.intake_id IS NULL) = (organization_type = 'vendor')",
      "    -- A staff member bound to a vendor workspace grant is never the vendor,",
      "    -- even with a workspace.access override on the same organization.",
      "    IF organization_type = 'vendor' AND platform_role_id IS NOT NULL",
      "      AND definition.required_portal IS NOT NULL AND EXISTS (",
      "          AND g.intake_id IS NULL",
    ]);
  });

  test("changes the 0175 capacity check only by the recorded listed vendor exemption", () => {
    const header = "CREATE OR REPLACE FUNCTION mmhr_private.r1_assert_administration_capacity(";
    const diff = lineDiff(functionBody(read("0175_staff_submission_queue.sql"), header), functionBody(sql, header));
    expect(diff.removed).toEqual([]);
    const added = diff.added.join("\n");
    expect(added).toContain("AND NOT (o.type = 'vendor' AND NOT o.migration_review_required");
    expect(added).toContain("e.action = 'staff.vendor.list'");
    expect(added).toContain("g.intake_id IS NULL");
    expect(added).toContain("p.state = 'active' AND p.effect = 'allow'");
    expect(added).not.toMatch(/status = 'active'|m\.status/);
  });

  test("changes acceptance only by the first vendor user of a listed vendor", () => {
    const header = "CREATE OR REPLACE FUNCTION public.mmhr_accept_invitation(";
    const diff = lineDiff(functionBody(read("0177_staff_vendor_setup.sql"), header), functionBody(sql, header));
    expect(diff.removed).toEqual(["  IF activate_vendor AND NOT EXISTS ("]);
    const added = diff.added.join("\n");
    expect(added).toContain("IF (activate_vendor OR first_vendor_admin) AND NOT EXISTS (");
    expect(added).toContain("invitation.role_key = 'organization_admin' AND EXISTS (");
    expect(added).toContain("e.action = 'staff.vendor.invite'");
    expect(added).toContain("IF first_vendor_admin THEN");
    expect(added).not.toMatch(/DELETE|UPDATE public\.orgs|platform_role|user_permission_overrides|portal_access_grants/);
  });

  test("changes the directory only by the vendor user count and caller fields", () => {
    const header = "FUNCTION public.mmhr_get_staff_vendor_directory(";
    const diff = lineDiff(functionBody(read("0177_staff_vendor_setup.sql"), `CREATE ${header}`),
      functionBody(sql, `CREATE OR REPLACE ${header}`));
    expect(diff.removed).toEqual([
      "CREATE FUNCTION public.mmhr_get_staff_vendor_directory(payload jsonb)",
      "        WHERE m.org_id = v.id AND m.status = 'active'),",
      "    'truncated', jsonb_array_length(v_rows) > v_limit);",
    ]);
    expect(diff.added.join("\n")).toContain("'callerHasAccess'");
    expect(diff.added.join("\n")).toContain("'callerCanList', mmhr_private.r1_is_super_admin(v_actor)");
  });

  test("lists only pending vendors, with a reason, an independent Super Admin, and AAL2", () => {
    const body = functionBody(sql, "CREATE FUNCTION public.mmhr_list_staff_vendor(");
    expect(body).toContain("r1_start_security_command(\n    'audit.export', NULL::uuid, v_reason");
    expect(body).toContain("IF NOT mmhr_private.r1_is_super_admin(context.actor_identity_id)");
    expect(body).toContain("length(v_reason) NOT BETWEEN 1 AND 500");
    expect(body).toContain("o.type = 'vendor' AND o.status = 'pending'\n    AND NOT o.migration_review_required FOR UPDATE");
    expect(body).toContain("mmhr_private.r1_checked_receipt(context.actor_identity_id, 'staff.vendor.list'");
    expect(body.indexOf("r1_finish_security_command(")).toBeLessThan(body.indexOf("UPDATE public.orgs SET status = 'active'"));
    expect(body.indexOf("UPDATE public.orgs SET status = 'active'"))
      .toBeLessThan(body.indexOf("PERFORM mmhr_private.r1_assert_administration_capacity(context.authorization_time)"));
    expect(body).not.toMatch(/INSERT INTO public\.org_members|user_permission_overrides|invitations/);
  });

  test("opens a vendor workspace only on an active vendor with a post-insert check", () => {
    const body = functionBody(sql, "CREATE FUNCTION public.mmhr_open_staff_vendor_workspace(");
    expect(body).toContain("r1_start_security_command(\n    'admin.access', NULL::uuid, v_reason");
    expect(body).toContain("o.type = 'vendor'\n    AND o.status = 'active' AND NOT o.migration_review_required");
    expect(body).toContain("VALUES (v_org, context.actor_identity_id, v_subject, 'viewer', 'viewer', 'active', false)");
    expect(body).toContain("VALUES (v_org, context.actor_identity_id, v_membership, NULL, 'active', v_reason,");
    expect(body.indexOf("INSERT INTO mmhr_private.staff_case_access_grants"))
      .toBeLessThan(body.lastIndexOf("IF NOT mmhr_private.r1_evaluate_permission(context.actor_identity_id, 'workspace.access'"));
  });

  test("grants the new RPCs to authenticated callers only", () => {
    for (const rpc of rpcs) {
      expect(sql).toContain(`REVOKE ALL ON FUNCTION ${rpc}\n  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker, mmhr_document_worker;`);
      expect(sql).toContain(`GRANT EXECUTE ON FUNCTION ${rpc} TO authenticated;`);
    }
    expect(sql.match(/^GRANT /gm)).toHaveLength(4);
    expect(sql).not.toMatch(/GRANT [^;]*TO (anon|service_role|mmhr_worker|mmhr_document_worker|PUBLIC)/);
  });
});
