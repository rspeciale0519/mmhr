import { createHash, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { createSecurityCommandApiFixtures, elevatedClient, verifiedApiClaims, type SecurityCommandApiFixtures } from "@/server/auth/security-command-api-fixtures";
import type { RequestSupabaseClient } from "@/server/auth/authorization";
import { completeWorkspaceDocumentUpload, reserveWorkspaceDocument } from "@/server/commands/document-reservations";
import { prepareWorkspaceDocumentUpload } from "@/server/commands/document-upload-preparation";
import { runDocumentScan, type DocumentScanClaim } from "@/server/workflows/document-scan-worker";
import { DOCUMENT_QUARANTINE_BUCKET } from "@/server/workflows/document-store";
import { startDocumentScannerRehearsal } from "@/test/documents/document-scanner-rehearsal";
import { syntheticAntivirusDocument } from "@/test/documents/synthetic-antivirus-document";
import { runDocumentScanSweep } from "@/server/workflows/document-scan-sweep";
import { createSupabaseDocumentStore } from "./supabase-document-store";
import { issueWorkspaceDocumentAccess, recordWorkspaceDocumentReview } from "@/server/commands/workspace-document-review";
import { downloadWorkspaceDocument } from "./workspace-document-download";

describe("genuine Auth, private Storage, leased queue, and malware scan flow", () => {
  let fixture: SecurityCommandApiFixtures;
  let scanner: Awaited<ReturnType<typeof startDocumentScannerRehearsal>>;
  let processor: Awaited<ReturnType<SecurityCommandApiFixtures["createDocumentScanProcessor"]>>;
  let otherProcessor: typeof processor;
  const bytes = Buffer.from("%PDF-1.7\nSynthetic scan check\n%%EOF");

  beforeAll(async () => {
    fixture = await createSecurityCommandApiFixtures({ storage: true });
    await fixture.createPrivateDocumentBucket();
    await fixture.owner`SELECT mmhr_private.r4_install_document_storage_upload_policies()`;
    await fixture.owner`INSERT INTO public.org_members(org_id,identity_id,user_id,role,role_key,migration_review_required)
      VALUES(${fixture.organizationId}::uuid,${fixture.identityTarget.identityId}::uuid,${fixture.identityTarget.subjectId}::uuid,'contributor','contributor',false)`;
    scanner = await startDocumentScannerRehearsal();
    processor = await fixture.createDocumentScanProcessor();
    otherProcessor = await fixture.createDocumentScanProcessor();
  }, 540_000);
  afterAll(async () => {
    const results = await Promise.allSettled([
      processor?.close(), otherProcessor?.close(), scanner?.close(),
    ]);
    if (fixture) await fixture.close();
    const failed = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
    if (failed.length) throw new AggregateError(failed.map((result) => result.reason), "Document flow cleanup failed");
  }, 180_000);

  async function uploaded(reservedBytes: Uint8Array = bytes, storedBytes: Uint8Array = reservedBytes,
    metadata = { fileName: "synthetic.pdf", declaredMimeType: "application/pdf" }) {
    const value = { organizationId: fixture.organizationId, documentId: randomUUID(), versionId: randomUUID(),
      expectedVersion: 0, ...metadata, correlationId: randomUUID(), idempotencyKey: randomUUID() };
    const client = fixture.identityTarget.aal1 as RequestSupabaseClient;
    await reserveWorkspaceDocument(value, reservedBytes, { supabase: client });
    const object = await createSupabaseDocumentStore(client).putQuarantined({ organizationId: value.organizationId,
      documentId: value.documentId, versionId: value.versionId, fileName: value.fileName, declaredMimeType: value.declaredMimeType, bytes: storedBytes });
    await completeWorkspaceDocumentUpload({ organizationId: value.organizationId, documentId: value.documentId,
      versionId: value.versionId, expectedRevision: 1, correlationId: randomUUID(), idempotencyKey: randomUUID() }, { supabase: client });
    return { value, object };
  }
  const bucket = (reader = processor.reader) => reader.storage.from(DOCUMENT_QUARANTINE_BUCKET);
  const dependencies = () => ({ repository: processor.repository,
    store: createSupabaseDocumentStore(processor.reader as RequestSupabaseClient), scanner: scanner.scanner });

  test("installs download-only policies through the owner and refuses ordinary or repeated installation", async () => {
    await expect(fixture.owner.begin(async (sql) => {
      await sql`SET LOCAL ROLE authenticated`; await sql`SELECT mmhr_private.r4_install_document_scan_read_policies()`;
    })).rejects.toMatchObject({ code: "42501" });
    await fixture.owner`SELECT mmhr_private.r4_install_document_scan_read_policies()`;
    await expect(fixture.owner`SELECT mmhr_private.r4_install_document_scan_read_policies()`).rejects.toMatchObject({ code: "42501" });
  });
  test("rejects application users as machine readers and denies raw capability table reads", async () => {
    const claims = await verifiedApiClaims(fixture.identityTarget.aal1, "aal1");
    await expect(fixture.owner`SELECT mmhr_private.r4_register_document_scan_reader(${claims.subjectId}::uuid,${claims.sessionId}::uuid,
      ${processor.loginName},${new Date(Date.now()+60_000).toISOString()}::timestamptz,${randomUUID()}::uuid)`).rejects.toMatchObject({ code: "42501" });
    await expect(fixture.owner.begin(async (sql) => {
      await sql`SET LOCAL ROLE authenticated`; await sql`SELECT * FROM mmhr_private.document_scan_readers`;
    })).rejects.toMatchObject({ code: "42501" });
    const [role] = await fixture.owner`SELECT mmhr_private.r4_document_worker_login_is_safe(${processor.loginName}) AS safe`;
    expect(role!.safe).toBe(true);
    const [identity] = await fixture.owner`SELECT count(*)::int AS count FROM public.identities WHERE auth_user_id=${processor.subjectId}::uuid`;
    expect(identity!.count).toBe(0);
  });
  test("allows only the exact claimed version to its registered reader and denies users, other workers, signing, listing, and copying", async () => {
    const value = await uploaded(), unclaimed = await uploaded();
    expect((await bucket().download(value.object.objectPath)).error).not.toBeNull();
    const claim = await processor.repository.claim(value.value.versionId) as DocumentScanClaim;
    expect(claim.versionId).toBe(value.value.versionId);
    const read = await bucket().download(value.object.objectPath);
    expect(read.error).toBeNull(); expect(Buffer.from(await read.data!.arrayBuffer())).toEqual(bytes);
    for (const reader of [fixture.anonymous, fixture.identityTarget.aal1, fixture.organizationAdmin.aal2!, otherProcessor.reader]) {
      expect((await bucket(reader).download(value.object.objectPath)).error).not.toBeNull();
    }
    expect((await bucket().download(unclaimed.object.objectPath)).error).not.toBeNull();
    expect((await bucket().createSignedUrl(value.object.objectPath, 60)).error).not.toBeNull();
    expect((await bucket().list(value.value.organizationId)).data ?? []).toEqual([]);
    expect((await bucket().copy(value.object.objectPath, `${randomUUID()}/${randomUUID()}/${randomUUID()}`)).error).not.toBeNull();
    expect((await bucket().upload(value.object.objectPath, bytes, { contentType: "application/pdf", upsert: true })).error).not.toBeNull();
    await processor.repository.finish(claim, { state: "failed", failureCode: "scanner_unavailable", scanEvidence: null });
    expect((await bucket().download(value.object.objectPath)).error).not.toBeNull();
  });
  test("reads actual private bytes, records real ClamAV evidence, and leaves content unapproved", async () => {
    const value = await uploaded();
    expect(await processor.repository.listCandidateIds()).toContain(value.value.versionId);
    const result = await runDocumentScanSweep(dependencies());
    expect(result.outcome).toBe("completed");
    if (result.outcome !== "completed") throw new Error("Expected completed document sweep");
    expect(result.items).toContainEqual({ versionId: value.value.versionId, result: { outcome: "recorded", state: "ready", versionId: value.value.versionId } });
    const [row] = await fixture.owner`SELECT u.state,u.revision,u.scan_evidence,u.approved_by_identity_id,v.scan_state,v.state AS version_state,
      j.state AS job_state FROM public.workflow_document_uploads u JOIN public.workflow_document_versions v ON v.id=u.version_id
      JOIN public.workflow_jobs j ON j.id=u.processing_job_id WHERE u.version_id=${value.value.versionId}::uuid`;
    expect(row).toMatchObject({ state: "ready", revision: 4, approved_by_identity_id: null, scan_state: "clean", version_state: "ready", job_state: "succeeded",
      scan_evidence: { versionId: value.value.versionId, sha256: value.object.sha256, state: "clean", scanner: "clamav", scannerVersion: "1.4.6", failureCode: null } });
    expect(Number(row!.scan_evidence.signatureVersion)).toBeGreaterThan(0);
    expect(Date.now()-Date.parse(row!.scan_evidence.signatureUpdatedAt)).toBeLessThan(86_400_000);
    const history = await fixture.owner`SELECT action FROM public.workflow_document_upload_events WHERE version_id=${value.value.versionId}::uuid ORDER BY revision`;
    expect(history.map((event) => event.action)).toEqual(["reserve", "uploaded", "scan_claimed", "scan_clean"]);
    expect((await bucket().download(value.object.objectPath)).error).not.toBeNull();
    expect((await bucket(fixture.identityTarget.aal1).download(value.object.objectPath)).error).not.toBeNull();
  }, 60_000);
  test("rejects actual stored hash changes despite matching size and MIME", async () => {
    const changed = Buffer.from(bytes); changed[10] ^= 1;
    const value = await uploaded(bytes, changed);
    await expect(runDocumentScan(value.value.versionId, dependencies())).resolves.toMatchObject({ outcome: "recorded", state: "rejected" });
    const [row] = await fixture.owner`SELECT u.state,u.failure_code,u.scan_evidence,v.scan_state FROM public.workflow_document_uploads u
      JOIN public.workflow_document_versions v ON v.id=u.version_id WHERE u.version_id=${value.value.versionId}::uuid`;
    expect(row).toMatchObject({ state: "rejected", failure_code: "document_integrity", scan_evidence: null, scan_state: "quarantined" });
  });
  test.each(["wrong_hash", "wrong_bytes"] as const)("rejects browser %s claims after reading the actual original", async (failure) => {
    const stored = failure === "wrong_bytes" ? Buffer.from("Synthetic invalid PDF bytes") : bytes;
    const value = { organizationId: fixture.organizationId, documentId: randomUUID(), versionId: randomUUID(), expectedVersion: 0,
      fileName: "synthetic.pdf", declaredMimeType: "application/pdf", byteSize: stored.length,
      sha256: failure === "wrong_hash" ? "f".repeat(64) : createHash("sha256").update(stored).digest("hex"),
      correlationId: randomUUID(), idempotencyKey: randomUUID() };
    const client = fixture.identityTarget.aal1 as RequestSupabaseClient;
    await prepareWorkspaceDocumentUpload(value, { supabase: client });
    const path = `${value.organizationId}/${value.documentId}/${value.versionId}`;
    expect((await bucket(client).upload(path, stored, { contentType: "application/pdf", upsert: false })).error).toBeNull();
    await completeWorkspaceDocumentUpload({ organizationId: value.organizationId, documentId: value.documentId, versionId: value.versionId,
      expectedRevision: 1, correlationId: value.correlationId, idempotencyKey: randomUUID() }, { supabase: client });
    await expect(runDocumentScan(value.versionId, dependencies())).resolves.toMatchObject({ outcome: "recorded", state: "rejected" });
    const [row] = await fixture.owner`SELECT state,scan_evidence,approved_by_identity_id,failure_code FROM public.workflow_document_uploads
      WHERE version_id=${value.versionId}::uuid`;
    expect(row).toMatchObject({ state: "rejected", scan_evidence: null, approved_by_identity_id: null, failure_code: "document_integrity" });
  });
  test("quarantines a harmless antivirus test package through the full upload and real scanner path", async () => {
    const body = syntheticAntivirusDocument();
    const value = await uploaded(body, body, { fileName: "synthetic.docx", declaredMimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
    await expect(runDocumentScan(value.value.versionId, dependencies())).resolves.toMatchObject({ outcome: "recorded", state: "rejected" });
    const [row] = await fixture.owner`SELECT u.state,u.failure_code,u.scan_evidence,v.scan_state,j.state AS job_state
      FROM public.workflow_document_uploads u JOIN public.workflow_document_versions v ON v.id=u.version_id
      JOIN public.workflow_jobs j ON j.id=u.processing_job_id WHERE u.version_id=${value.value.versionId}::uuid`;
    expect(row).toMatchObject({ state: "rejected", failure_code: "unsafe_document", scan_state: "quarantined", job_state: "succeeded",
      scan_evidence: { state: "quarantined", scanner: "clamav", scannerVersion: "1.4.6", versionId: value.value.versionId, sha256: value.object.sha256 } });
    expect((await bucket().download(value.object.objectPath)).error).not.toBeNull();
    expect((await bucket(fixture.identityTarget.aal1).createSignedUrl(value.object.objectPath, 60)).error).not.toBeNull();
  }, 60_000);
  test("joins real antivirus evidence to independent review and approved customer bytes", async () => {
    const staff = fixture.pair[0];
    await fixture.owner`INSERT INTO public.org_members(org_id,identity_id,user_id,role,role_key,migration_review_required)
      VALUES(${fixture.organizationId}::uuid,${staff.identityId}::uuid,${staff.subjectId}::uuid,'viewer','viewer',false)`;
    for (const permission of ["workspace.access", "rfp.approve"]) {
      await fixture.owner`INSERT INTO public.user_permission_overrides(
        identity_id,permission_key,scope_kind,organization_id,scope_key,effect,issued_by_identity_id,issue_reason)
        VALUES(${staff.identityId}::uuid,${permission},'organization',${fixture.organizationId}::uuid,
          ${`organization:${fixture.organizationId}`},'allow',${fixture.organizationAdmin.identityId}::uuid,'Synthetic document review assignment')`;
    }
    await fixture.owner`SELECT mmhr_private.r4_install_document_content_read_policies()`;
    const value = await uploaded();
    const staffOptions = { supabase: elevatedClient(staff) as RequestSupabaseClient };
    const customerOptions = { supabase: fixture.identityTarget.aal1 as RequestSupabaseClient };
    const target = { organizationId: fixture.organizationId, documentId: value.value.documentId, versionId: value.value.versionId };
    const request = () => ({ correlationId: randomUUID(), idempotencyKey: randomUUID() });
    await expect(issueWorkspaceDocumentAccess({ ...target, ...request(), expectedRevision: 2, purpose: "approved" }, customerOptions))
      .rejects.toThrow("Request is not authorized");
    await expect(runDocumentScan(target.versionId, dependencies())).resolves.toMatchObject({ outcome: "recorded", state: "ready" });
    await expect(issueWorkspaceDocumentAccess({ ...target, ...request(), expectedRevision: 4, purpose: "approved" }, customerOptions))
      .rejects.toThrow("Request is not authorized");
    await recordWorkspaceDocumentReview({ ...target, ...request(), action: "begin_review", expectedRevision: 4,
      reason: "Synthetic review after actual antivirus scan", reviewReference: "synthetic:real-scan-review" }, staffOptions);
    const review = await issueWorkspaceDocumentAccess({ ...target, ...request(), expectedRevision: 5, purpose: "review" }, staffOptions);
    const access = (grant: { accessId: string; accessToken: string }) => ({ organizationId: fixture.organizationId,
      accessId: grant.accessId, accessToken: grant.accessToken, correlationId: randomUUID() });
    expect((await downloadWorkspaceDocument(access(review), staffOptions)).bytes).toEqual(new Uint8Array(bytes));
    // This explicit confirmation models staff action. It does not prove human reading or legal validity.
    await recordWorkspaceDocumentReview({ ...target, ...request(), action: "approve", expectedRevision: 5,
      reason: "Synthetic independent content approval", reviewReference: "synthetic:real-scan-approval",
      contentsReviewed: true, reviewedAccessId: review.accessId }, staffOptions);
    const approved = await issueWorkspaceDocumentAccess({ ...target, ...request(), expectedRevision: 6, purpose: "approved" }, customerOptions);
    expect((await downloadWorkspaceDocument(access(approved), customerOptions)).bytes).toEqual(new Uint8Array(bytes));
    const [row] = await fixture.owner`SELECT u.state,u.revision,u.scan_evidence,u.approved_by_identity_id,u.uploaded_by_identity_id,
      v.state AS version_state FROM public.workflow_document_uploads u JOIN public.workflow_document_versions v ON v.id=u.version_id
      WHERE u.version_id=${target.versionId}::uuid`;
    expect(row).toMatchObject({ state: "approved", revision: 6, version_state: "approved", approved_by_identity_id: staff.identityId,
      uploaded_by_identity_id: fixture.identityTarget.identityId,
      scan_evidence: { state: "clean", scanner: "clamav", sha256: value.object.sha256, versionId: target.versionId } });
    expect(Number(row!.scan_evidence.signatureVersion)).toBeGreaterThan(0);
    expect((await bucket(fixture.identityTarget.aal1).createSignedUrl(value.object.objectPath, 60)).error).not.toBeNull();
    expect((await bucket(fixture.anonymous).download(value.object.objectPath)).error).not.toBeNull();
    expect((await bucket(fixture.organizationAdmin.aal2!).download(value.object.objectPath)).error).not.toBeNull();
  }, 60_000);
  test("blocks a banned machine provider and an expired database login", async () => {
    for (const failure of ["provider_banned", "login_expired"] as const) {
      const fresh = await fixture.createDocumentScanProcessor();
      try {
        const value = await uploaded(); await fresh.repository.claim(value.value.versionId);
        expect((await bucket(fresh.reader).download(value.object.objectPath)).error).toBeNull();
        if (failure === "provider_banned") {
          await fixture.owner`UPDATE auth.users SET banned_until=clock_timestamp()+interval '1 hour' WHERE id=${fresh.subjectId}::uuid`;
        } else {
          const [statement] = await fixture.owner`SELECT format('ALTER ROLE %I VALID UNTIL %L',${fresh.loginName}::text,
            clock_timestamp()-interval '1 second') AS sql`;
          await fixture.owner.unsafe(statement!.sql);
        }
        expect((await bucket(fresh.reader).download(value.object.objectPath)).error).not.toBeNull();
      } finally { await fresh.close(); }
    }
  });
  test("contains broader permissive read policies and current reader revocation", async () => {
    const value = await uploaded(); await otherProcessor.repository.claim(value.value.versionId);
    await fixture.owner`CREATE POLICY synthetic_document_reader_broad ON storage.objects FOR ALL TO anon,authenticated USING(true) WITH CHECK(true)`;
    try {
      expect((await bucket(otherProcessor.reader).download(value.object.objectPath)).error).toBeNull();
      expect((await bucket(fixture.identityTarget.aal1).download(value.object.objectPath)).error).not.toBeNull();
      expect((await bucket(fixture.anonymous).download(value.object.objectPath)).error).not.toBeNull();
      expect((await bucket(otherProcessor.reader).createSignedUrl(value.object.objectPath, 60)).error).not.toBeNull();
      expect((await bucket(otherProcessor.reader).list(value.value.organizationId)).data ?? []).toEqual([]);
      await fixture.owner`SELECT mmhr_private.r4_revoke_document_scan_reader(${otherProcessor.subjectId}::uuid,${randomUUID()}::uuid)`;
      expect((await bucket(otherProcessor.reader).download(value.object.objectPath)).error).not.toBeNull();
    } finally { await fixture.owner`DROP POLICY synthetic_document_reader_broad ON storage.objects`; }
  });
  test("denies downloads after real-clock lease expiry without changing immutable lease data", async () => {
    const value = await uploaded();
    const claim = await processor.repository.claim(value.value.versionId) as DocumentScanClaim;
    const expiresAt = Date.parse(claim.leaseExpiresAt);
    expect(expiresAt-Date.now()).toBeGreaterThan(0); expect(expiresAt-Date.now()).toBeLessThanOrEqual(120_000);
    expect((await bucket().download(value.object.objectPath)).error).toBeNull();
    while (Date.now()<=expiresAt) await delay(Math.min(1_000, expiresAt-Date.now()+1));
    const [lease] = await fixture.owner`SELECT clock_timestamp()>lease_expires_at AS expired
      FROM public.workflow_document_uploads WHERE version_id=${value.value.versionId}::uuid`;
    expect(lease!.expired).toBe(true);
    expect((await bucket().download(value.object.objectPath)).error).not.toBeNull();
  }, 180_000);
  test("denies removed Auth sessions even while their signed token remains current", async () => {
    const value = await uploaded(); await processor.repository.claim(value.value.versionId);
    expect((await bucket().download(value.object.objectPath)).error).toBeNull();
    await fixture.owner`DELETE FROM auth.sessions WHERE id=${processor.sessionId}::uuid AND user_id=${processor.subjectId}::uuid`;
    expect((await bucket().download(value.object.objectPath)).error).not.toBeNull();
  });
});
