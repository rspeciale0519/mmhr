import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const migration = readFileSync(resolve(process.cwd(), "drizzle/0092_r1_invitation_read.sql"), "utf8");
const reviewRestriction = readFileSync(resolve(process.cwd(), "drizzle/0097_r1-invitation-review-read.sql"), "utf8");

describe("R1 invitation read migration review", () => {
  test("excludes both unreviewed entities while retaining caller binding and grants", () => {
    expect(reviewRestriction).toContain("AND NOT invitation.migration_review_required");
    expect(reviewRestriction).toContain("AND NOT organization.migration_review_required");
    expect(reviewRestriction).toContain("mmhr_private.r1_invitation_identity_id()");
    expect(reviewRestriction).toContain("SET search_path = ''");
    expect(reviewRestriction).toContain("GRANT EXECUTE ON FUNCTION public.mmhr_get_my_invitations() TO authenticated");
    expect(reviewRestriction).not.toMatch(/\b(?:UPDATE|DELETE FROM|INSERT INTO)\s+public\./i);
  });
  test("matches only pending invitations for the verified caller", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.mmhr_get_my_invitations()");
    expect(migration).toContain("invitation.normalized_email");
    expect(migration).toContain("mmhr_private.r1_request_identity_id()");
    expect(migration).toContain("invitation.status = 'pending'");
    expect(migration).toContain("invitation.expires_at > CURRENT_TIMESTAMP");
    expect(migration).toContain("organization.status = 'active'");
  });

  test("does not expose tokens or direct table access", () => {
    expect(migration).not.toContain("invitation.token");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.mmhr_get_my_invitations() FROM PUBLIC, anon, authenticated, service_role, mmhr_worker");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.mmhr_get_my_invitations() TO authenticated");
  });
});
