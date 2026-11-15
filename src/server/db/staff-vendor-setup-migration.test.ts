import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const read = (name: string) => readFileSync(`drizzle/${name}`, "utf8").replaceAll("\r\n", "\n");
const sql = read("0177_staff_vendor_setup.sql");

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

const rpcs = [
  "public.mmhr_get_staff_vendor_directory(jsonb)",
  "public.mmhr_create_staff_vendor(jsonb, uuid, uuid)",
  "public.mmhr_enable_staff_vendor_portal(jsonb, uuid, uuid)",
  "public.mmhr_invite_staff_vendor_admin(jsonb, uuid, uuid)",
];

describe("staff vendor setup migration", () => {
  test("changes no table, policy, or private helper, and locks security first", () => {
    expect(sql).not.toMatch(/CREATE TABLE|ALTER TABLE|CREATE POLICY|DROP |DISABLE ROW LEVEL SECURITY|CREATE INDEX/);
    expect(sql).not.toMatch(/FUNCTION mmhr_private\./);
    expect(sql).not.toContain("identity_admin_intents");
    expect(sql.indexOf("SELECT mmhr_private.r1_lock_security()")).toBeLessThan(sql.indexOf("CREATE FUNCTION"));
  });

  test("keeps the capacity check and the evaluator unchanged and calls the check on activation", () => {
    expect(sql).not.toContain("r1_assert_administration_capacity(authorization_time timestamptz)");
    expect(sql).not.toContain("r1_evaluate_permission(");
    const accept = functionBody(sql, "CREATE OR REPLACE FUNCTION public.mmhr_accept_invitation(");
    expect(accept.indexOf("UPDATE public.orgs SET status = 'active'"))
      .toBeLessThan(accept.indexOf("PERFORM mmhr_private.r1_assert_administration_capacity(checked_at);"));
  });

  test("changes acceptance only by the first vendor administrator path", () => {
    const header = "CREATE OR REPLACE FUNCTION public.mmhr_accept_invitation(";
    const diff = lineDiff(functionBody(read("0096_r1-invitation-variable-scope.sql"), header), functionBody(sql, header));
    expect(diff.removed).toEqual(["      AND (o.status <> 'active' OR o.migration_review_required))"]);
    const added = diff.added.join("\n");
    expect(added).toContain("AND NOT (o.status = 'pending' AND o.type = 'vendor' AND NOT o.migration_review_required");
    expect(added).toContain("AND invitation.role_key = 'organization_admin' AND EXISTS (");
    expect(added).toContain("e.action = 'staff.vendor.invite'");
    expect(added).toContain("JOIN auth.mfa_factors f ON f.user_id = i.auth_user_id");
    expect(added).toContain("MESSAGE = 'Two-step sign-in required'");
    expect(added).toContain("'organization.activate'");
    expect(added).not.toMatch(/DELETE|platform_role|user_permission_overrides|portal_access_grants/);
  });

  test("changes the invitation list only by the same pending vendor gate", () => {
    const header = "CREATE OR REPLACE FUNCTION public.mmhr_get_my_invitations()";
    const diff = lineDiff(functionBody(read("0097_r1-invitation-review-read.sql"), header), functionBody(sql, header));
    expect(diff.removed).toEqual(["    AND organization.status = 'active'"]);
    expect(diff.added.join("\n")).toContain("AND organization.type = 'vendor' AND invitation.role_key = 'organization_admin'");
    expect(diff.added.join("\n")).toContain("event.action = 'staff.vendor.invite'");
  });

  test("requires staff access with AAL2 in every new RPC", () => {
    const directory = functionBody(sql, "CREATE FUNCTION public.mmhr_get_staff_vendor_directory(");
    expect(directory).toContain("auth.jwt()->>'aal' IS DISTINCT FROM 'aal2'");
    expect(directory).toContain("r1_request_has_permission('admin.access',NULL::uuid)");
    expect(directory).toContain("o.type = 'vendor'");
    expect(directory).not.toMatch(/intake|rfp|response|commission|customer/i);
    for (const name of ["mmhr_create_staff_vendor", "mmhr_enable_staff_vendor_portal", "mmhr_invite_staff_vendor_admin"]) {
      const body = functionBody(sql, `CREATE FUNCTION public.${name}(`);
      expect(body, name).toContain("r1_start_security_command(\n    'admin.access', NULL::uuid");
      expect(body, name).toContain("mmhr_private.r1_checked_receipt(");
      expect(body, name).toContain("mmhr_private.r1_finish_security_command(");
      expect(body, name).not.toContain("INSERT INTO public.org_members");
      expect(body, name).not.toContain("user_permission_overrides");
    }
    const create = functionBody(sql, "CREATE FUNCTION public.mmhr_create_staff_vendor(");
    expect(create).toContain("VALUES (v_name, 'vendor', 'pending', false");
    const invite = functionBody(sql, "CREATE FUNCTION public.mmhr_invite_staff_vendor_admin(");
    expect(invite).toContain("'admin'::public.org_role, 'organization_admin'");
    expect(invite).toContain("o.status IN ('pending','active')");
  });

  test("grants the new RPCs to authenticated callers only", () => {
    for (const rpc of rpcs) {
      expect(sql).toContain(`REVOKE ALL ON FUNCTION ${rpc}\n  FROM PUBLIC, anon, authenticated, service_role, mmhr_worker, mmhr_document_worker;`);
      expect(sql).toContain(`GRANT EXECUTE ON FUNCTION ${rpc} TO authenticated;`);
    }
    expect(sql.match(/^GRANT /gm)).toHaveLength(6);
    expect(sql).not.toMatch(/GRANT [^;]*TO (anon|service_role|mmhr_worker|mmhr_document_worker|PUBLIC)/);
  });

  test("documents a recovery path", () => {
    expect(sql).toContain("-- Recovery (forward repair; keep every row):");
  });
});
