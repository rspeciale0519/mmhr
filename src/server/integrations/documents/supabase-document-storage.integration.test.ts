import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createSecurityCommandApiFixtures, type SecurityCommandApiFixtures } from "@/server/auth/security-command-api-fixtures";
import { completeWorkspaceDocumentUpload, reserveWorkspaceDocument } from "@/server/commands/document-reservations";
import type { RequestSupabaseClient } from "@/server/auth/authorization";
import { DOCUMENT_QUARANTINE_BUCKET } from "@/server/workflows/document-store";
import { createSupabaseDocumentStore } from "./supabase-document-store";
import { AuthorizationError } from "@/server/auth/authorization";
import { prepareWorkspaceDocumentUpload } from "@/server/commands/document-upload-preparation";

describe("managed private uploads through genuine Auth and Storage", () => {
  let fixture: SecurityCommandApiFixtures; let privateObject: string;
  const bytes = Buffer.from("%PDF-1.7\nsynthetic Storage test bytes");
  beforeAll(async () => {
    fixture = await createSecurityCommandApiFixtures({ storage: true });
    await fixture.createPrivateDocumentBucket();
    privateObject = await fixture.seedPrivateDocumentObject();
    await fixture.owner`INSERT INTO public.org_members(org_id,identity_id,user_id,role,role_key,migration_review_required)
      VALUES(${fixture.organizationId}::uuid,${fixture.identityTarget.identityId}::uuid,${fixture.identityTarget.subjectId}::uuid,'contributor','contributor',false)`;
  }, 300_000);
  afterAll(async () => { if (fixture) await fixture.close(); }, 180_000);
  test("does not turn an application reservation into an unauthorized Storage upload", async () => {
    const client = fixture.identityTarget.aal1 as RequestSupabaseClient;
    const request = { organizationId: fixture.organizationId, documentId: randomUUID(), versionId: randomUUID(),
      expectedVersion: 0, fileName: "synthetic.pdf", declaredMimeType: "application/pdf", correlationId: randomUUID(), idempotencyKey: randomUUID() };
    await reserveWorkspaceDocument(request, bytes, { supabase: client });
    const store = createSupabaseDocumentStore(client);
    await expect(store.putQuarantined({ organizationId: request.organizationId, documentId: request.documentId,
      versionId: request.versionId, fileName: request.fileName, declaredMimeType: request.declaredMimeType, bytes }))
      .rejects.toMatchObject({ code: "UNAVAILABLE" });
    const [row] = await fixture.owner`SELECT count(*)::int AS objects FROM storage.objects WHERE bucket_id=${DOCUMENT_QUARANTINE_BUCKET}
      AND name=${`${request.organizationId}/${request.documentId}/${request.versionId}`}`;
    expect(row!.objects).toBe(0);
  });
  test("denies anonymous creation and reading of the private bucket", async () => {
    const bucket = fixture.anonymous.storage.from(DOCUMENT_QUARANTINE_BUCKET);
    const uploaded = await bucket.upload(`${randomUUID()}/${randomUUID()}/${randomUUID()}`, bytes, { contentType: "application/pdf", upsert: false });
    expect(uploaded.error).not.toBeNull();
    const read = await bucket.download(privateObject);
    expect(read.error).not.toBeNull();
  });
  test("denies an authenticated workspace user raw reads and signed access to an existing quarantine object", async () => {
    const bucket = fixture.identityTarget.aal1.storage.from(DOCUMENT_QUARANTINE_BUCKET);
    const read = await bucket.download(privateObject); expect(read.error).not.toBeNull();
    const signed = await bucket.createSignedUrl(privateObject, 60); expect(signed.error).not.toBeNull();
  });
  const request = () => ({ organizationId: fixture.organizationId, documentId: randomUUID(), versionId: randomUUID(),
    expectedVersion: 0, fileName: "synthetic.pdf", declaredMimeType: "application/pdf", correlationId: randomUUID(), idempotencyKey: randomUUID() });
  const completion = (value: ReturnType<typeof request>) => ({ organizationId: value.organizationId, documentId: value.documentId,
    versionId: value.versionId, expectedRevision: 1, correlationId: randomUUID(), idempotencyKey: randomUUID() });
  const storedRequest = (value: ReturnType<typeof request>) => ({ organizationId: value.organizationId, documentId: value.documentId,
    versionId: value.versionId, fileName: value.fileName, declaredMimeType: value.declaredMimeType, bytes });

  test("limits policy installation to the database owner and refuses repeated installation", async () => {
    await expect(fixture.owner.begin(async (sql) => {
      await sql`SET LOCAL ROLE authenticated`;
      await sql`SELECT mmhr_private.r4_install_document_storage_upload_policies()`;
    })).rejects.toMatchObject({ code: "42501" });
    await fixture.owner`SELECT mmhr_private.r4_install_document_storage_upload_policies()`;
    await expect(fixture.owner`SELECT mmhr_private.r4_install_document_storage_upload_policies()`).rejects.toMatchObject({ code: "42501" });
  });
  test("stores an exact reserved immutable object and queues one scan with immutable history", async () => {
    const value = request(), complete = completion(value), client = fixture.identityTarget.aal1 as RequestSupabaseClient;
    await reserveWorkspaceDocument(value, bytes, { supabase: client });
    const object = await createSupabaseDocumentStore(client).putQuarantined(storedRequest(value));
    expect(object).toMatchObject({ versionId: value.versionId, byteSize: bytes.length, state: "quarantined" });
    await expect(completeWorkspaceDocumentUpload(complete, { supabase: client })).resolves.toMatchObject({ revision: 2, state: "quarantined", outcomeCode: "recorded" });
    await expect(completeWorkspaceDocumentUpload(complete, { supabase: client })).resolves.toMatchObject({ outcomeCode: "replayed" });
    const [row] = await fixture.owner`SELECT u.state,u.revision,u.scan_evidence,u.approved_by_identity_id,v.scan_state,j.state AS job_state,
      j.payload_references,(SELECT count(*)::int FROM public.workflow_document_upload_events e WHERE e.version_id=u.version_id) AS events
      FROM public.workflow_document_uploads u JOIN public.workflow_document_versions v ON v.id=u.version_id
      JOIN public.workflow_jobs j ON j.id=u.processing_job_id WHERE u.version_id=${value.versionId}::uuid`;
    expect(row).toMatchObject({ state: "quarantined", revision: 2, scan_evidence: null, approved_by_identity_id: null, scan_state: "pending",
      job_state: "queued", payload_references: [{ documentId: value.documentId, versionId: value.versionId }], events: 2 });
    const bucket = client.storage.from(DOCUMENT_QUARANTINE_BUCKET);
    expect((await bucket.download(object.objectPath)).error).not.toBeNull();
    expect((await bucket.createSignedUrl(object.objectPath, 60)).error).not.toBeNull();
    expect((await bucket.upload(object.objectPath, bytes, { contentType: "application/pdf", upsert: true })).error).not.toBeNull();
    await bucket.remove([object.objectPath]);
    const [retained] = await fixture.owner`SELECT count(*)::int AS objects FROM storage.objects WHERE bucket_id=${DOCUMENT_QUARANTINE_BUCKET} AND name=${object.objectPath}`;
    expect(retained!.objects).toBe(1);
  });
  test("keeps missing objects received and does not enqueue a processing job", async () => {
    const value = request(), client = fixture.identityTarget.aal1 as RequestSupabaseClient;
    await reserveWorkspaceDocument(value, bytes, { supabase: client });
    await expect(completeWorkspaceDocumentUpload(completion(value), { supabase: client })).rejects.toBeInstanceOf(AuthorizationError);
    const [row] = await fixture.owner`SELECT state,revision,processing_job_id FROM public.workflow_document_uploads WHERE version_id=${value.versionId}::uuid`;
    expect(row).toMatchObject({ state: "received", revision: 1, processing_job_id: null });
  });
  test("accepts a browser manifest only as untrusted quarantine metadata", async () => {
    const value = request(), client = fixture.identityTarget.aal1 as RequestSupabaseClient;
    const manifest = { ...value, byteSize: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
    await expect(prepareWorkspaceDocumentUpload(manifest, { supabase: client })).resolves.toMatchObject({ state: "received", revision: 1 });
    const path = `${value.organizationId}/${value.documentId}/${value.versionId}`;
    const result = await client.storage.from(DOCUMENT_QUARANTINE_BUCKET).upload(path, bytes,
      { contentType: value.declaredMimeType, upsert: false, cacheControl: "0" });
    expect(result.error).toBeNull();
    await expect(completeWorkspaceDocumentUpload(completion(value), { supabase: client })).resolves.toMatchObject({ state: "quarantined", revision: 2 });
    const [row] = await fixture.owner`SELECT state,scan_evidence,approved_by_identity_id FROM public.workflow_document_uploads
      WHERE version_id=${value.versionId}::uuid`;
    expect(row).toMatchObject({ state: "quarantined", scan_evidence: null, approved_by_identity_id: null });
    expect((await client.storage.from(DOCUMENT_QUARANTINE_BUCKET).download(path)).error).not.toBeNull();
  });
  test("denies browser manifest reservation to viewers and foreign organizations", async () => {
    const value = { ...request(), byteSize: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
    for (const client of [fixture.membershipTarget.aal1, fixture.outsider.aal1, fixture.anonymous]) {
      await expect(prepareWorkspaceDocumentUpload(value, { supabase: client as RequestSupabaseClient })).rejects.toBeInstanceOf(AuthorizationError);
    }
    const [row] = await fixture.owner`SELECT count(*)::int AS count FROM public.workflow_document_uploads WHERE version_id=${value.versionId}::uuid`;
    expect(row!.count).toBe(0);
  });
  test("rejects unreserved paths and reservations owned by another authenticated identity", async () => {
    const value = request(), client = fixture.identityTarget.aal1 as RequestSupabaseClient;
    await reserveWorkspaceDocument(value, bytes, { supabase: client });
    const path = `${value.organizationId}/${value.documentId}/${value.versionId}`;
    for (const [actor, objectPath] of [[fixture.membershipTarget.aal1, path], [fixture.identityTarget.aal1,
      `${value.organizationId}/${randomUUID()}/${randomUUID()}`], [fixture.anonymous, path]] as const) {
      const uploaded = await actor.storage.from(DOCUMENT_QUARANTINE_BUCKET).upload(objectPath, bytes, { contentType: "application/pdf", upsert: false });
      expect(uploaded.error).not.toBeNull();
    }
  });
  test("verifies actual stored size and MIME before queuing, rather than trusting completion inputs", async () => {
    const client = fixture.identityTarget.aal1 as RequestSupabaseClient, bucket = client.storage.from(DOCUMENT_QUARANTINE_BUCKET);
    for (const invalid of [{ body: Buffer.from("%PDF-short"), contentType: "application/pdf" }, { body: bytes, contentType: "image/png" }]) {
      const value = request(); await reserveWorkspaceDocument(value, bytes, { supabase: client });
      const path = `${value.organizationId}/${value.documentId}/${value.versionId}`;
      const uploaded = await bucket.upload(path, invalid.body, { contentType: invalid.contentType, upsert: false });
      expect(uploaded.error).toBeNull();
      await expect(completeWorkspaceDocumentUpload(completion(value), { supabase: client })).rejects.toBeInstanceOf(AuthorizationError);
      const [row] = await fixture.owner`SELECT state,processing_job_id FROM public.workflow_document_uploads WHERE version_id=${value.versionId}::uuid`;
      expect(row).toMatchObject({ state: "received", processing_job_id: null });
    }
  });
  test("retains the private original and retries completion after an audit failure rolls back the job", async () => {
    const value = request(), complete = completion(value), client = fixture.identityTarget.aal1 as RequestSupabaseClient;
    await reserveWorkspaceDocument(value, bytes, { supabase: client });
    const object = await createSupabaseDocumentStore(client).putQuarantined(storedRequest(value));
    await fixture.owner`CREATE FUNCTION mmhr_private.document_storage_test_audit_failure() RETURNS trigger LANGUAGE plpgsql AS
      'BEGIN RAISE EXCEPTION USING ERRCODE=''P0001'',MESSAGE=''Synthetic audit failure''; END'`;
    await fixture.owner`CREATE TRIGGER document_storage_test_audit_failure BEFORE INSERT ON public.audit_events
      FOR EACH ROW EXECUTE FUNCTION mmhr_private.document_storage_test_audit_failure()`;
    try {
      await expect(completeWorkspaceDocumentUpload(complete, { supabase: client })).rejects.toThrow("Document upload completion failed");
      const [row] = await fixture.owner`SELECT state,revision,processing_job_id FROM public.workflow_document_uploads WHERE version_id=${value.versionId}::uuid`;
      expect(row).toMatchObject({ state: "received", revision: 1, processing_job_id: null });
      const [retained] = await fixture.owner`SELECT count(*)::int AS objects FROM storage.objects WHERE bucket_id=${DOCUMENT_QUARANTINE_BUCKET} AND name=${object.objectPath}`;
      expect(retained!.objects).toBe(1);
    } finally {
      await fixture.owner`DROP TRIGGER document_storage_test_audit_failure ON public.audit_events`;
      await fixture.owner`DROP FUNCTION mmhr_private.document_storage_test_audit_failure()`;
    }
    await expect(completeWorkspaceDocumentUpload(complete, { supabase: client })).resolves.toMatchObject({ state: "quarantined", outcomeCode: "recorded" });
  });
  test("contains a broader permissive policy and respects current membership revocation", async () => {
    await fixture.owner`CREATE POLICY synthetic_broad_storage_allow ON storage.objects FOR ALL TO anon,authenticated USING(true) WITH CHECK(true)`;
    try {
      const client = fixture.identityTarget.aal1 as RequestSupabaseClient, bucket = client.storage.from(DOCUMENT_QUARANTINE_BUCKET);
      expect((await bucket.upload(`${randomUUID()}/${randomUUID()}/${randomUUID()}`, bytes, { contentType: "application/pdf", upsert: false })).error).not.toBeNull();
      expect((await fixture.anonymous.storage.from(DOCUMENT_QUARANTINE_BUCKET).download(privateObject)).error).not.toBeNull();
      expect((await bucket.download(privateObject)).error).not.toBeNull();
      expect((await bucket.createSignedUrl(privateObject, 60)).error).not.toBeNull();
      expect((await bucket.upload(privateObject, bytes, { contentType: "application/pdf", upsert: true })).error).not.toBeNull();
      const value = request(); await reserveWorkspaceDocument(value, bytes, { supabase: client });
      await fixture.owner`UPDATE public.org_members SET status='suspended',suspended_at=clock_timestamp()
        WHERE org_id=${fixture.organizationId}::uuid AND identity_id=${fixture.identityTarget.identityId}::uuid`;
      expect((await bucket.upload(`${value.organizationId}/${value.documentId}/${value.versionId}`, bytes,
        { contentType: "application/pdf", upsert: false })).error).not.toBeNull();
    } finally { await fixture.owner`DROP POLICY synthetic_broad_storage_allow ON storage.objects`; }
  });
});
