import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createSecurityCommandApiFixtures, elevatedClient, type SecurityCommandApiFixtures } from "@/server/auth/security-command-api-fixtures";
import { AuthorizationError, type RequestSupabaseClient } from "@/server/auth/authorization";
import { reserveWorkspaceDocument } from "@/server/commands/document-reservations";

describe("document reservations through genuine local Auth", () => {
  let fixture: SecurityCommandApiFixtures;
  const vendorOrg = randomUUID();
  beforeAll(async () => {
    fixture = await createSecurityCommandApiFixtures();
    await fixture.owner`INSERT INTO public.orgs(id,name,type,status,activated_at,migration_review_required)
      VALUES(${vendorOrg}::uuid,'Synthetic document vendor','vendor','active',now(),false)`;
    await fixture.owner`INSERT INTO public.org_members(org_id,identity_id,user_id,role,role_key,migration_review_required)
      VALUES(${vendorOrg}::uuid,${fixture.outsider.identityId}::uuid,${fixture.outsider.subjectId}::uuid,'contributor','contributor',false),
      (${vendorOrg}::uuid,${fixture.organizationAdmin.identityId}::uuid,${fixture.organizationAdmin.subjectId}::uuid,'admin','organization_admin',false),
      (${fixture.organizationId}::uuid,${fixture.pair[0].identityId}::uuid,${fixture.pair[0].subjectId}::uuid,'viewer','viewer',false),
      (${fixture.organizationId}::uuid,${fixture.identityTarget.identityId}::uuid,${fixture.identityTarget.subjectId}::uuid,'contributor','contributor',false)`;
    for (const permission of ["workspace.access", "rfp.approve"]) {
      await fixture.owner`INSERT INTO public.user_permission_overrides(identity_id,permission_key,scope_kind,organization_id,scope_key,effect,issued_by_identity_id,issue_reason)
        VALUES(${fixture.pair[0].identityId}::uuid,${permission},'organization',${fixture.organizationId}::uuid,
        ${"organization:" + fixture.organizationId},'allow',${fixture.pair[1].identityId}::uuid,'Synthetic assigned document staff')`;
    }
    await fixture.owner`SELECT mmhr_private.r1_assert_administration_capacity(clock_timestamp())`;
  }, 300_000);
  afterAll(async () => { if (fixture) await fixture.close(); }, 180_000);

  const bytes = Buffer.from("%PDF-1.7\nsynthetic Auth reservation bytes");
  const input = (organizationId: string) => ({ organizationId, documentId: randomUUID(), versionId: randomUUID(),
    expectedVersion: 0, fileName: "synthetic.pdf", declaredMimeType: "application/pdf",
    correlationId: randomUUID(), idempotencyKey: randomUUID() });
  test("allows an ordinary customer writer with verified AAL1 claims", async () => {
    const request = input(fixture.organizationId);
    const client = fixture.identityTarget.aal1 as RequestSupabaseClient;
    await expect(reserveWorkspaceDocument(request, bytes, { supabase: client })).resolves.toMatchObject({
      documentId: request.documentId, versionId: request.versionId, state: "received", outcomeCode: "recorded" });
    await expect(reserveWorkspaceDocument(request, bytes, { supabase: client })).resolves.toMatchObject({ outcomeCode: "replayed" });
    const [row] = await fixture.owner`SELECT uploaded_by_identity_id FROM public.workflow_document_uploads WHERE version_id=${request.versionId}::uuid`;
    expect(row!.uploaded_by_identity_id).toBe(fixture.identityTarget.identityId);
  });
  test("allows a vendor writer only in its own private workspace", async () => {
    const client = fixture.outsider.aal1 as RequestSupabaseClient;
    await expect(reserveWorkspaceDocument(input(vendorOrg), bytes, { supabase: client })).resolves.toMatchObject({ organizationId: vendorOrg });
    await expect(reserveWorkspaceDocument(input(fixture.organizationId), bytes, { supabase: client })).rejects.toBeInstanceOf(AuthorizationError);
  });
  test("allows assigned internal AAL2 staff without giving ordinary viewers write access", async () => {
    const request = input(fixture.organizationId);
    await expect(reserveWorkspaceDocument(request, bytes, { supabase: elevatedClient(fixture.pair[0]) as RequestSupabaseClient }))
      .resolves.toMatchObject({ organizationId: fixture.organizationId, state: "received", outcomeCode: "recorded" });
    const [row] = await fixture.owner`SELECT uploaded_by_identity_id FROM public.workflow_document_uploads WHERE version_id=${request.versionId}::uuid`;
    expect(row!.uploaded_by_identity_id).toBe(fixture.pair[0].identityId);
  });
  test("denies a genuine viewer despite valid workspace read authorization", async () => {
    const client = fixture.membershipTarget.aal1 as RequestSupabaseClient;
    const authorized = await client.rpc("mmhr_authorize", { permission_key: "workspace.access", organization_id: fixture.organizationId });
    expect(authorized.error).toBeNull(); expect(authorized.data).toHaveLength(1);
    await expect(reserveWorkspaceDocument(input(fixture.organizationId), bytes, { supabase: client })).rejects.toBeInstanceOf(AuthorizationError);
  });
  test("denies anonymous requests and stale tokens after current membership suspension", async () => {
    await expect(reserveWorkspaceDocument(input(fixture.organizationId), bytes,
      { supabase: fixture.anonymous as RequestSupabaseClient })).rejects.toBeInstanceOf(AuthorizationError);
    const client = fixture.outsider.aal1 as RequestSupabaseClient, request = input(vendorOrg);
    await reserveWorkspaceDocument(request, bytes, { supabase: client });
    await fixture.owner`UPDATE public.org_members SET status='suspended',suspended_at=clock_timestamp()
      WHERE org_id=${vendorOrg}::uuid AND identity_id=${fixture.outsider.identityId}::uuid`;
    await expect(reserveWorkspaceDocument(request, bytes, { supabase: client })).rejects.toBeInstanceOf(AuthorizationError);
  });
});
