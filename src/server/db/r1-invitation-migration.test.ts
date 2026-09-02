import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

const migration = readFileSync(join(process.cwd(), "drizzle", "0026_r1_invitation_commands.sql"), "utf8");

describe("R1.6 invitation command migration review", () => {
  test("defines fixed create, accept, expire, revoke, and resend RPCs", () => {
    for (const name of [
      "mmhr_create_invitation",
      "mmhr_accept_invitation",
      "mmhr_expire_invitation",
      "mmhr_revoke_invitation",
      "mmhr_resend_invitation",
    ]) {
      expect(migration).toContain(`FUNCTION public.${name}`);
    }
  });

  test("uses reviewed security helpers for every administrative transition", () => {
    expect((migration.match(/r1_start_security_command/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect((migration.match(/r1_checked_receipt/g) ?? []).length).toBeGreaterThanOrEqual(5);
    expect((migration.match(/r1_finish_security_command/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect(migration).toContain("security_command_receipts");
    expect(migration).toContain("audit_events");
  });

  test("does not store application invitation tokens and creates provider-neutral delivery work", () => {
    expect(migration).toContain("token, status");
    expect(migration).toContain("'invitation_delivery'");
    expect(migration).toContain("identity_admin_intents");
    expect(migration).toContain("sha256");
  });

  test("restricts public function execution to authenticated callers", () => {
    expect((migration.match(/REVOKE ALL ON FUNCTION public\.mmhr_/g) ?? []).length).toBe(5);
    expect((migration.match(/GRANT EXECUTE ON FUNCTION public\.mmhr_/g) ?? []).length).toBe(5);
    expect(migration).toContain("FROM PUBLIC, anon, authenticated, service_role, mmhr_worker");
    expect(migration).toContain("TO authenticated");
  });

  test("keeps acceptance bound to the verified identity and invitation email", () => {
    expect(migration).toContain("i.auth_user_id = auth.uid()");
    expect(migration).toContain("i.normalized_email = lower(btrim(verified_email))");
    expect(migration).toContain("invitation.normalized_email <> lower(btrim(verified_email))");
    expect(migration).toContain("INSERT INTO public.org_members");
  });
});
