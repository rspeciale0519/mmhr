import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { applyAllMigrations, openDocumentRehearsalObserver, startRehearsal, stopRehearsal, type RehearsalContext } from "./r1-migration-rehearsal";
import { asAuthenticated, createCommandFixture, rollbackCase, type SecurityCommandFixture, type SecurityTransaction } from "./r1-security-command-fixtures";

describe("managed document persistence boundaries", () => {
  let context: RehearsalContext;
  let fixture: SecurityCommandFixture;
  beforeAll(async () => {
    context = await startRehearsal("r4-document-uploads");
    await applyAllMigrations(context);
    fixture = await context.client.begin((sql) => createCommandFixture(sql));
  }, 240_000);
  afterAll(async () => { if (context) await stopRehearsal(context); }, 180_000);

  async function original(sql: SecurityTransaction) {
    const documentId = randomUUID(); const versionId = randomUUID();
    const upload = { action: "upload", documentId, versionId, organizationId: fixture.organizationId,
      actorIdentityId: fixture.pair[0].identityId, version: 1, documentType: "attachment",
      sha256: "b".repeat(64), storageReference: `quarantine://${fixture.organizationId}/${documentId}/${versionId}`,
      contentType: "application/pdf", byteSize: 128 };
    await asAuthenticated(sql, fixture.pair[0], async (probe) => {
      await probe`SELECT public.mmhr_record_workflow_document(${JSON.stringify(upload)}::jsonb, ${randomUUID()}::uuid, ${randomUUID()}::uuid)`;
    });
    return { documentId, versionId };
  }
  async function managed(sql: SecurityTransaction, fileName = "synthetic.pdf") {
    const value = await original(sql);
    await sql`INSERT INTO public.workflow_document_uploads(version_id,organization_id,document_id,upload_organization_id,
      uploaded_by_identity_id,source_kind,file_name,correlation_id)
      VALUES(${value.versionId}::uuid,${fixture.organizationId}::uuid,${value.documentId}::uuid,${fixture.organizationId}::uuid,
        ${fixture.pair[0].identityId}::uuid,'workspace',${fileName},${randomUUID()}::uuid)`;
    return value;
  }

  test("denies raw reads and prevents the old RPC from scanning, approving, or archiving managed objects", async () => {
    await rollbackCase(context, async (sql) => {
      const value = await managed(sql);
      for (const action of ["scan", "approve", "archive"]) {
        const payload = { ...value, action, organizationId: fixture.organizationId,
          actorIdentityId: fixture.pair[0].identityId, ...(action === "scan" ? { scanState: "clean" } : {}) };
        await expect(asAuthenticated(sql, fixture.pair[0], async (probe) =>
          probe`SELECT public.mmhr_record_workflow_document(${JSON.stringify(payload)}::jsonb, ${randomUUID()}::uuid, ${randomUUID()}::uuid)`))
          .rejects.toMatchObject({ code: "42501" });
      }
      await expect(asAuthenticated(sql, fixture.pair[0], async (probe) => probe`SELECT * FROM public.workflow_document_uploads`))
        .rejects.toMatchObject({ code: "42501" });
      const [row] = await sql`SELECT scan_state,state FROM public.workflow_document_versions WHERE id=${value.versionId}::uuid`;
      expect(row).toMatchObject({ scan_state: "pending", state: "ready" });
    });
  });

  test("binds the exact immutable document version, owner, hash, and storage object", async () => {
    await rollbackCase(context, async (sql) => {
      const value = await managed(sql);
      for (const statement of [
        (probe: SecurityTransaction) => probe`UPDATE public.workflow_document_uploads SET document_id=${randomUUID()}::uuid,revision=2 WHERE version_id=${value.versionId}::uuid`,
        (probe: SecurityTransaction) => probe`UPDATE public.workflow_document_uploads SET uploaded_by_identity_id=${fixture.pair[1].identityId}::uuid,revision=2 WHERE version_id=${value.versionId}::uuid`,
        (probe: SecurityTransaction) => probe`UPDATE public.workflow_document_versions SET sha256=${"a".repeat(64)} WHERE id=${value.versionId}::uuid`,
        (probe: SecurityTransaction) => probe`UPDATE public.workflow_document_versions SET storage_reference='quarantine://another' WHERE id=${value.versionId}::uuid`,
        (probe: SecurityTransaction) => probe`DELETE FROM public.workflow_document_uploads WHERE version_id=${value.versionId}::uuid`,
        (probe: SecurityTransaction) => probe`DELETE FROM public.workflow_document_versions WHERE id=${value.versionId}::uuid`,
      ]) await expect(sql.savepoint(statement)).rejects.toMatchObject({ code: "42501" });
      const second = await original(sql);
      await expect(sql.savepoint((probe) => probe`INSERT INTO public.workflow_document_uploads(version_id,organization_id,document_id,
        upload_organization_id,uploaded_by_identity_id,source_kind,file_name,correlation_id)
        VALUES(${second.versionId}::uuid,${fixture.organizationId}::uuid,${value.documentId}::uuid,${fixture.organizationId}::uuid,
          ${fixture.pair[0].identityId}::uuid,'workspace','synthetic.pdf',${randomUUID()}::uuid)`))
        .rejects.toMatchObject({ code: "42501" });
    });
  });

  test("denies skipped states, stale revisions, and clean receipts for another file", async () => {
    await rollbackCase(context, async (sql) => {
      const value = await managed(sql);
      await expect(sql.savepoint((probe) => probe`UPDATE public.workflow_document_uploads SET state='ready',revision=2,
        scan_evidence=${JSON.stringify({ state: "clean", sha256: "b".repeat(64), versionId: value.versionId })}::jsonb
        WHERE version_id=${value.versionId}::uuid`)).rejects.toMatchObject({ code: "42501" });
      await expect(sql.savepoint((probe) => probe`UPDATE public.workflow_document_uploads SET state='quarantined',revision=3
        WHERE version_id=${value.versionId}::uuid`)).rejects.toMatchObject({ code: "42501" });
      await sql`UPDATE public.workflow_document_uploads SET state='quarantined',revision=2 WHERE version_id=${value.versionId}::uuid`;
      await sql`UPDATE public.workflow_document_uploads SET state='scanning',revision=3,lease_token=${randomUUID()}::uuid,
        lease_expires_at=clock_timestamp()+interval '1 minute' WHERE version_id=${value.versionId}::uuid`;
      await expect(sql.savepoint((probe) => probe`UPDATE public.workflow_document_uploads SET state='ready',revision=4,
        lease_token=NULL,lease_expires_at=NULL,scan_evidence=${JSON.stringify({ state: "clean", sha256: "a".repeat(64), versionId: value.versionId })}::jsonb
        WHERE version_id=${value.versionId}::uuid`)).rejects.toMatchObject({ code: "42501" });
    });
  });

  test("preserves upload history against mutation, deletion, and truncation", async () => {
    await rollbackCase(context, async (sql) => {
      const value = await managed(sql);
      const eventId = randomUUID();
      await sql`INSERT INTO public.workflow_document_upload_events(id,organization_id,version_id,revision,action,snapshot,correlation_id)
        VALUES(${eventId}::uuid,${fixture.organizationId}::uuid,${value.versionId}::uuid,1,'reserve','{"state":"received"}'::jsonb,${randomUUID()}::uuid)`;
      for (const statement of [
        (probe: SecurityTransaction) => probe`UPDATE public.workflow_document_upload_events SET snapshot='{}'::jsonb WHERE id=${eventId}::uuid`,
        (probe: SecurityTransaction) => probe`DELETE FROM public.workflow_document_upload_events WHERE id=${eventId}::uuid`,
        (probe: SecurityTransaction) => probe`TRUNCATE public.workflow_document_upload_events`,
        (probe: SecurityTransaction) => probe`TRUNCATE public.workflow_document_uploads CASCADE`,
      ]) await expect(sql.savepoint(statement)).rejects.toMatchObject({ code: "42501" });
    });
  });

  test("accepts ordinary names and rejects control characters, paths, and excessive bytes", async () => {
    await rollbackCase(context, async (sql) => {
      await managed(sql, "Synthetic résumé.pdf");
      for (const name of ["", "  ", "../synthetic.pdf", "a\\synthetic.pdf", "a\n.pdf", "x".repeat(256), "é".repeat(128)]) {
        await expect(sql.savepoint((probe) => managed(probe, name))).rejects.toMatchObject({ code: "23514" });
      }
    });
  });

  test("prevents legacy search content edits and access to the private legacy implementation", async () => {
    await rollbackCase(context, async (sql) => {
      const value = await managed(sql);
      const payload = JSON.stringify({ ...value, organizationId: fixture.organizationId,
        actorIdentityId: fixture.pair[0].identityId, metadata: {}, approvedExtractedContent: "Unreviewed text" });
      await expect(asAuthenticated(sql, fixture.pair[0], async (probe) =>
        probe`SELECT public.mmhr_set_workflow_document_search_content(${payload}::jsonb,${randomUUID()}::uuid,${randomUUID()}::uuid)`))
        .rejects.toMatchObject({ code: "42501", message: "Managed document review required" });
      await expect(asAuthenticated(sql, fixture.pair[0], async (probe) =>
        probe`SELECT mmhr_private.r4_set_legacy_document_search_content(${payload}::jsonb,${randomUUID()}::uuid,${randomUUID()}::uuid)`))
        .rejects.toMatchObject({ code: "42501" });
      const [row] = await sql`SELECT metadata,approved_extracted_content FROM public.workflow_document_versions WHERE id=${value.versionId}::uuid`;
      expect(row).toMatchObject({ metadata: {}, approved_extracted_content: null });
    });
  });

  test("prevents ordinary users from claiming, completing, failing, or rerunning managed processing jobs", async () => {
    await rollbackCase(context, async (sql) => {
      const value = await managed(sql);
      const jobId = randomUUID();
      const enqueue = JSON.stringify({ action: "enqueue", jobId, organizationId: fixture.organizationId,
        actorIdentityId: fixture.pair[0].identityId, jobType: "document_scan", payloadReferences: [], maximumAttempts: 3 });
      await asAuthenticated(sql, fixture.pair[0], async (probe) =>
        probe`SELECT public.mmhr_record_workflow_job(${enqueue}::jsonb,${randomUUID()}::uuid,${randomUUID()}::uuid)`);
      await sql`UPDATE public.workflow_document_uploads SET state='quarantined',revision=2,processing_job_id=${jobId}::uuid
        WHERE version_id=${value.versionId}::uuid`;
      for (const action of ["claim", "complete", "fail", "rerun", "enqueue"]) {
        const payload = JSON.stringify({ action, jobId, organizationId: fixture.organizationId,
          actorIdentityId: fixture.pair[0].identityId });
        await expect(asAuthenticated(sql, fixture.pair[0], async (probe) =>
          probe`SELECT public.mmhr_record_workflow_job(${payload}::jsonb,${randomUUID()}::uuid,${randomUUID()}::uuid)`))
          .rejects.toMatchObject({ code: "42501", message: "Managed document worker required" });
      }
      await expect(asAuthenticated(sql, fixture.pair[0], async (probe) =>
        probe`SELECT mmhr_private.r4_record_legacy_workflow_job(${enqueue}::jsonb,${randomUUID()}::uuid,${randomUUID()}::uuid)`))
        .rejects.toMatchObject({ code: "42501" });
      const [job] = await sql`SELECT state,attempts_in_cycle FROM public.workflow_jobs WHERE id=${jobId}::uuid`;
      expect(job).toMatchObject({ state: "queued", attempts_in_cycle: 0 });
    });
  });

  test("serializes legacy scan checks with concurrent managed upload registration", async () => {
    const value = await context.client.begin((sql) => original(sql));
    const observerConnection = openDocumentRehearsalObserver(context);
    const observer = observerConnection.client;
    let release!: () => void;
    let ready!: () => void;
    const registered = new Promise<void>((resolve) => { ready = resolve; });
    const held = new Promise<void>((resolve) => { release = resolve; });
    let writerBackendId = 0;
    const writer = context.client.begin(async (sql) => {
      const [backend] = await sql`SELECT pg_backend_pid() AS pid`;
      writerBackendId = Number(backend!.pid);
      await sql`SELECT mmhr_private.r1_lock_security()`;
      await sql`INSERT INTO public.workflow_document_uploads(version_id,organization_id,document_id,upload_organization_id,
        uploaded_by_identity_id,source_kind,file_name,correlation_id)
        VALUES(${value.versionId}::uuid,${fixture.organizationId}::uuid,${value.documentId}::uuid,${fixture.organizationId}::uuid,
          ${fixture.pair[0].identityId}::uuid,'workspace','synthetic.pdf',${randomUUID()}::uuid)`;
      ready(); await held;
    });
    let backendId = 0;
    let scan: Promise<{ error?: unknown }> | undefined;
    try {
      await registered;
      scan = context.client.begin(async (sql) => {
        const [backend] = await sql`SELECT pg_backend_pid() AS pid`;
        backendId = Number(backend!.pid);
        const payload = JSON.stringify({ ...value, action: "scan", organizationId: fixture.organizationId,
          actorIdentityId: fixture.pair[0].identityId, scanState: "clean" });
        await asAuthenticated(sql, fixture.pair[0], async (probe) =>
          probe`SELECT public.mmhr_record_workflow_document(${payload}::jsonb,${randomUUID()}::uuid,${randomUUID()}::uuid)`);
      }).then(() => ({}), (error: unknown) => ({ error }));
      const deadline = Date.now() + 10_000;
      let waiting = false;
      while (Date.now() < deadline && !waiting) {
        if (backendId) {
          const [row] = await observer`SELECT ${writerBackendId}::integer = ANY(pg_catalog.pg_blocking_pids(${backendId}::integer)) AS waiting`;
          waiting = row!.waiting === true;
        }
        if (!waiting) await delay(50);
      }
      expect(waiting).toBe(true);
      release(); await writer;
      await expect(scan).resolves.toMatchObject({ error: { code: "42501", message: "Managed document command required" } });
      const [version] = await observer`SELECT scan_state FROM public.workflow_document_versions WHERE id=${value.versionId}::uuid`;
      expect(version!.scan_state).toBe("pending");
    } finally {
      release(); await writer; if (scan) await scan;
      await observerConnection.close();
    }
  }, 30_000);
});
