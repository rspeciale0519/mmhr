import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createSecurityCommandApiFixtures, elevatedClient, verifiedApiClaims, type SecurityApiPrincipal,
  type SecurityCommandApiFixtures } from "@/server/auth/security-command-api-fixtures";
import type { RequestSupabaseClient } from "@/server/auth/authorization";
import { getWorkspaceDocumentReview, issueWorkspaceDocumentAccess, recordWorkspaceDocumentReview,
  resolveWorkspaceDocumentAccess } from "@/server/commands/workspace-document-review";
import { reserveWorkspaceDocument, completeWorkspaceDocumentUpload } from "@/server/commands/document-reservations";
import { getWorkspaceDocumentHistory, getWorkspaceDocuments } from "@/server/commands/workspace-documents";
import { DOCUMENT_QUARANTINE_BUCKET } from "@/server/workflows/document-store";
import type { DocumentScanClaim } from "@/server/workflows/document-scan-worker";
import { createSupabaseDocumentStore } from "./supabase-document-store";
import { downloadWorkspaceDocument } from "./workspace-document-download";

describe("independent document review and bounded access through genuine Auth and Storage", () => {
  let fixture: SecurityCommandApiFixtures, lowStaff: SecurityApiPrincipal;
  let processor: Awaited<ReturnType<SecurityCommandApiFixtures["createDocumentScanProcessor"]>>;
  const bytes = Buffer.from("%PDF-1.7\nSynthetic manual document review\n%%EOF");
  const options = (actor = fixture.pair[0], high = true) => ({ supabase: (high ? elevatedClient(actor) : actor.aal1) as RequestSupabaseClient });
  const base = () => ({ organizationId: fixture.organizationId, correlationId: randomUUID() });
  const metadata = () => ({ ...base(), idempotencyKey: randomUUID() });

  beforeAll(async () => {
    fixture = await createSecurityCommandApiFixtures({ storage: true });
    await fixture.createPrivateDocumentBucket();
    await fixture.owner`SELECT mmhr_private.r4_install_document_storage_upload_policies()`;
    await fixture.owner`SELECT mmhr_private.r4_install_document_scan_read_policies()`;
    await fixture.owner`SELECT mmhr_private.r4_install_document_content_read_policies()`;
    for (const staff of fixture.pair) {
      await fixture.owner`INSERT INTO public.org_members(org_id,identity_id,user_id,role,role_key,migration_review_required)
        VALUES(${fixture.organizationId}::uuid,${staff.identityId}::uuid,${staff.subjectId}::uuid,'viewer','viewer',false)`;
      for (const permission of ["workspace.access", "rfp.approve"]) await fixture.owner`INSERT INTO public.user_permission_overrides(
        identity_id,permission_key,scope_kind,organization_id,scope_key,effect,issued_by_identity_id,issue_reason)
        VALUES(${staff.identityId}::uuid,${permission},'organization',${fixture.organizationId}::uuid,${`organization:${fixture.organizationId}`},
          'allow',${fixture.organizationAdmin.identityId}::uuid,'Synthetic document review assignment')`;
    }
    await fixture.owner`INSERT INTO public.org_members(org_id,identity_id,user_id,role,role_key,migration_review_required)
      VALUES(${fixture.organizationId}::uuid,${fixture.identityTarget.identityId}::uuid,${fixture.identityTarget.subjectId}::uuid,'contributor','contributor',false)`;
    lowStaff = await fixture.createSyntheticPrincipal({ mfa: true });
    const [assignment] = await fixture.owner<{ id: string }[]>`INSERT INTO public.platform_role_assignments(identity_id,role_key,assigned_at,assignment_reason)
      VALUES(${lowStaff.identityId}::uuid,'staff',clock_timestamp(),'Synthetic current low-assurance document reviewer') RETURNING id`;
    await fixture.owner`INSERT INTO public.role_authority_records(record_kind,authority_kind,platform_assignment_id,role_definition_id,correlation_id,created_at)
      SELECT 'platform_assignment','reviewed_owner',${assignment!.id}::uuid,r.id,${randomUUID()}::uuid,a.assigned_at
      FROM public.role_definitions r JOIN public.platform_role_assignments a ON a.id=${assignment!.id}::uuid
      WHERE r.stable_key='staff' AND r.kind='platform' AND r.state='active'`;
    await fixture.owner`INSERT INTO public.org_members(org_id,identity_id,user_id,role,role_key,migration_review_required)
      VALUES(${fixture.organizationId}::uuid,${lowStaff.identityId}::uuid,${lowStaff.subjectId}::uuid,'viewer','viewer',false)`;
    for (const permission of ["workspace.access", "rfp.approve"]) await fixture.owner`INSERT INTO public.user_permission_overrides(
      identity_id,permission_key,scope_kind,organization_id,scope_key,effect,issued_by_identity_id,issue_reason)
      VALUES(${lowStaff.identityId}::uuid,${permission},'organization',${fixture.organizationId}::uuid,${`organization:${fixture.organizationId}`},
        'allow',${fixture.pair[0].identityId}::uuid,'Synthetic low-assurance document reviewer')`;
    processor = await fixture.createDocumentScanProcessor();
  }, 540_000);
  afterAll(async () => { try { if (processor) await processor.close(); } finally { if (fixture) await fixture.close(); } }, 180_000);

  async function upload(actor = fixture.identityTarget, replacement?: { documentId: string; expectedVersion: number }) {
    const input = { ...metadata(), documentId: replacement?.documentId ?? randomUUID(), expectedVersion: replacement?.expectedVersion ?? 0,
      versionId: randomUUID(), fileName: "synthetic.pdf", declaredMimeType: "application/pdf" as const };
    const client = actor.aal2 ?? actor.aal1;
    const scoped = { supabase: client as RequestSupabaseClient };
    await reserveWorkspaceDocument(input, bytes, scoped);
    await createSupabaseDocumentStore(scoped.supabase).putQuarantined({ organizationId: input.organizationId, documentId: input.documentId,
      versionId: input.versionId, fileName: input.fileName, declaredMimeType: input.declaredMimeType, bytes });
    await completeWorkspaceDocumentUpload({ ...metadata(), documentId: input.documentId, versionId: input.versionId, expectedRevision: 1 }, scoped);
    return { documentId: input.documentId, versionId: input.versionId };
  }
  async function clean() {
    const target = await upload();
    const claim = await processor.repository.claim(target.versionId) as DocumentScanClaim;
    expect(claim.versionId).toBe(target.versionId);
    // This suite verifies real private bytes and signed Auth. Scanner evidence
    // is modeled here; the separate combined scan suite proves actual ClamAV.
    await processor.repository.finish(claim, { state: "ready", failureCode: null, scanEvidence: {
      versionId: claim.versionId, sha256: claim.sha256, state: "clean", scanner: "clamav", scannerVersion: "1.4.6",
      signatureVersion: 28139, signatureUpdatedAt: new Date(Date.now()-3_600_000).toISOString(),
      scannedAt: new Date().toISOString(), failureCode: null,
    } });
    return target;
  }
  const start = (target: { documentId: string; versionId: string }) => ({ ...metadata(), ...target,
    action: "begin_review" as const, expectedRevision: 4, reason: "Synthetic manual content review", reviewReference: "synthetic:review" });
  async function reviewing() {
    const target = await clean();
    await recordWorkspaceDocumentReview(start(target), options());
    return target;
  }
  const accessInput = (target: { documentId: string; versionId: string }, revision = 5, purpose = "review" as "review" | "approved") =>
    ({ ...metadata(), ...target, expectedRevision: revision, purpose });
  const resolveInput = (grant: { accessId: string; accessToken: string }) => ({ ...base(), accessId: grant.accessId, accessToken: grant.accessToken });
  const decision = (target: { documentId: string; versionId: string }, accessId: string, action = "approve" as "approve" | "reject") =>
    ({ ...metadata(), ...target, action, expectedRevision: 5, reason: "Private synthetic independent review reason",
      reviewReference: "synthetic:decision", reviewedAccessId: accessId, contentsReviewed: true as const });
  const bucket = (actor = fixture.pair[0]) => (actor.aal2 ?? actor.aal1).storage.from(DOCUMENT_QUARANTINE_BUCKET);
  const objectPath = (target: { documentId: string; versionId: string }) => `${fixture.organizationId}/${target.documentId}/${target.versionId}`;

  test("refuses ordinary and repeated content policy installation", async () => {
    await expect(fixture.owner.begin(async sql => { await sql`SET LOCAL ROLE authenticated`;
      await sql`SELECT mmhr_private.r4_install_document_content_read_policies()`; })).rejects.toMatchObject({ code: "42501" });
    await expect(fixture.owner`SELECT mmhr_private.r4_install_document_content_read_policies()`).rejects.toMatchObject({ code: "42501" });
  });
  test("denies quarantined content, approval, and access even to MFA staff", async () => {
    const target = await upload();
    expect((await bucket().download(objectPath(target))).error).not.toBeNull();
    await expect(issueWorkspaceDocumentAccess(accessInput(target, 2), options())).rejects.toThrow("Request is not authorized");
    await expect(recordWorkspaceDocumentReview({ ...start(target), expectedRevision: 2 }, options())).rejects.toThrow("Request is not authorized");
  });
  test("accepts the exact independent review payload through the signed Auth RPC", async () => {
    const target = await clean(), input = start(target);
    const { correlationId, idempotencyKey, ...payload } = input;
    const response = await elevatedClient(fixture.pair[0]).rpc("mmhr_record_workspace_document_review", {
      payload, correlation_id: correlationId, idempotency_key: idempotencyKey,
    });
    expect(response.error).toBeNull();
    expect(response.data).toMatchObject({ state: "needs_review", revision: 5, outcomeCode: "recorded" });
    const replay = await elevatedClient(fixture.pair[0]).rpc("mmhr_record_workspace_document_review", {
      payload, correlation_id: correlationId, idempotency_key: idempotencyKey,
    });
    expect(replay.error).toBeNull();
    expect(replay.data).toMatchObject({ state: "needs_review", revision: 5, outcomeCode: "replayed" });
  });
  test("rejects malformed references, byte limits, revisions, and injected authority through the actual RPC", async () => {
    const target = await clean(), input = start(target);
    const { correlationId, idempotencyKey, ...payload } = input;
    for (const changed of [{ reviewReference: "x".repeat(501) }, { reviewReference: "invalid reference" },
      { reason: "é".repeat(1001) }, { reason: "one\ntwo" }, { reason: "password=synthetic" }, { reason: "See https://example.invalid/private" },
      { expectedRevision: "4" }, { actorIdentityId: fixture.pair[0].identityId },
      { action: "approve", reviewedAccessId: randomUUID(), contentsReviewed: false }]) {
      const response = await elevatedClient(fixture.pair[0]).rpc("mmhr_record_workspace_document_review", {
        payload: { ...payload, ...changed }, correlation_id: correlationId, idempotency_key: idempotencyKey,
      });
      expect(response.error?.code).toBe("22023");
    }
    expect((await getWorkspaceDocumentReview({ ...base(), ...target }, options())).document.state).toBe("ready");
  });
  test("binds independent review, exact retries, and immutable history to the scanned original", async () => {
    const target = await clean(), input = start(target);
    await expect(getWorkspaceDocumentReview({ ...base(), ...target }, options())).resolves.toMatchObject({ canReview: true,
      document: { state: "ready", revision: 4 } });
    await expect(recordWorkspaceDocumentReview(input, options())).resolves.toMatchObject({ state: "needs_review", revision: 5, outcomeCode: "recorded" });
    await expect(recordWorkspaceDocumentReview(input, options())).resolves.toMatchObject({ state: "needs_review", revision: 5, outcomeCode: "replayed" });
    await expect(recordWorkspaceDocumentReview({ ...input, reason: "Changed retry" }, options())).rejects.toThrow("Document request failed");
    const history = await getWorkspaceDocumentHistory({ ...base(), ...target }, options(fixture.identityTarget, false));
    expect(history.items.map(row => row.action)).toEqual(["reserve", "uploaded", "scan_claimed", "scan_clean", "review_started"]);
    expect(JSON.stringify(history)).not.toContain(input.reason);
  });
  test("requires an explicit content decision and the same reviewer's current access request", async () => {
    const target = await reviewing(), grant = await issueWorkspaceDocumentAccess(accessInput(target), options());
    const input = decision(target, grant.accessId);
    await expect(recordWorkspaceDocumentReview({ ...input, contentsReviewed: false }, options())).rejects.toThrow();
    await expect(recordWorkspaceDocumentReview({ ...input, reviewedAccessId: randomUUID() }, options())).rejects.toThrow("Request is not authorized");
    await expect(recordWorkspaceDocumentReview(input, options(fixture.pair[1]))).rejects.toThrow("Request is not authorized");
    expect((await getWorkspaceDocumentReview({ ...base(), ...target }, options())).document.state).toBe("needs_review");
  });
  test("reads exact private bytes through a bounded session and approves without exposing staff reasons", async () => {
    const target = await reviewing(), input = accessInput(target), grant = await issueWorkspaceDocumentAccess(input, options());
    const { correlationId, idempotencyKey, ...payload } = input;
    const retry = await elevatedClient(fixture.pair[0]).rpc("mmhr_issue_workspace_document_access", {
      payload, correlation_id: correlationId, idempotency_key: idempotencyKey,
    });
    expect(retry.error).toBeNull();
    const replay = await issueWorkspaceDocumentAccess(input, options());
    expect(replay).toMatchObject({ accessId: grant.accessId, accessToken: grant.accessToken, outcomeCode: "replayed" });
    expect(Date.parse(grant.expiresAt)-Date.parse(grant.issuedAt)).toBe(60_000);
    expect(Buffer.from((await downloadWorkspaceDocument(resolveInput(grant), options())).bytes)).toEqual(bytes);
    const review = decision(target, grant.accessId);
    await expect(recordWorkspaceDocumentReview(review, options())).resolves.toMatchObject({ state: "approved", revision: 6 });
    await expect(recordWorkspaceDocumentReview(review, options())).resolves.toMatchObject({ state: "approved", revision: 6, outcomeCode: "replayed" });
    await expect(resolveWorkspaceDocumentAccess(resolveInput(grant), options())).rejects.toThrow("Request is not authorized");
    const customerGrant = await issueWorkspaceDocumentAccess(accessInput(target, 6, "approved"), options(fixture.identityTarget, false));
    expect(Buffer.from((await downloadWorkspaceDocument(resolveInput(customerGrant), options(fixture.identityTarget, false))).bytes)).toEqual(bytes);
    expect((await getWorkspaceDocuments(base(), options(fixture.identityTarget, false))).items.find(row => row.versionId === target.versionId)?.state).toBe("approved");
    const history = await getWorkspaceDocumentHistory({ ...base(), ...target }, options(fixture.identityTarget, false));
    expect(history.items.at(-1)?.action).toBe("approve");
    expect(JSON.stringify(history)).not.toContain(review.reason);
    const [proof] = await fixture.owner`SELECT u.approved_by_identity_id,v.state FROM public.workflow_document_uploads u
      JOIN public.workflow_document_versions v ON v.id=u.version_id WHERE u.version_id=${target.versionId}::uuid`;
    expect(proof).toEqual({ approved_by_identity_id: fixture.pair[0].identityId, state: "approved" });
  });
  test("denies provider signing, listing, copying, updates, and deletion during a valid download grant", async () => {
    const target = await reviewing(); await issueWorkspaceDocumentAccess(accessInput(target), options());
    const storage = bucket(), path = objectPath(target);
    expect((await storage.download(path)).error).toBeNull();
    expect((await storage.createSignedUrl(path, 86400)).error).not.toBeNull();
    expect((await storage.list(fixture.organizationId)).data ?? []).toEqual([]);
    expect((await storage.copy(path, `${randomUUID()}/${randomUUID()}/${randomUUID()}`)).error).not.toBeNull();
    expect((await storage.upload(path, bytes, { contentType: "application/pdf", upsert: true })).error).not.toBeNull();
    expect((await storage.remove([path])).data ?? []).toEqual([]);
    expect((await storage.download(path)).error).toBeNull();
  });
  test("denies foreign users, sessions, scopes, tokens, and stale revisions", async () => {
    const target = await reviewing(), grant = await issueWorkspaceDocumentAccess(accessInput(target), options());
    for (const changes of [{ accessToken: "0".repeat(64) }, { accessId: randomUUID() }, { organizationId: randomUUID() }]) {
      await expect(resolveWorkspaceDocumentAccess({ ...resolveInput(grant), ...changes }, options())).rejects.toThrow();
    }
    for (const actor of [fixture.pair[1], fixture.identityTarget, fixture.outsider]) {
      await expect(resolveWorkspaceDocumentAccess(resolveInput(grant), { supabase: (actor.aal2 ?? actor.aal1) as RequestSupabaseClient })).rejects.toThrow();
    }
    await expect(issueWorkspaceDocumentAccess(accessInput(target, 4), options())).rejects.toThrow("Request is not authorized");
    expect((await bucket(fixture.identityTarget).download(objectPath(target))).error).not.toBeNull();
  });
  test("denies self-approval and current low-assurance or external staff authority", async () => {
    const own = await upload(fixture.pair[0]); const claim = await processor.repository.claim(own.versionId) as DocumentScanClaim;
    await processor.repository.finish(claim, { state: "ready", failureCode: null, scanEvidence: {
      versionId: claim.versionId, sha256: claim.sha256, state: "clean", scanner: "clamav", scannerVersion: "1.4.6",
      signatureVersion: 28139, signatureUpdatedAt: new Date().toISOString(), scannedAt: new Date().toISOString(), failureCode: null,
    } });
    await expect(getWorkspaceDocumentReview({ ...base(), ...own }, options())).resolves.toMatchObject({ canReview: false });
    await expect(recordWorkspaceDocumentReview(start(own), options())).rejects.toThrow("Request is not authorized");
    const target = await clean(), claims = await verifiedApiClaims(lowStaff.aal1, "aal1");
    const [session] = await fixture.owner`SELECT EXISTS(SELECT 1 FROM auth.sessions WHERE id=${claims.sessionId}::uuid AND user_id=${lowStaff.subjectId}::uuid) live`;
    expect(session!.live).toBe(true);
    for (const client of [lowStaff.aal1, fixture.organizationAdmin.aal2!, fixture.identityTarget.aal1, fixture.anonymous]) {
      const input = { ...base(), ...target }; const response = await client.rpc("mmhr_get_workspace_document_review", {
        payload: { organizationId: input.organizationId, documentId: input.documentId, versionId: input.versionId }, correlation_id: input.correlationId });
      expect(response.error?.code).toBe("42501");
    }
  });
  test("retains rejected files and denies further content access or review", async () => {
    const target = await reviewing(), grant = await issueWorkspaceDocumentAccess(accessInput(target), options());
    const input = decision(target, grant.accessId, "reject");
    await expect(recordWorkspaceDocumentReview(input, options())).resolves.toMatchObject({ state: "rejected", revision: 6 });
    await expect(recordWorkspaceDocumentReview(input, options())).resolves.toMatchObject({ state: "rejected", revision: 6, outcomeCode: "replayed" });
    expect((await bucket().download(objectPath(target))).error).not.toBeNull();
    await expect(issueWorkspaceDocumentAccess(accessInput(target, 6, "approved"), options(fixture.identityTarget, false))).rejects.toThrow("Request is not authorized");
    const [retained] = await fixture.owner`SELECT count(*)::int objects FROM storage.objects WHERE bucket_id=${DOCUMENT_QUARANTINE_BUCKET} AND name=${objectPath(target)}`;
    expect(retained!.objects).toBe(1);
  });
  test("denies prior approved content after a replacement without losing its original approval retry", async () => {
    const target = await reviewing(), grant = await issueWorkspaceDocumentAccess(accessInput(target), options()), input = decision(target, grant.accessId);
    await recordWorkspaceDocumentReview(input, options());
    const customer = options(fixture.identityTarget, false), approved = await issueWorkspaceDocumentAccess(accessInput(target, 6, "approved"), customer);
    await upload(fixture.identityTarget, { documentId: target.documentId, expectedVersion: 1 });
    await expect(resolveWorkspaceDocumentAccess(resolveInput(approved), customer)).rejects.toThrow("Request is not authorized");
    expect((await bucket(fixture.identityTarget).download(objectPath(target))).error).not.toBeNull();
    await expect(recordWorkspaceDocumentReview(input, options())).resolves.toMatchObject({ state: "approved", revision: 6, outcomeCode: "replayed" });
  });
  test("rechecks live provider restrictions before exact retries and downloads", async () => {
    const target = await reviewing(), input = accessInput(target), grant = await issueWorkspaceDocumentAccess(input, options());
    await fixture.owner`UPDATE auth.users SET banned_until=clock_timestamp()+interval '1 hour' WHERE id=${fixture.pair[0].subjectId}::uuid`;
    try {
      await expect(issueWorkspaceDocumentAccess(input, options())).rejects.toThrow("Request is not authorized");
      await expect(resolveWorkspaceDocumentAccess(resolveInput(grant), options())).rejects.toThrow("Request is not authorized");
      expect((await bucket().download(objectPath(target))).error).not.toBeNull();
    } finally { await fixture.owner`UPDATE auth.users SET banned_until=NULL WHERE id=${fixture.pair[0].subjectId}::uuid`; }
  });
  test("rolls back review state and grants when immutable audit insertion fails", async () => {
    const target = await clean();
    await fixture.owner`CREATE FUNCTION mmhr_private.document_review_test_audit_failure() RETURNS trigger LANGUAGE plpgsql AS
      'BEGIN RAISE EXCEPTION USING ERRCODE=''P0001'',MESSAGE=''Synthetic audit denial''; END'`;
    await fixture.owner`CREATE TRIGGER document_review_test_audit_failure BEFORE INSERT ON public.audit_events
      FOR EACH ROW EXECUTE FUNCTION mmhr_private.document_review_test_audit_failure()`;
    try {
      await expect(recordWorkspaceDocumentReview(start(target), options())).rejects.toThrow("Document request failed");
      await expect(issueWorkspaceDocumentAccess(accessInput(target, 4), options())).rejects.toThrow("Document request failed");
      const [proof] = await fixture.owner`SELECT state,revision,(SELECT count(*)::int FROM mmhr_private.document_access_grants a
        WHERE a.version_id=u.version_id) grants FROM public.workflow_document_uploads u WHERE version_id=${target.versionId}::uuid`;
      expect(proof).toEqual({ state: "ready", revision: 4, grants: 0 });
    } finally { await fixture.owner`DROP TRIGGER document_review_test_audit_failure ON public.audit_events`;
      await fixture.owner`DROP FUNCTION mmhr_private.document_review_test_audit_failure()`; }
  });
  test("denies raw private grant reads even after an accidental SELECT grant", async () => {
    await fixture.owner`GRANT SELECT ON mmhr_private.document_access_grants TO authenticated`;
    try { await fixture.owner.begin(async sql => { await sql`SET LOCAL ROLE authenticated`;
      expect(await sql`SELECT * FROM mmhr_private.document_access_grants`).toEqual([]); }); }
    finally { await fixture.owner`REVOKE SELECT ON mmhr_private.document_access_grants FROM authenticated`; }
    await expect(fixture.owner.begin(async sql => { await sql`SET LOCAL ROLE authenticated`;
      await sql`SELECT * FROM mmhr_private.document_access_grants`; })).rejects.toMatchObject({ code: "42501" });
  });
  test("contains an accidental broad Storage read policy", async () => {
    const target = await reviewing();
    await fixture.owner`CREATE POLICY document_review_test_broad_read ON storage.objects FOR SELECT TO authenticated,anon USING(true)`;
    try {
      expect((await bucket().download(objectPath(target))).error).not.toBeNull();
      await issueWorkspaceDocumentAccess(accessInput(target), options());
      expect((await bucket().download(objectPath(target))).error).toBeNull();
      expect((await bucket().createSignedUrl(objectPath(target), 60)).error).not.toBeNull();
      expect((await bucket(fixture.identityTarget).download(objectPath(target))).error).not.toBeNull();
      const listing = await bucket().list(`${fixture.organizationId}/${target.documentId}`);
      expect(listing.error !== null || listing.data?.length === 0).toBe(true);
    } finally { await fixture.owner`DROP POLICY document_review_test_broad_read ON storage.objects`; }
  });
  test("bounds active grants and denies expired reads and unchanged retries", async () => {
    const target = await reviewing(), scoped = options(fixture.pair[1]);
    const input = accessInput(target), first = await issueWorkspaceDocumentAccess(input, scoped);
    let latest = first;
    for (let index = 1; index < 16; index++) latest = await issueWorkspaceDocumentAccess(accessInput(target), scoped);
    await expect(issueWorkspaceDocumentAccess(accessInput(target), scoped)).rejects.toThrow("Request is not authorized");
    // Storage accepts any current matching grant. All grants must expire.
    const remaining = Date.parse(latest.expiresAt) - Date.now() + 1_500;
    if (remaining > 0) await new Promise(resolve => setTimeout(resolve, remaining));
    await expect(resolveWorkspaceDocumentAccess(resolveInput(first), scoped)).rejects.toThrow("Request is not authorized");
    await expect(issueWorkspaceDocumentAccess(input, scoped)).rejects.toThrow("Request is not authorized");
    expect((await bucket(fixture.pair[1]).download(objectPath(target))).error).not.toBeNull();
    await expect(issueWorkspaceDocumentAccess(accessInput(target), scoped)).resolves.toMatchObject({ outcomeCode: "recorded" });
  }, 120_000);
  test("approves a genuine vendor workspace original without exposing it to customer or other vendor accounts", async () => {
    const vendor = await fixture.createSyntheticPrincipal(), otherVendor = await fixture.createSyntheticPrincipal();
    const vendorOrganizationId = randomUUID(), otherVendorOrganizationId = randomUUID();
    for (const [id, principal] of [[vendorOrganizationId, vendor], [otherVendorOrganizationId, otherVendor]] as const) {
      await fixture.owner`INSERT INTO public.orgs(id,name,type,status,activated_at,migration_review_required)
        VALUES(${id}::uuid,'Synthetic private document vendor','vendor','active',clock_timestamp(),false)`;
      await fixture.owner`INSERT INTO public.org_members(org_id,identity_id,user_id,role,role_key,migration_review_required)
        VALUES(${id}::uuid,${principal.identityId}::uuid,${principal.subjectId}::uuid,'contributor','contributor',false)`;
      await fixture.owner`INSERT INTO public.org_members(org_id,identity_id,user_id,role,role_key,migration_review_required)
        VALUES(${id}::uuid,${fixture.organizationAdmin.identityId}::uuid,${fixture.organizationAdmin.subjectId}::uuid,'admin','organization_admin',false)`;
    }
    await fixture.owner`SELECT mmhr_private.r1_assert_administration_capacity(clock_timestamp())`;
    const staff = fixture.pair[0];
    await fixture.owner`INSERT INTO public.org_members(org_id,identity_id,user_id,role,role_key,migration_review_required)
      VALUES(${vendorOrganizationId}::uuid,${staff.identityId}::uuid,${staff.subjectId}::uuid,'viewer','viewer',false)`;
    for (const permission of ["workspace.access", "rfp.approve"]) {
      await fixture.owner`INSERT INTO public.user_permission_overrides(
        identity_id,permission_key,scope_kind,organization_id,scope_key,effect,issued_by_identity_id,issue_reason)
        VALUES(${staff.identityId}::uuid,${permission},'organization',${vendorOrganizationId}::uuid,
          ${`organization:${vendorOrganizationId}`},'allow',${fixture.organizationAdmin.identityId}::uuid,'Synthetic vendor document review assignment')`;
    }
    const request = () => ({ organizationId: vendorOrganizationId, correlationId: randomUUID(), idempotencyKey: randomUUID() });
    const target = { documentId: randomUUID(), versionId: randomUUID() };
    const vendorOptions = { supabase: vendor.aal1 as RequestSupabaseClient }, staffOptions = options(staff);
    await reserveWorkspaceDocument({ ...request(), ...target, expectedVersion: 0,
      fileName: "vendor-private.pdf", declaredMimeType: "application/pdf" }, bytes, vendorOptions);
    await createSupabaseDocumentStore(vendorOptions.supabase).putQuarantined({ organizationId: vendorOrganizationId, ...target,
      fileName: "vendor-private.pdf", declaredMimeType: "application/pdf", bytes });
    await completeWorkspaceDocumentUpload({ ...request(), ...target, expectedRevision: 1 }, vendorOptions);
    const claim = await processor.repository.claim(target.versionId) as DocumentScanClaim;
    await processor.repository.finish(claim, { state: "ready", failureCode: null, scanEvidence: {
      versionId: claim.versionId, sha256: claim.sha256, state: "clean", scanner: "clamav", scannerVersion: "1.4.6",
      signatureVersion: 28139, signatureUpdatedAt: new Date(Date.now()-3_600_000).toISOString(), scannedAt: new Date().toISOString(), failureCode: null,
    } });
    const startInput = { ...request(), ...target, action: "begin_review" as const, expectedRevision: 4,
      reason: "Synthetic private vendor document review", reviewReference: "synthetic:vendor-review" };
    await expect(recordWorkspaceDocumentReview(startInput, vendorOptions)).rejects.toThrow("Request is not authorized");
    await recordWorkspaceDocumentReview(startInput, staffOptions);
    const review = await issueWorkspaceDocumentAccess({ ...request(), ...target, expectedRevision: 5, purpose: "review" }, staffOptions);
    await recordWorkspaceDocumentReview({ ...request(), ...target, action: "approve", expectedRevision: 5,
      reason: "Synthetic independent vendor document approval", reviewReference: "synthetic:vendor-approval",
      reviewedAccessId: review.accessId, contentsReviewed: true }, staffOptions);
    const input = { ...request(), ...target, expectedRevision: 6, purpose: "approved" as const };
    const grant = await issueWorkspaceDocumentAccess(input, vendorOptions);
    const resolve = { organizationId: vendorOrganizationId, accessId: grant.accessId, accessToken: grant.accessToken, correlationId: randomUUID() };
    expect((await downloadWorkspaceDocument(resolve, vendorOptions)).bytes).toEqual(new Uint8Array(bytes));
    for (const outsider of [fixture.identityTarget, otherVendor]) {
      const outsiderOptions = { supabase: outsider.aal1 as RequestSupabaseClient };
      await expect(issueWorkspaceDocumentAccess(input, outsiderOptions)).rejects.toThrow("Request is not authorized");
      await expect(resolveWorkspaceDocumentAccess(resolve, outsiderOptions)).rejects.toThrow("Request is not authorized");
      expect((await bucket(outsider).download(`${vendorOrganizationId}/${target.documentId}/${target.versionId}`)).error).not.toBeNull();
    }
    expect((await getWorkspaceDocuments({ organizationId: vendorOrganizationId, correlationId: randomUUID() }, vendorOptions)).items)
      .toContainEqual(expect.objectContaining({ ...target, state: "approved" }));
  }, 120_000);
});
