import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createSecurityCommandApiFixtures, elevatedClient, verifiedApiClaims, type SecurityCommandApiFixtures } from "@/server/auth/security-command-api-fixtures";
import { AuthorizationError, type RequestSupabaseClient } from "@/server/auth/authorization";
import { reserveWorkspaceDocument } from "@/server/commands/document-reservations";
import { getWorkspaceDocumentHistory, getWorkspaceDocuments, getWorkspaceDocumentVersions } from "@/server/commands/workspace-documents";

describe("workspace document reads through genuine local Auth", () => {
  let fixture: SecurityCommandApiFixtures;
  const vendorOrg = randomUUID(), customerDocument = randomUUID(), customerVersion = randomUUID(), vendorDocument = randomUUID(), vendorVersion = randomUUID();
  const bytes = Buffer.from("%PDF-1.7\nsynthetic metadata Auth bytes");
  const reservation = (organizationId: string, documentId: string, versionId: string) => ({ organizationId, documentId, versionId, expectedVersion: 0,
    fileName: "synthetic.pdf", declaredMimeType: "application/pdf", correlationId: randomUUID(), idempotencyKey: randomUUID() });
  const input = (organizationId: string) => ({ organizationId, correlationId: randomUUID() });
  beforeAll(async () => {
    fixture = await createSecurityCommandApiFixtures();
    await fixture.owner`INSERT INTO public.orgs(id,name,type,status,activated_at,migration_review_required)
      VALUES(${vendorOrg}::uuid,'Synthetic metadata vendor','vendor','active',now(),false)`;
    await fixture.owner`INSERT INTO public.org_members(org_id,identity_id,user_id,role,role_key,migration_review_required)
      VALUES(${vendorOrg}::uuid,${fixture.outsider.identityId}::uuid,${fixture.outsider.subjectId}::uuid,'contributor','contributor',false),
      (${vendorOrg}::uuid,${fixture.organizationAdmin.identityId}::uuid,${fixture.organizationAdmin.subjectId}::uuid,'admin','organization_admin',false),
      (${fixture.organizationId}::uuid,${fixture.pair[0].identityId}::uuid,${fixture.pair[0].subjectId}::uuid,'viewer','viewer',false),
      (${fixture.organizationId}::uuid,${fixture.identityTarget.identityId}::uuid,${fixture.identityTarget.subjectId}::uuid,'contributor','contributor',false)`;
    for (const permission of ["workspace.access", "rfp.approve"]) await fixture.owner`INSERT INTO public.user_permission_overrides(
      identity_id,permission_key,scope_kind,organization_id,scope_key,effect,issued_by_identity_id,issue_reason)
      VALUES(${fixture.pair[0].identityId}::uuid,${permission},'organization',${fixture.organizationId}::uuid,
        ${"organization:" + fixture.organizationId},'allow',${fixture.pair[1].identityId}::uuid,'Synthetic assigned metadata staff')`;
    await fixture.owner`SELECT mmhr_private.r1_assert_administration_capacity(clock_timestamp())`;
    await reserveWorkspaceDocument(reservation(fixture.organizationId, customerDocument, customerVersion), bytes,
      { supabase: fixture.identityTarget.aal1 as RequestSupabaseClient });
    await reserveWorkspaceDocument(reservation(vendorOrg, vendorDocument, vendorVersion), bytes,
      { supabase: fixture.outsider.aal1 as RequestSupabaseClient });
  }, 300_000);
  afterAll(async () => { if (fixture) await fixture.close(); }, 180_000);
  test("returns an ordinary customer's pending file status with current writer capability", async () => {
    const page = await getWorkspaceDocuments(input(fixture.organizationId), { supabase: fixture.identityTarget.aal1 as RequestSupabaseClient });
    expect(page.canUpload).toBe(true); expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({ documentId: customerDocument, versionId: customerVersion, state: "received", failureCode: null });
  });
  test("searches through genuine customer, vendor, and assigned staff sessions", async () => {
    const customer = await getWorkspaceDocuments({ ...input(fixture.organizationId), searchQuery: " SYNTHETIC " },
      { supabase: fixture.identityTarget.aal1 as RequestSupabaseClient });
    expect(customer.items.map((row) => row.documentId)).toEqual([customerDocument]);
    const vendor = await getWorkspaceDocuments({ ...input(vendorOrg), searchQuery: "synthetic" },
      { supabase: fixture.outsider.aal1 as RequestSupabaseClient });
    expect(vendor.items.map((row) => row.documentId)).toEqual([vendorDocument]);
    const staff = await getWorkspaceDocuments({ ...input(fixture.organizationId), searchQuery: "synthetic" },
      { supabase: elevatedClient(fixture.pair[0]) as RequestSupabaseClient });
    expect(staff.items.map((row) => row.documentId)).toEqual([customerDocument]);
    const missing = await getWorkspaceDocuments({ ...input(vendorOrg), searchQuery: "%" },
      { supabase: fixture.outsider.aal1 as RequestSupabaseClient });
    expect(missing.items).toEqual([]);
    await expect(getWorkspaceDocuments({ ...input(fixture.organizationId), searchQuery: "synthetic" },
      { supabase: fixture.outsider.aal1 as RequestSupabaseClient })).rejects.toBeInstanceOf(AuthorizationError);
  });
  test("shows version and history summaries through the same genuine scoped session", async () => {
    const options = { supabase: fixture.identityTarget.aal1 as RequestSupabaseClient };
    const versions = await getWorkspaceDocumentVersions({ ...input(fixture.organizationId), documentId: customerDocument }, options);
    expect(versions.items.map((row) => row.versionId)).toEqual([customerVersion]);
    const history = await getWorkspaceDocumentHistory({ ...input(fixture.organizationId), documentId: customerDocument, versionId: customerVersion }, options);
    expect(history.items.map((row) => row.action)).toEqual(["reserve"]);
    expect(Object.keys(history.items[0]!).sort()).toEqual(["action", "occurredAt", "revision"]);
  });
  test("allows a viewer to see metadata while denying a new upload", async () => {
    await fixture.owner`UPDATE public.org_members SET role='viewer',role_key='viewer'
      WHERE org_id=${fixture.organizationId}::uuid AND identity_id=${fixture.identityTarget.identityId}::uuid`;
    try {
      const options = { supabase: fixture.identityTarget.aal1 as RequestSupabaseClient };
      const page = await getWorkspaceDocuments({ ...input(fixture.organizationId), searchQuery: "synthetic" }, options);
      expect(page.canUpload).toBe(false); expect(page.items).toHaveLength(1);
      await expect(reserveWorkspaceDocument(reservation(fixture.organizationId, randomUUID(), randomUUID()), bytes, options)).rejects.toBeInstanceOf(AuthorizationError);
    } finally {
      await fixture.owner`UPDATE public.org_members SET role='contributor',role_key='contributor'
        WHERE org_id=${fixture.organizationId}::uuid AND identity_id=${fixture.identityTarget.identityId}::uuid`;
    }
  });
  test("limits vendor metadata to its own private workspace", async () => {
    const options = { supabase: fixture.outsider.aal1 as RequestSupabaseClient };
    const page = await getWorkspaceDocuments(input(vendorOrg), options); expect(page.items.map((row) => row.documentId)).toEqual([vendorDocument]);
    await expect(getWorkspaceDocuments(input(fixture.organizationId), options)).rejects.toBeInstanceOf(AuthorizationError);
    await expect(getWorkspaceDocumentVersions({ ...input(vendorOrg), documentId: customerDocument }, options)).rejects.toBeInstanceOf(AuthorizationError);
  });
  test("allows assigned internal AAL2 staff and denies anonymous requests", async () => {
    const page = await getWorkspaceDocuments(input(fixture.organizationId), { supabase: elevatedClient(fixture.pair[0]) as RequestSupabaseClient });
    expect(page.canUpload).toBe(true); expect(page.items).toHaveLength(1);
    await expect(getWorkspaceDocuments(input(fixture.organizationId), { supabase: fixture.anonymous as RequestSupabaseClient })).rejects.toBeInstanceOf(AuthorizationError);
  });
  test("rejects a genuine token after membership suspension at command and direct RPC boundaries", async () => {
    await fixture.owner`UPDATE public.org_members SET status='suspended',suspended_at=clock_timestamp()
      WHERE org_id=${fixture.organizationId}::uuid AND identity_id=${fixture.identityTarget.identityId}::uuid`;
    try {
      await expect(getWorkspaceDocuments(input(fixture.organizationId), { supabase: fixture.identityTarget.aal1 as RequestSupabaseClient })).rejects.toBeInstanceOf(AuthorizationError);
      const response = await fixture.identityTarget.aal1.rpc("mmhr_get_workspace_documents", { payload: { organizationId: fixture.organizationId }, correlation_id: randomUUID() });
      expect(response.error?.code).toBe("42501");
    } finally {
      await fixture.owner`UPDATE public.org_members SET status='active',suspended_at=NULL
        WHERE org_id=${fixture.organizationId}::uuid AND identity_id=${fixture.identityTarget.identityId}::uuid`;
    }
  });
  test("rejects a banned provider while the original signed token still has time remaining", async () => {
    const original = await verifiedApiClaims(fixture.outsider.aal1, "aal1"); expect(Date.parse(original.expiresAt)).toBeGreaterThan(Date.now());
    await fixture.owner`UPDATE auth.users SET banned_until=clock_timestamp()+interval '1 hour' WHERE id=${fixture.outsider.subjectId}::uuid`;
    try {
      const response = await fixture.outsider.aal1.rpc("mmhr_get_workspace_documents", { payload: { organizationId: vendorOrg }, correlation_id: randomUUID() });
      expect(response.error?.code).toBe("42501");
    } finally { await fixture.owner`UPDATE auth.users SET banned_until=NULL WHERE id=${fixture.outsider.subjectId}::uuid`; }
  });
  test("rejects a removed Auth session with its earlier signed token", async () => {
    const original = await verifiedApiClaims(fixture.outsider.aal1, "aal1");
    await fixture.owner`DELETE FROM auth.sessions WHERE id=${original.sessionId}::uuid`;
    const response = await fixture.outsider.aal1.rpc("mmhr_get_workspace_documents", { payload: { organizationId: vendorOrg }, correlation_id: randomUUID() });
    expect(response.error?.code).toBe("42501");
  });
});
