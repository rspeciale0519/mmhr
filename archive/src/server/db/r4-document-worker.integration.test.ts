import { createHash, createHmac, pbkdf2Sync, randomBytes, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { createDocumentScanRepository } from "./document-scan-repository";
import { applyAllMigrations, openDocumentRehearsalWorker, startRehearsal, stopRehearsal, type RehearsalContext } from "./r1-migration-rehearsal";
import { asAuthenticated, createCommandFixture, type SecurityCommandFixture } from "./r1-security-command-fixtures";
import type { DocumentScanClaim } from "@/server/workflows/document-scan-worker";

describe("dedicated document worker database boundaries", () => {
  let context: RehearsalContext; let fixture: SecurityCommandFixture;
  let worker: Awaited<ReturnType<typeof openDocumentRehearsalWorker>>["client"];
  let repository: ReturnType<typeof createDocumentScanRepository>; let login: string;
  beforeAll(async () => {
    context = await startRehearsal("r4-document-worker"); await applyAllMigrations(context);
    fixture = await context.client.begin((sql) => createCommandFixture(sql));
    login = `mmhr_document_worker_${randomBytes(16).toString("hex")}`;
    const credential = randomBytes(32).toString("base64url"), salt = randomBytes(16);
    const salted = pbkdf2Sync(credential, salt, 4096, 32, "sha256");
    const verifier = `SCRAM-SHA-256$4096:${salt.toString("base64")}$${createHash("sha256").update(createHmac("sha256", salted).update("Client Key").digest()).digest("base64")}:${createHmac("sha256", salted).update("Server Key").digest("base64")}`;
    await context.client`SELECT mmhr_private.r4_create_ephemeral_document_worker_login(${login},${verifier},${new Date(Date.now()+300_000).toISOString()}::timestamptz)`;
    const connection = await openDocumentRehearsalWorker(context, login, credential);
    worker = connection.client;
    repository = createDocumentScanRepository(connection.db);
  }, 240_000);
  afterAll(async () => { if (worker) await worker.end({ timeout: 5 }); if (context) await stopRehearsal(context); }, 180_000);

  async function upload(maximumAttempts = 3) {
    const documentId = randomUUID(), versionId = randomUUID(), jobId = randomUUID(), correlationId = randomUUID();
    await context.client.begin(async (sql) => {
      await asAuthenticated(sql, fixture.pair[0], async (probe) => {
        const original = JSON.stringify({ action: "upload", documentId, versionId, organizationId: fixture.organizationId,
          actorIdentityId: fixture.pair[0].identityId, version: 1, documentType: "attachment", sha256: "b".repeat(64),
          storageReference: `quarantine://${fixture.organizationId}/${documentId}/${versionId}`, contentType: "application/pdf", byteSize: 128 });
        await probe`SELECT public.mmhr_record_workflow_document(${original}::jsonb,${correlationId}::uuid,${randomUUID()}::uuid)`;
        const queued = JSON.stringify({ action: "enqueue", jobId, organizationId: fixture.organizationId,
          actorIdentityId: fixture.pair[0].identityId, jobType: "document_scan", payloadReferences: [{ documentId, versionId }], maximumAttempts });
        await probe`SELECT public.mmhr_record_workflow_job(${queued}::jsonb,${correlationId}::uuid,${randomUUID()}::uuid)`;
      });
      await sql`INSERT INTO public.workflow_document_uploads(version_id,organization_id,document_id,upload_organization_id,
        uploaded_by_identity_id,source_kind,file_name,correlation_id)
        VALUES(${versionId}::uuid,${fixture.organizationId}::uuid,${documentId}::uuid,${fixture.organizationId}::uuid,
          ${fixture.pair[0].identityId}::uuid,'workspace','synthetic.pdf',${correlationId}::uuid)`;
      await sql`INSERT INTO public.workflow_document_upload_events(organization_id,version_id,revision,action,snapshot,correlation_id)
        VALUES(${fixture.organizationId}::uuid,${versionId}::uuid,1,'reserve','{"state":"received"}'::jsonb,${correlationId}::uuid)`;
      await sql`UPDATE public.workflow_document_uploads SET state='quarantined',revision=2,processing_job_id=${jobId}::uuid
        WHERE version_id=${versionId}::uuid`;
      await sql`INSERT INTO public.workflow_document_upload_events(organization_id,version_id,revision,action,snapshot,correlation_id)
        VALUES(${fixture.organizationId}::uuid,${versionId}::uuid,2,'uploaded','{"state":"quarantined"}'::jsonb,${correlationId}::uuid)`;
    });
    return { documentId, versionId, jobId };
  }
  async function claimed(value: Awaited<ReturnType<typeof upload>>) {
    const claim = await repository.claim(value.versionId) as DocumentScanClaim;
    expect(claim).toMatchObject({ versionId: value.versionId, documentId: value.documentId, jobId: value.jobId,
      organizationId: fixture.organizationId, revision: 3, sha256: "b".repeat(64) });
    return claim;
  }
  const evidence = (claim: DocumentScanClaim) => ({ versionId: claim.versionId, sha256: claim.sha256, state: "clean" as const,
    scanner: "clamav" as const, scannerVersion: "1.4.6", signatureVersion: 28139,
    signatureUpdatedAt: new Date(Date.now()-3_600_000).toISOString(), scannedAt: new Date().toISOString(), failureCode: null });

  test("denies copied or altered contexts and invalid credentials before opening another worker connection", async () => {
    await expect(openDocumentRehearsalWorker({ ...context }, login, "b".repeat(43)))
      .rejects.toThrow("An active owned document database rehearsal is required");
    const original = context.databaseUrl;
    try {
      context.databaseUrl = "postgresql://127.0.0.1:57022/postgres";
      await expect(openDocumentRehearsalWorker(context, login, "b".repeat(43)))
        .rejects.toThrow("An active owned document database rehearsal is required");
    } finally { context.databaseUrl = original; }
    await expect(openDocumentRehearsalWorker(context, "postgres", "b".repeat(43)))
      .rejects.toThrow("Invalid disposable document worker credentials");
  });

  test("uses a separate expiring login with no table reads, user RPCs, or identity worker privileges", async () => {
    await expect(worker`SELECT * FROM public.workflow_document_uploads`).rejects.toMatchObject({ code: "42501" });
    await expect(worker`SELECT mmhr_private.mmhr_list_identity_intent_candidates()`).rejects.toMatchObject({ code: "42501" });
    await expect(worker`SELECT public.mmhr_record_workflow_document('{}'::jsonb,${randomUUID()}::uuid,${randomUUID()}::uuid)`).rejects.toMatchObject({ code: "42501" });
    await expect(context.client.begin((sql) => asAuthenticated(sql, fixture.pair[0], async (probe) =>
      probe`SELECT mmhr_private.r4_list_document_scan_candidates()`))).rejects.toMatchObject({ code: "42501" });
    await expect(context.client`SELECT mmhr_private.r4_claim_document_scan(${randomUUID()}::uuid)`)
      .rejects.toMatchObject({ code: "42501" });
  });

  test("claims exact scoped work once and records immutable clean evidence with replay", async () => {
    const value = await upload(); expect(await repository.listCandidateIds()).toContain(value.versionId);
    const claim = await claimed(value); await expect(repository.claim(value.versionId)).resolves.toBeNull();
    await expect(repository.leaseIsCurrent(claim)).resolves.toBe(true);
    const completion = { state: "ready" as const, failureCode: null, scanEvidence: evidence(claim) };
    await expect(repository.finish(claim, completion)).resolves.toMatchObject({ state: "ready", revision: 4, outcomeCode: "recorded" });
    await expect(repository.finish(claim, completion)).resolves.toMatchObject({ state: "ready", revision: 4, outcomeCode: "replayed" });
    await expect(repository.leaseIsCurrent(claim)).resolves.toBe(false);
    const [row] = await context.client`SELECT u.state,v.scan_state,v.state AS version_state,j.state AS job_state
      FROM public.workflow_document_uploads u JOIN public.workflow_document_versions v ON v.id=u.version_id
      JOIN public.workflow_jobs j ON j.id=u.processing_job_id WHERE u.version_id=${value.versionId}::uuid`;
    expect(row).toMatchObject({ state: "ready", scan_state: "clean", version_state: "ready", job_state: "succeeded" });
    const events = await context.client`SELECT revision,action FROM public.workflow_document_upload_events WHERE version_id=${value.versionId}::uuid ORDER BY revision`;
    expect(events.map((row) => row.action)).toEqual(["reserve", "uploaded", "scan_claimed", "scan_clean"]);
  });

  test("fences another token, revision, or version without recording a clean state", async () => {
    const value = await upload(); const claim = await claimed(value);
    for (const changed of [{ leaseToken: randomUUID() }, { revision: 4 }, { versionId: randomUUID() }]) {
      await expect(repository.finish({ ...claim, ...changed }, { state: "ready", failureCode: null, scanEvidence: evidence(claim) })).resolves.toBeNull();
    }
    await expect(repository.leaseIsCurrent(claim)).resolves.toBe(true);
  });

  test("rejects missing, stale, changed, and unverified clean evidence", async () => {
    const value = await upload(); const claim = await claimed(value);
    for (const change of [{ sha256: "a".repeat(64) }, { versionId: randomUUID() }, { scannerVersion: "9.9.9" },
      { signatureUpdatedAt: new Date(Date.now()-25*3_600_000).toISOString() }, { signatureVersion: null }, { extra: "private content" }]) {
      await expect(repository.finish(claim, { state: "ready", failureCode: null, scanEvidence: { ...evidence(claim), ...change } as never }))
        .rejects.toMatchObject({ code: "UNAVAILABLE" });
    }
    await expect(repository.leaseIsCurrent(claim)).resolves.toBe(true);
  });

  test("uses bounded retries and sends exhausted scanner errors to needs_attention", async () => {
    const value = await upload(1); const claim = await claimed(value);
    await expect(repository.finish(claim, { state: "failed", failureCode: "scanner_unavailable", scanEvidence: null }))
      .resolves.toMatchObject({ state: "failed", revision: 4 });
    const [job] = await context.client`SELECT state,next_attempt_at,last_failure FROM public.workflow_jobs WHERE id=${value.jobId}::uuid`;
    expect(job).toMatchObject({ state: "needs_attention", next_attempt_at: null, last_failure: { code: "scanner_unavailable" } });
    await expect(repository.claim(value.versionId)).resolves.toBeNull();
  });

  test("retains unsafe files and completes only the processing job", async () => {
    const value = await upload(); const claim = await claimed(value);
    await expect(repository.finish(claim, { state: "rejected", failureCode: "unsafe_document",
      scanEvidence: { ...evidence(claim), state: "quarantined", failureCode: "unsafe_document" } }))
      .resolves.toMatchObject({ state: "rejected", revision: 4 });
    const [row] = await context.client`SELECT scan_state,state FROM public.workflow_document_versions WHERE id=${value.versionId}::uuid`;
    expect(row).toMatchObject({ scan_state: "quarantined", state: "ready" });
  });

  test("recovers an expired lease without accepting its old result and records the next attempt", async () => {
    const value = await upload(); const oldToken = randomUUID();
    // Model an earlier attempt through owner fixtures. Keep every production
    // trigger active, and let the public worker functions use the real clock.
    await context.client.begin(async (sql) => {
      await sql`UPDATE public.workflow_jobs SET state='running',attempts_in_cycle=1 WHERE id=${value.jobId}::uuid`;
      await sql`INSERT INTO public.workflow_job_attempts(organization_id,job_id,attempt_number,correlation_id,trigger,requested_by,started_at,outcome)
        VALUES(${fixture.organizationId}::uuid,${value.jobId}::uuid,1,${randomUUID()}::uuid,'automatic','document_worker',clock_timestamp()-interval '3 minutes','running')`;
      await sql`UPDATE public.workflow_document_uploads SET state='scanning',revision=3,lease_token=${oldToken}::uuid,
        lease_expires_at=clock_timestamp()-interval '1 second' WHERE version_id=${value.versionId}::uuid`;
      await sql`INSERT INTO public.workflow_document_upload_events(organization_id,version_id,revision,action,snapshot,correlation_id)
        VALUES(${fixture.organizationId}::uuid,${value.versionId}::uuid,3,'scan_claimed',${JSON.stringify({ state: "scanning", leaseToken: oldToken })}::jsonb,${randomUUID()}::uuid)`;
    });
    expect(await repository.listCandidateIds()).toContain(value.versionId);
    await expect(repository.claim(value.versionId)).resolves.toBeNull();
    const [job] = await context.client`SELECT state,last_failure FROM public.workflow_jobs WHERE id=${value.jobId}::uuid`;
    expect(job).toMatchObject({ state: "retry_pending", last_failure: { code: "lease_expired" } });
    await context.client`UPDATE public.workflow_jobs SET next_attempt_at=clock_timestamp()-interval '1 second' WHERE id=${value.jobId}::uuid`;
    const next = await repository.claim(value.versionId) as DocumentScanClaim;
    expect(next).toMatchObject({ versionId: value.versionId, revision: 6 }); expect(next.leaseToken).not.toBe(oldToken);
    await expect(repository.finish({ ...next, leaseToken: oldToken, revision: 3 },
      { state: "ready", failureCode: null, scanEvidence: evidence(next) })).resolves.toBeNull();
    await expect(repository.finish(next, { state: "ready", failureCode: null, scanEvidence: evidence(next) }))
      .resolves.toMatchObject({ state: "ready", revision: 7 });
    const attempts = await context.client`SELECT attempt_number,outcome,failure FROM public.workflow_job_attempts
      WHERE job_id=${value.jobId}::uuid ORDER BY attempt_number`;
    expect(attempts.map((row) => ({ attempt: row.attempt_number, outcome: row.outcome })))
      .toEqual([{ attempt: 1, outcome: "failed" }, { attempt: 2, outcome: "succeeded" }]);
    expect(attempts[0]!.failure).toEqual({ code: "lease_expired" });
  });

  test("blocks a revoked worker membership on an already-open connection", async () => {
    await context.client.unsafe(`REVOKE mmhr_document_worker FROM ${login}`);
    try { await expect(repository.listCandidateIds()).rejects.toMatchObject({ code: "UNAVAILABLE" }); }
    finally { await context.client.unsafe(`GRANT mmhr_document_worker TO ${login} WITH ADMIN FALSE, INHERIT TRUE, SET TRUE`); }
  });

  test("blocks an accidental column privilege grant to the shared document worker role", async () => {
    await context.client`GRANT SELECT(version_id) ON public.workflow_document_uploads TO mmhr_document_worker`;
    try { await expect(repository.listCandidateIds()).rejects.toMatchObject({ code: "UNAVAILABLE" }); }
    finally { await context.client`REVOKE SELECT(version_id) ON public.workflow_document_uploads FROM mmhr_document_worker`; }
    await expect(repository.listCandidateIds()).resolves.toBeInstanceOf(Array);
  });

  test("rechecks the real clock when a finish request waits past its lease deadline", async () => {
    const value = await upload(); const token = randomUUID();
    await context.client.begin(async (sql) => {
      await sql`UPDATE public.workflow_jobs SET state='running',attempts_in_cycle=1 WHERE id=${value.jobId}::uuid`;
      await sql`INSERT INTO public.workflow_job_attempts(organization_id,job_id,attempt_number,correlation_id,trigger,requested_by,started_at,outcome)
        VALUES(${fixture.organizationId}::uuid,${value.jobId}::uuid,1,${randomUUID()}::uuid,'automatic','document_worker',clock_timestamp(),'running')`;
      await sql`UPDATE public.workflow_document_uploads SET state='scanning',revision=3,lease_token=${token}::uuid,
        lease_expires_at=clock_timestamp()+interval '5 seconds' WHERE version_id=${value.versionId}::uuid`;
    });
    const [lease] = await context.client`SELECT lease_expires_at FROM public.workflow_document_uploads WHERE version_id=${value.versionId}::uuid`;
    const claim: DocumentScanClaim = { ...value, organizationId: fixture.organizationId, leaseToken: token, revision: 3,
      correlationId: randomUUID(), leaseExpiresAt: new Date(lease!.lease_expires_at).toISOString(), fileName: "synthetic.pdf",
      contentType: "application/pdf", byteSize: 128, sha256: "b".repeat(64) };
    const [backend] = await worker`SELECT pg_backend_pid() AS pid`;
    const workerPid = Number(backend!.pid); let holderPid = 0;
    let release!: () => void; let ready!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const started = new Promise<void>((resolve) => { ready = resolve; });
    const holder = context.client.begin(async (sql) => {
      const [pid] = await sql`SELECT pg_backend_pid() AS pid`; holderPid = Number(pid!.pid);
      await sql`SELECT mmhr_private.r1_lock_security()`; ready(); await held;
    });
    let completion: Promise<unknown> | undefined;
    try {
      await started;
      completion = repository.finish(claim, { state: "ready", failureCode: null, scanEvidence: evidence(claim) });
      const deadline = Date.now()+10_000; let blocked = false; let expired = false;
      while (Date.now()<deadline && !expired) {
        const [row] = await context.client`SELECT ${holderPid}::integer=ANY(pg_catalog.pg_blocking_pids(${workerPid}::integer)) AS blocked,
          clock_timestamp()>lease_expires_at AS expired FROM public.workflow_document_uploads WHERE version_id=${value.versionId}::uuid`;
        if (row!.blocked === true && row!.expired === false) blocked = true;
        expired = row!.expired === true;
        if (!expired) await delay(50);
      }
      expect(blocked).toBe(true); expect(expired).toBe(true);
      release(); await holder; await expect(completion).resolves.toBeNull();
      const [row] = await context.client`SELECT scan_state FROM public.workflow_document_versions WHERE id=${value.versionId}::uuid`;
      expect(row!.scan_state).toBe("pending");
    } finally { release(); await holder; if (completion) await completion; }
  }, 30_000);

  test("blocks an expired worker credential on an already-open connection", async () => {
    await repository.listCandidateIds();
    const expired = new Date(Date.now()-1000).toISOString();
    await context.client.unsafe(`ALTER ROLE ${login} VALID UNTIL '${expired}'`);
    try { await expect(repository.listCandidateIds()).rejects.toMatchObject({ code: "UNAVAILABLE" }); }
    finally { await context.client.unsafe(`ALTER ROLE ${login} VALID UNTIL '${new Date(Date.now()+300_000).toISOString()}'`); }
  });
});
