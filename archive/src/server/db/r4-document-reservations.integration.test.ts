import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { applyAllMigrations, startRehearsal, stopRehearsal, type RehearsalContext } from "./r1-migration-rehearsal";
import { asAuthenticated, createCommandFixture, createSecurityPrincipal, rollbackCase,
  type SecurityCommandFixture, type SecurityPrincipal, type SecurityTransaction } from "./r1-security-command-fixtures";

describe("managed workspace document reservation", () => {
  let context: RehearsalContext; let fixture: SecurityCommandFixture;
  beforeAll(async () => {
    context = await startRehearsal("r4-document-reservations"); await applyAllMigrations(context);
    fixture = await context.client.begin((sql) => createCommandFixture(sql));
    await context.client`UPDATE public.org_members SET role='contributor',role_key='contributor'
      WHERE id=${fixture.actorMembershipId}::uuid`;
  }, 240_000);
  afterAll(async () => { if (context) await stopRehearsal(context); }, 180_000);

  const input = () => ({ organizationId: fixture.organizationId, documentId: randomUUID(), versionId: randomUUID(),
    expectedVersion: 0, fileName: "synthetic.pdf", contentType: "application/pdf", byteSize: 128, sha256: "b".repeat(64) });
  async function invoke(sql: SecurityTransaction, payload: unknown, key = randomUUID(), principal: SecurityPrincipal = fixture.pair[0]) {
    return asAuthenticated(sql, principal, async (probe) => {
      const [row] = await probe<{ result: Record<string, unknown> }[]>`SELECT public.mmhr_reserve_workspace_document(
        ${JSON.stringify(payload)}::jsonb,${randomUUID()}::uuid,${key}::uuid) AS result`;
      return row!.result;
    }, "aal1");
  }
  test("reserves pending immutable originals with server-derived identity and no job or access grant", async () => {
    await rollbackCase(context, async (sql) => {
      const payload = input(); await expect(invoke(sql, payload)).resolves.toMatchObject({
        organizationId: fixture.organizationId, documentId: payload.documentId, versionId: payload.versionId,
        version: 1, revision: 1, state: "received", outcomeCode: "recorded" });
      const [row] = await sql`SELECT v.state,v.scan_state,v.sha256,v.byte_size,v.storage_reference,
        u.uploaded_by_identity_id,u.source_kind,u.processing_job_id,u.scan_evidence,u.approved_by_identity_id
        FROM public.workflow_document_versions v JOIN public.workflow_document_uploads u ON u.version_id=v.id
        WHERE v.id=${payload.versionId}::uuid`;
      expect(row).toMatchObject({ state: "ready", scan_state: "pending", sha256: payload.sha256, byte_size: 128,
        storage_reference: `quarantine://${fixture.organizationId}/${payload.documentId}/${payload.versionId}`,
        uploaded_by_identity_id: fixture.pair[0].identityId, source_kind: "workspace", processing_job_id: null,
        scan_evidence: null, approved_by_identity_id: null });
      const [event] = await sql`SELECT revision,action,snapshot FROM public.workflow_document_upload_events WHERE version_id=${payload.versionId}::uuid`;
      expect(event).toMatchObject({ revision: 1, action: "reserve", snapshot: { state: "received", version: 1 } });
    });
  });
  test("replays exactly once and rejects changed metadata using the same key", async () => {
    await rollbackCase(context, async (sql) => {
      const payload = input(), key = randomUUID(); await invoke(sql, payload, key);
      await expect(invoke(sql, payload, key)).resolves.toMatchObject({ state: "received", outcomeCode: "replayed" });
      await expect(invoke(sql, { ...payload, sha256: "a".repeat(64) }, key)).rejects.toMatchObject({ code: "22023" });
      const [counts] = await sql`SELECT
        (SELECT count(*)::int FROM public.workflow_document_upload_events WHERE version_id=${payload.versionId}::uuid) AS events,
        (SELECT count(*)::int FROM public.audit_events WHERE entity_id=${payload.versionId}) AS audits,
        (SELECT count(*)::int FROM public.security_command_receipts WHERE entity_id=${payload.versionId}::uuid) AS receipts`;
      expect(counts).toEqual({ events: 1, audits: 1, receipts: 1 });
    });
  });
  test("rejects unknown authority fields, invalid sizes, hashes, types, names, and missing fields", async () => {
    await rollbackCase(context, async (sql) => {
      for (const change of [{ actorIdentityId: randomUUID() }, { state: "approved" }, { byteSize: 0 }, { byteSize: 25_000_001 },
        { byteSize: "128" }, { expectedVersion: -1 }, { expectedVersion: 0.5 }, { sha256: "fake" }, { contentType: "text/html" },
        { fileName: "../synthetic.pdf" }, { fileName: "a\\b.pdf" }, { fileName: "x\n.pdf" }, { fileName: " " },
        { fileName: "é".repeat(128) }, { versionId: null }]) {
        await expect(invoke(sql, { ...input(), ...change })).rejects.toMatchObject({ code: "22023" });
      }
      const { sha256: omitted, ...missing } = input(); void omitted;
      await expect(invoke(sql, missing)).rejects.toMatchObject({ code: "22023" });
    });
  });
  test("denies unrelated identities and organizations", async () => {
    await rollbackCase(context, async (sql) => {
      const outsider = await createSecurityPrincipal(sql);
      await expect(invoke(sql, input(), randomUUID(), outsider)).rejects.toMatchObject({ code: "42501" });
      await expect(invoke(sql, { ...input(), organizationId: randomUUID() })).rejects.toMatchObject({ code: "42501" });
    });
  });
  test("denies a viewer who can read the workspace and a member whose writing role was removed", async () => {
    await rollbackCase(context, async (sql) => {
      const payload = input(), key = randomUUID(); await invoke(sql, payload, key);
      await sql`UPDATE public.org_members SET role='viewer',role_key='viewer' WHERE id=${fixture.actorMembershipId}::uuid`;
      // An AAL1 viewer lacks internal staff authority. Workspace read alone is insufficient.
      await expect(invoke(sql, input())).rejects.toMatchObject({ code: "42501" });
      await expect(invoke(sql, payload, key)).rejects.toMatchObject({ code: "42501" });
      await asAuthenticated(sql, fixture.pair[0], async (probe) => {
        const rows = await probe`SELECT * FROM public.mmhr_authorize('workspace.access',${fixture.organizationId}::uuid)`;
        expect(rows).toHaveLength(1);
      }, "aal1");
    });
  });
  test("rechecks authority before replay after access or provider identity is revoked", async () => {
    await rollbackCase(context, async (sql) => {
      const payload = input(), key = randomUUID(); await invoke(sql, payload, key);
      await sql`UPDATE auth.users SET banned_until=clock_timestamp()+interval '1 hour' WHERE id=${fixture.pair[0].subject}::uuid`;
      await expect(invoke(sql, payload, key)).rejects.toMatchObject({ code: "42501" });
    });
  });
  test("denies a removed Auth session even when the original token claims remain valid", async () => {
    await rollbackCase(context, async (sql) => {
      await sql`DELETE FROM auth.sessions WHERE id=${fixture.pair[0].sessionId}::uuid`;
      await expect(invoke(sql, input())).rejects.toMatchObject({ code: "42501" });
    });
  });
  test("uses the actual clock when a blocked request outlives its token", async () => {
    let release!: () => void; let notifyLocked!: (sql: SecurityTransaction) => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const locked = new Promise<SecurityTransaction>((resolve) => { notifyLocked = resolve; });
    const blocker = context.client.begin(async (sql) => {
      await sql`SELECT mmhr_private.r1_lock_security()`; notifyLocked(sql); await gate;
    });
    const holder = await Promise.race([locked, blocker.then(() => { throw new Error("Synthetic lock was not acquired"); })]);
    let notifyWriter!: (pid: number) => void;
    const started = new Promise<number>((resolve) => { notifyWriter = resolve; });
    const principal = { ...fixture.pair[0], expiresAt: new Date(Date.now() + 4000) };
    const payload = input();
    const pending = context.client.begin(async (sql) => asAuthenticated(sql, principal, async (probe) => {
      const [backend] = await probe<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`; notifyWriter(backend!.pid);
      return probe`SELECT public.mmhr_reserve_workspace_document(${JSON.stringify(payload)}::jsonb,${randomUUID()}::uuid,${randomUUID()}::uuid)`;
    }, "aal1")).then(() => ({ allowed: true, code: null }), (error: { code?: string }) => ({ allowed: false, code: error.code }));
    try {
      const writerPid = await Promise.race([started, pending.then(() => { throw new Error("Synthetic writer did not wait"); })]); let observed = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        const [row] = await holder<{ blocked: boolean }[]>`SELECT pg_backend_pid()=ANY(pg_blocking_pids(${writerPid})) AS blocked`;
        if (row!.blocked) { observed = true; break; } await delay(20);
      }
      expect(observed).toBe(true);
      await delay(Math.max(0, principal.expiresAt.getTime() - Date.now() + 100));
    } finally { release(); await blocker; }
    expect(await pending).toEqual({ allowed: false, code: "42501" });
    const [row] = await context.client`SELECT count(*)::int AS count FROM public.workflow_document_uploads WHERE version_id=${payload.versionId}::uuid`;
    expect(row!.count).toBe(0);
  });
  test("blocks replacement before review and preserves originals in a later managed version", async () => {
    await rollbackCase(context, async (sql) => {
      const payload = input(); await invoke(sql, payload);
      const replacement = { ...payload, versionId: randomUUID(), expectedVersion: 1, sha256: "a".repeat(64) };
      await expect(invoke(sql, replacement)).rejects.toMatchObject({ code: "42501" });
      // Owner fixture models an earlier rejected scan without disabling guards.
      await sql`UPDATE public.workflow_document_uploads SET state='quarantined',revision=2 WHERE version_id=${payload.versionId}::uuid`;
      await sql`UPDATE public.workflow_document_uploads SET state='rejected',revision=3 WHERE version_id=${payload.versionId}::uuid`;
      await expect(invoke(sql, replacement)).resolves.toMatchObject({ version: 2, state: "received" });
      await expect(invoke(sql, { ...replacement, versionId: randomUUID() })).rejects.toMatchObject({ code: "42501" });
      const versions = await sql`SELECT version,sha256 FROM public.workflow_document_versions WHERE document_id=${payload.documentId}::uuid ORDER BY version`;
      expect(versions).toEqual([{ version: 1, sha256: payload.sha256 }, { version: 2, sha256: replacement.sha256 }]);
    });
  });
  test("denies adopting legacy approved metadata as an actual managed original", async () => {
    await rollbackCase(context, async (sql) => {
      const payload = input();
      await asAuthenticated(sql, fixture.pair[0], async (probe) => probe`SELECT public.mmhr_record_workflow_document(
        ${JSON.stringify({ action: "upload", ...payload, actorIdentityId: fixture.pair[0].identityId, version: 1,
          documentType: "attachment", storageReference: "quarantine://legacy" })}::jsonb,${randomUUID()}::uuid,${randomUUID()}::uuid)`);
      await expect(invoke(sql, { ...payload, versionId: randomUUID(), expectedVersion: 1 })).rejects.toMatchObject({ code: "42501" });
    });
  });
  test("rolls back reservation and immutable history when auditing fails", async () => {
    await rollbackCase(context, async (sql) => {
      const payload = input();
      await sql`CREATE FUNCTION mmhr_private.reservation_test_audit_failure() RETURNS trigger LANGUAGE plpgsql AS
        'BEGIN RAISE EXCEPTION USING ERRCODE=''P0001'',MESSAGE=''Synthetic audit failure''; END'`;
      await sql`CREATE TRIGGER reservation_test_audit_failure BEFORE INSERT ON public.audit_events
        FOR EACH ROW EXECUTE FUNCTION mmhr_private.reservation_test_audit_failure()`;
      await expect(invoke(sql, payload)).rejects.toMatchObject({ code: "P0001" });
      const [row] = await sql`SELECT
        (SELECT count(*)::int FROM public.workflow_documents WHERE id=${payload.documentId}::uuid) AS documents,
        (SELECT count(*)::int FROM public.workflow_document_uploads WHERE version_id=${payload.versionId}::uuid) AS uploads`;
      expect(row).toEqual({ documents: 0, uploads: 0 });
    });
  });
});
