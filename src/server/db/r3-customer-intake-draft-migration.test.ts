import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const sql = readFileSync("drizzle/0108_r3_customer_intake_draft.sql", "utf8");
const legacySource = readFileSync("drizzle/0103_r3_intake_save_guards.sql", "utf8");
const journal = readFileSync("drizzle/meta/_journal.json", "utf8");

function legacyWrapper(source: string, declaration: string): string {
  const start = source.indexOf(declaration);
  const end = source.indexOf(
    "GRANT EXECUTE ON FUNCTION public.mmhr_save_intake(jsonb,uuid,uuid) TO authenticated;",
    start,
  );
  return source.slice(start, end + "GRANT EXECUTE ON FUNCTION public.mmhr_save_intake(jsonb,uuid,uuid) TO authenticated;".length);
}

function customerRpc(): string {
  const start = sql.indexOf("CREATE FUNCTION public.mmhr_save_customer_intake");
  const end = sql.indexOf("CREATE OR REPLACE FUNCTION public.mmhr_save_intake", start);
  return sql.slice(start, end);
}

describe("R3 customer intake draft migration boundary", () => {
  test("registers one narrow customer action and versions only approved roles", () => {
    expect(sql).toContain("('intake.draft.save', 'action'");
    expect(sql).toContain("Save draft intake answers in an authorized customer portal.");
    expect(sql).toContain("'aal1', false, 'customer'");
    expect(sql).toContain("('super_admin'::text, 4)");
    expect(sql).toContain("('organization_admin'::text, 2)");
    expect(sql).toContain("('contributor'::text, 2)");
    expect(sql).toContain("VALUES (next_role.id, 'intake.draft.save', 'allow')");
    expect(sql).not.toContain("DROP TABLE");
    expect(sql).not.toContain("DISABLE ROW LEVEL SECURITY");
  });

  test("uses a caller-bound AAL1 session and rechecks both permissions after the lock", () => {
    const rpc = customerRpc();
    const lock = rpc.indexOf("checked_at := mmhr_private.r1_lock_security()");
    const action = rpc.indexOf("'intake.draft.save'");
    const portal = rpc.indexOf("'portal.customer.access'");
    expect(lock).toBeGreaterThanOrEqual(0);
    expect(action).toBeGreaterThan(lock);
    expect(portal).toBeGreaterThan(action);
    expect(rpc).toContain("lower(coalesce(claims->>'sub','')) IS DISTINCT FROM lower(auth.uid()::text)");
    expect(rpc).toContain("WHERE i.auth_user_id=provider.id FOR UPDATE");
    expect(rpc).toContain("mmhr_private.r1_request_identity_id() IS DISTINCT FROM actor.id");
    expect(rpc).not.toContain("actorIdentityId");
    expect(rpc).not.toContain("r1_start_security_command");
  });

  test("keeps the write draft-only, bounded, revision-safe, and audited", () => {
    const rpc = customerRpc();
    expect(rpc).toContain("NOT IN ('draft','in_progress')");
    expect(rpc).toContain("intake.status NOT IN ('draft','in_progress')");
    expect(rpc).toContain("r1_checked_receipt(actor.id,'r3.customer.intake.save'");
    expect(rpc).toContain("INSERT INTO public.intake_history");
    expect(rpc).toContain("r1_finish_security_command");
    expect(rpc).toContain("jsonb_build_object('version',1),jsonb_build_object('version',1),checked_at");
    expect(rpc).toContain("Customer intake revision denied");
    expect(rpc).not.toContain("status='submitted'");
    expect(rpc).not.toContain("NOT IN ('draft','in_progress','submitted')");
  });

  test("exposes only the authenticated RPC and records generated migration metadata", () => {
    expect(sql).toContain("SECURITY DEFINER SET search_path = ''");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.mmhr_save_customer_intake(jsonb,uuid,uuid)");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.mmhr_save_customer_intake(jsonb,uuid,uuid) TO authenticated");
    expect(sql).toContain("CREATE TRIGGER intake_history_append_only BEFORE UPDATE OR DELETE");
    expect(sql).toContain("CREATE TRIGGER intake_history_no_truncate BEFORE TRUNCATE");
    expect(sql).toContain("PERFORM mmhr_private.r1_assert_administration_capacity(checked_at)");
    expect(sql).toContain("payload ?& ARRAY['intakeId','organizationId','expectedRevision','status','data']");
    expect(sql).not.toMatch(/GRANT (SELECT|INSERT|UPDATE|DELETE|ALL) ON TABLE public\.(intakes|intake_history)/i);
    expect(journal).toContain('"tag": "0108_r3_customer_intake_draft"');
  });

  test("narrows the legacy writer only with the platform AAL2 check", () => {
    const original = legacyWrapper(legacySource, "CREATE FUNCTION public.mmhr_save_intake");
    const replacement = legacyWrapper(sql, "CREATE OR REPLACE FUNCTION public.mmhr_save_intake");
    const narrowCheck = `  IF mmhr_private.r1_security_actor('admin.access',NULL::uuid,context.authorization_time)
      IS DISTINCT FROM context.actor_identity_id THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied';
  END IF;
`;
    const normalize = (value: string) => value
      .replace(/\r\n/g, "\n")
      .replace("CREATE OR REPLACE FUNCTION", "CREATE FUNCTION")
      .replace(narrowCheck.replace(/\r\n/g, "\n"), "")
      .trim();
    expect(normalize(replacement)).toBe(normalize(original));
    const actorCheck = replacement.indexOf("(payload->>'actorIdentityId')::uuid IS DISTINCT FROM context.actor_identity_id");
    expect(actorCheck).toBeGreaterThan(0);
    expect(replacement.indexOf("r1_security_actor('admin.access'")).toBeGreaterThan(
      actorCheck,
    );
    expect(replacement.indexOf("r1_security_actor('admin.access'")).toBeLessThan(
      replacement.indexOf("r1_checked_receipt"),
    );
  });
});
