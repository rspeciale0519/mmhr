import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const sql = readFileSync("drizzle/0109_r3_customer_requirement_save.sql", "utf8").replaceAll("\r\n", "\n");
const prior = readFileSync("drizzle/0105_0105_r3_requirement_commands.sql", "utf8").replaceAll("\r\n", "\n");
const draft = readFileSync("drizzle/0108_r3_customer_intake_draft.sql", "utf8").replaceAll("\r\n", "\n");
const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));

function functionBody(source: string, name: string) {
  const declaration = new RegExp(`CREATE(?: OR REPLACE)? FUNCTION public\\.${name}\\(`);
  const start = source.search(declaration);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = source.indexOf("\n$$;", start);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end + 4).replace("CREATE OR REPLACE FUNCTION", "CREATE FUNCTION");
}
const customer = functionBody(sql, "mmhr_save_customer_intake_requirement");

describe("customer requirement save migration", () => {
  test("adds only the scoped customer action to the current registry", () => {
    const registryEnd = sql.indexOf("SELECT mmhr_private.r1_sync_permission_registry()");
    const registry = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION mmhr_private.r1_permission_registry"), registryEnd);
    const previous = draft.slice(draft.indexOf("CREATE OR REPLACE FUNCTION mmhr_private.r1_permission_registry"),
      draft.indexOf("SELECT mmhr_private.r1_sync_permission_registry()"));
    const addition = ",\n    ('intake.requirement.save', 'action', 'Save intake requirements in an authorized customer portal.', false, true, 'aal1', false, 'customer')";
    expect(registry).toContain(addition);
    expect(registry.replace(addition, "")).toBe(previous);
    expect(sql).toContain("('super_admin'::text, 5)");
    expect(sql).toContain("('organization_admin'::text, 3)");
    expect(sql).toContain("('contributor'::text, 3)");
    expect(sql).toContain("VALUES (next_role.id, 'intake.requirement.save', 'allow')");
    expect(sql).toContain("WHERE d.role_definition_id = prior.id");
    expect(sql).toContain("PERFORM mmhr_private.r1_assert_administration_capacity(checked_at)");
  });

  test("uses the verified caller and current action after the security lock", () => {
    const lock = customer.indexOf("checked_at := mmhr_private.r1_lock_security()");
    const action = customer.indexOf("r1_evaluate_permission(actor.id,'intake.requirement.save'");
    const portal = customer.indexOf("r1_evaluate_permission(actor.id,'portal.customer.access'");
    expect(lock).toBeGreaterThan(0);
    expect(action).toBeGreaterThan(lock);
    expect(portal).toBeGreaterThan(action);
    expect(customer.indexOf("r1_checked_receipt")).toBeGreaterThan(portal);
    expect(customer).toContain("lower(coalesce(claims->>'sub','')) IS DISTINCT FROM lower(auth.uid()::text)");
    expect(customer).toContain("mmhr_private.r1_request_identity_id() IS DISTINCT FROM actor.id");
    expect(customer).toContain("s.user_id=auth.uid() AND (s.not_after IS NULL OR s.not_after>checked_at)");
    expect(customer).toContain("u.email_confirmed_at IS NOT NULL");
    expect(customer).toContain("WHERE i.auth_user_id=provider.id FOR UPDATE");
    expect(customer).not.toContain("r1_start_security_command");
    expect(customer).not.toContain("payload->>'actorIdentityId'");
  });

  test("rejects extra fields and reuses the bounded metadata validator", () => {
    expect(customer).toContain("OR NOT (payload ?& ARRAY['requirementId','organizationId','intakeId','expectedRevision'");
    expect(customer).toContain("WHERE k.key NOT IN ('requirementId','organizationId','intakeId','expectedRevision'");
    expect(customer).toContain("'stableKey','label','importance','weight','response','requirementType')");
    expect(customer).toContain("r3_requirement_payload_is_valid(payload || jsonb_build_object(");
    expect(customer).toContain("'actorIdentityId',auth.uid(),'ownerIdentityId',NULL");
    expect(customer).toContain("'evidenceReferences','[]'::jsonb,'vendorResponseLinks','[]'::jsonb");
  });

  test("preserves metadata it cannot edit and keeps changes within the draft lifecycle", () => {
    const updateStart = customer.indexOf("UPDATE public.intake_requirements r SET");
    const updateEnd = customer.indexOf("RETURNING * INTO requirement;", updateStart);
    const update = customer.slice(updateStart, updateEnd);
    expect(updateStart).toBeGreaterThan(0);
    expect(updateEnd).toBeGreaterThan(updateStart);
    for (const field of ["owner_identity_id", "evidence_references", "vendor_response_links", "status="]) {
      expect(update).not.toContain(field);
    }
    expect(update).toContain("revision=r.revision+1");
    expect(customer).toContain("intake.status NOT IN ('draft','in_progress')");
    expect(customer).toContain("requirement.revision<>expected_revision OR requirement.status<>'active'");
    expect(customer.indexOf("outcome := 'replayed'")).toBeLessThan(customer.indexOf("intake.status NOT IN"));
    expect(customer).toContain("AND r.id=v_requirement_id");
    expect(customer).toContain("AND r.organization_id=v_organization_id AND r.intake_id=v_intake_id");
  });

  test("couples writes to existing history and bounded audit receipts without new raw grants", () => {
    expect(customer).toContain("actor.id,'r3.customer.requirement.save','customer.requirement.save','intake_requirement'");
    expect(customer).toContain("jsonb_build_object('version',1),jsonb_build_object('version',1),checked_at");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.mmhr_save_customer_intake_requirement(jsonb,uuid,uuid)");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.mmhr_save_customer_intake_requirement(jsonb,uuid,uuid) TO authenticated");
    expect(sql).not.toMatch(/GRANT (?:SELECT|INSERT|UPDATE|DELETE|ALL) ON TABLE/i);
    expect(sql).not.toMatch(/DISABLE (?:ROW LEVEL SECURITY|TRIGGER)|DROP TABLE|DELETE FROM/i);
    expect(journal.entries).toContainEqual(expect.objectContaining({ idx: 109, tag: "0109_r3_customer_requirement_save" }));
  });

  test.each(["mmhr_create_intake_requirement", "mmhr_update_intake_requirement"])("preserves %s except the required legacy AAL2 admin check", (name) => {
    const original = functionBody(prior, name);
    const replacement = functionBody(sql, name);
    const check = `  IF mmhr_private.r1_security_actor('admin.access',NULL::uuid,context.authorization_time)
      IS DISTINCT FROM context.actor_identity_id THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Security command denied';
  END IF;
`;
    expect(replacement).toContain(check);
    expect(replacement.replace(check, "")).toBe(original);
    expect(replacement.indexOf(check)).toBeGreaterThan(replacement.indexOf("r1_start_security_command"));
    expect(replacement.indexOf(check)).toBeLessThan(replacement.indexOf("r1_checked_receipt"));
  });
});
