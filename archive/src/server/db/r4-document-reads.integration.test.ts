import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { workspaceDocumentHistoryPageSchema, workspaceDocumentPageSchema, workspaceDocumentVersionPageSchema } from "@/lib/workspace-documents";
import { applyAllMigrations, startRehearsal, stopRehearsal, type RehearsalContext } from "./r1-migration-rehearsal";
import { asAuthenticated, createCommandFixture, createSecurityPrincipal, rollbackCase,
  type SecurityCommandFixture, type SecurityPrincipal, type SecurityTransaction } from "./r1-security-command-fixtures";

describe("managed workspace document metadata reads", () => {
  let context: RehearsalContext; let fixture: SecurityCommandFixture;
  beforeAll(async () => {
    context = await startRehearsal("r4-document-reads"); await applyAllMigrations(context);
    fixture = await context.client.begin((sql) => createCommandFixture(sql));
    await context.client`UPDATE public.org_members SET role='contributor',role_key='contributor' WHERE id=${fixture.actorMembershipId}::uuid`;
  }, 240_000);
  afterAll(async () => { if (context) await stopRehearsal(context); }, 180_000);
  async function reserve(sql: SecurityTransaction, documentId = randomUUID(), expectedVersion = 0, fileName = "synthetic.pdf") {
    const input = { organizationId: fixture.organizationId, documentId, versionId: randomUUID(), expectedVersion,
      fileName, contentType: "application/pdf", byteSize: 128, sha256: "b".repeat(64) };
    await asAuthenticated(sql, fixture.pair[0], (probe) => probe`SELECT public.mmhr_reserve_workspace_document(
      ${JSON.stringify(input)}::jsonb,${randomUUID()}::uuid,${randomUUID()}::uuid)`, "aal1");
    return input;
  }
  async function read(sql: SecurityTransaction, kind: "list" | "versions" | "history", payload: unknown,
    principal: SecurityPrincipal = fixture.pair[0], assurance: "aal1" | "aal2" = "aal1") {
    return asAuthenticated(sql, principal, async (probe) => {
      const name = kind === "list" ? "mmhr_get_workspace_documents" : kind === "versions" ? "mmhr_get_workspace_document_versions" : "mmhr_get_workspace_document_history";
      const rows = await probe.unsafe<{ result: unknown }[]>(`SELECT public.${name}($1::jsonb,$2::uuid) AS result`, [JSON.stringify(payload), randomUUID()]);
      return rows[0]!.result;
    }, assurance);
  }
  test("returns safe current metadata without raw file, scan, actor, or extracted fields", async () => {
    await rollbackCase(context, async (sql) => {
      const value = await reserve(sql);
      const page = workspaceDocumentPageSchema.parse(await read(sql, "list", { organizationId: fixture.organizationId }));
      expect(page).toMatchObject({ organizationId: fixture.organizationId, canUpload: true, nextCursor: null });
      expect(page.items).toHaveLength(1); expect(page.items[0]).toMatchObject({ documentId: value.documentId, versionId: value.versionId,
        state: "received", version: 1, revision: 1, isCurrent: true, failureCode: null });
      for (const field of ["sha256", "storageReference", "scanEvidence", "leaseToken", "uploadedByIdentityId", "approvedExtractedContent"]) {
        expect(JSON.stringify(page)).not.toContain(field);
      }
      for (const table of ["workflow_document_uploads", "workflow_document_upload_events"]) {
        await expect(asAuthenticated(sql, fixture.pair[0], (probe) => probe.unsafe(`SELECT * FROM public.${table}`), "aal1"))
          .rejects.toMatchObject({ code: "42501" });
      }
    });
  });
  test("allows ordinary viewers to read metadata without upload authority", async () => {
    await rollbackCase(context, async (sql) => {
      await reserve(sql);
      await sql`UPDATE public.org_members SET role='viewer',role_key='viewer' WHERE id=${fixture.actorMembershipId}::uuid`;
      const page = workspaceDocumentPageSchema.parse(await read(sql, "list", { organizationId: fixture.organizationId }));
      expect(page.canUpload).toBe(false); expect(page.items).toHaveLength(1);
    });
  });
  test("searches current managed file names case-insensitively without exposing content", async () => {
    await rollbackCase(context, async (sql) => {
      const wanted = await reserve(sql, randomUUID(), 0, "Approved PRICE.pdf");
      await reserve(sql, randomUUID(), 0, "Other.pdf");
      const page = workspaceDocumentPageSchema.parse(await read(sql, "list", { organizationId: fixture.organizationId, searchQuery: " price " }));
      expect(page.items.map((row) => row.documentId)).toEqual([wanted.documentId]);
      expect(page.items[0]).toMatchObject({ state: "received", fileName: "Approved PRICE.pdf" });
      expect(JSON.stringify(page)).not.toContain("approvedExtractedContent");
    });
  });
  test("treats wildcard and quote characters as literal file-name characters", async () => {
    await rollbackCase(context, async (sql) => {
      const wanted = await reserve(sql, randomUUID(), 0, "Price_100%.pdf");
      for (const searchQuery of ["%", "_"]) {
        const page = workspaceDocumentPageSchema.parse(await read(sql, "list", { organizationId: fixture.organizationId, searchQuery }));
        expect(page.items.map((row) => row.documentId)).toEqual([wanted.documentId]);
      }
      const empty = workspaceDocumentPageSchema.parse(await read(sql, "list", { organizationId: fixture.organizationId, searchQuery: "' OR true--" }));
      expect(empty.items).toEqual([]); expect(empty.nextCursor).toBeNull();
    });
  });
  test("rejects malformed direct SQL search inputs before reading any metadata", async () => {
    await rollbackCase(context, async (sql) => {
      for (const searchQuery of [null, {}, 1, "", "   ", "x".repeat(121), "one\ntwo", "a\u007fb"]) {
        await expect(read(sql, "list", { organizationId: fixture.organizationId, searchQuery })).rejects.toMatchObject({ code: "22023" });
      }
    });
  });
  test("limits stable identifier pages and returns no duplicate or hidden twenty-sixth row", async () => {
    await rollbackCase(context, async (sql) => {
      await reserve(sql);
      // Only pagination rows use owner seeding. Original association guards
      // remain active; the tested reads still run as the ordinary user.
      const rows = Array.from({ length: 26 }, () => ({ documentId: randomUUID(), versionId: randomUUID() }));
      const encoded = JSON.stringify(rows);
      await sql`INSERT INTO public.workflow_documents(id,organization_id,document_type,current_version,state,created_by_identity_id)
        SELECT (entry->>'documentId')::uuid,${fixture.organizationId}::uuid,'attachment',1,'active',${fixture.pair[0].identityId}::uuid
        FROM jsonb_array_elements(${encoded}::jsonb) entry`;
      await sql`INSERT INTO public.workflow_document_versions(id,organization_id,document_id,version,state,sha256,storage_reference,content_type,byte_size,scan_state,created_by_identity_id)
        SELECT (entry->>'versionId')::uuid,${fixture.organizationId}::uuid,(entry->>'documentId')::uuid,1,'ready',${"b".repeat(64)},
          'quarantine://'||${fixture.organizationId}::text||'/'||(entry->>'documentId')||'/'||(entry->>'versionId'),
          'application/pdf',128,'pending',${fixture.pair[0].identityId}::uuid FROM jsonb_array_elements(${encoded}::jsonb) entry`;
      await sql`INSERT INTO public.workflow_document_uploads(version_id,organization_id,document_id,upload_organization_id,uploaded_by_identity_id,source_kind,file_name,correlation_id)
        SELECT (entry->>'versionId')::uuid,${fixture.organizationId}::uuid,(entry->>'documentId')::uuid,${fixture.organizationId}::uuid,
          ${fixture.pair[0].identityId}::uuid,'workspace','synthetic.pdf',gen_random_uuid() FROM jsonb_array_elements(${encoded}::jsonb) entry`;
      const first = workspaceDocumentPageSchema.parse(await read(sql, "list", { organizationId: fixture.organizationId, searchQuery: "synthetic" }));
      expect(first.items).toHaveLength(25); expect(first.nextCursor).toBe(first.items.at(-1)!.documentId);
      const second = workspaceDocumentPageSchema.parse(await read(sql, "list", { organizationId: fixture.organizationId, afterId: first.nextCursor, searchQuery: "synthetic" }));
      expect(second.items).toHaveLength(2); expect(second.nextCursor).toBeNull();
      expect(new Set([...first.items, ...second.items].map((row) => row.documentId)).size).toBe(27);
    });
  });
  test("preserves managed versions and exposes only immutable public history summaries", async () => {
    await rollbackCase(context, async (sql) => {
      const first = await reserve(sql);
      await sql`UPDATE public.workflow_document_uploads SET state='quarantined',revision=2 WHERE version_id=${first.versionId}::uuid`;
      await sql`UPDATE public.workflow_document_uploads SET state='rejected',revision=3,failure_code='scanner_private_code' WHERE version_id=${first.versionId}::uuid`;
      for (const [revision, action] of [[2, "uploaded"], [3, "scan_rejected"]] as const) {
        await sql`INSERT INTO public.workflow_document_upload_events(organization_id,version_id,revision,action,snapshot,actor_identity_id,correlation_id)
          VALUES(${fixture.organizationId}::uuid,${first.versionId}::uuid,${revision},${action},'{"private":"never disclose"}',${fixture.pair[0].identityId}::uuid,${randomUUID()}::uuid)`;
      }
      const second = await reserve(sql, first.documentId, 1);
      const versions = workspaceDocumentVersionPageSchema.parse(await read(sql, "versions", { organizationId: fixture.organizationId, documentId: first.documentId, afterVersion: 0 }));
      expect(versions.currentVersion).toBe(2); expect(versions.items.map((row) => [row.version, row.isCurrent, row.failureCode])).toEqual([[1, false, "processing_failed"], [2, true, null]]);
      const history = workspaceDocumentHistoryPageSchema.parse(await read(sql, "history", { organizationId: fixture.organizationId, documentId: first.documentId, versionId: first.versionId, afterRevision: 0 }));
      expect(history.items.map((row) => row.action)).toEqual(["reserve", "uploaded", "scan_rejected"]);
      expect(JSON.stringify(history)).not.toContain("private"); expect(JSON.stringify(history)).not.toContain(fixture.pair[0].identityId);
      const current = workspaceDocumentPageSchema.parse(await read(sql, "list", { organizationId: fixture.organizationId }));
      expect(current.items.map((row) => row.versionId)).toEqual([second.versionId]);
    });
  });
  test("denies foreign documents and mismatched version associations with the same safe error", async () => {
    await rollbackCase(context, async (sql) => {
      const first = await reserve(sql), second = await reserve(sql);
      await expect(read(sql, "versions", { organizationId: fixture.organizationId, documentId: randomUUID(), afterVersion: 0 })).rejects.toMatchObject({ code: "42501", message: "Document read denied" });
      await expect(read(sql, "history", { organizationId: fixture.organizationId, documentId: first.documentId, versionId: second.versionId, afterRevision: 0 })).rejects.toMatchObject({ code: "42501", message: "Document read denied" });
      const outsider = await createSecurityPrincipal(sql);
      await expect(read(sql, "list", { organizationId: fixture.organizationId }, outsider)).rejects.toMatchObject({ code: "42501" });
    });
  });
  test("rejects invalid scopes, numeric cursors, and caller-supplied authority", async () => {
    await rollbackCase(context, async (sql) => {
      for (const payload of [{ organizationId: fixture.organizationId, canUpload: true }, { organizationId: null },
        { organizationId: fixture.organizationId, afterId: null }, { organizationId: fixture.organizationId, actorIdentityId: fixture.pair[0].identityId }]) {
        await expect(read(sql, "list", payload)).rejects.toMatchObject({ code: "22023" });
      }
      for (const cursor of [-1, 0.5, "1", null, 100001, 2147483647]) {
        await expect(read(sql, "versions", { organizationId: fixture.organizationId, documentId: randomUUID(), afterVersion: cursor })).rejects.toMatchObject({ code: "22023" });
      }
      for (const cursor of [-1, 0.5, "1", null, 2147483647]) {
        await expect(read(sql, "history", { organizationId: fixture.organizationId, documentId: randomUUID(), versionId: randomUUID(), afterRevision: cursor })).rejects.toMatchObject({ code: "22023" });
      }
    });
  });
  test("denies removed sessions, banned providers, and revoked memberships despite earlier valid claims", async () => {
    for (const restriction of ["session", "provider", "membership"] as const) await rollbackCase(context, async (sql) => {
      await reserve(sql);
      if (restriction === "session") await sql`DELETE FROM auth.sessions WHERE id=${fixture.pair[0].sessionId}::uuid`;
      if (restriction === "provider") await sql`UPDATE auth.users SET banned_until=clock_timestamp()+interval '1 hour' WHERE id=${fixture.pair[0].subject}::uuid`;
      if (restriction === "membership") await sql`UPDATE public.org_members SET status='suspended',suspended_at=clock_timestamp() WHERE id=${fixture.actorMembershipId}::uuid`;
      await expect(read(sql, "list", { organizationId: fixture.organizationId })).rejects.toMatchObject({ code: "42501" });
    });
  });
  test("checks the actual clock after a security lock wait", async () => {
    let release!: () => void; let notifyLocked!: (sql: SecurityTransaction) => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const locked = new Promise<SecurityTransaction>((resolve) => { notifyLocked = resolve; });
    const blocker = context.client.begin(async (sql) => { await sql`SELECT mmhr_private.r1_lock_security()`; notifyLocked(sql); await gate; });
    const holder = await Promise.race([locked, blocker.then(() => { throw new Error("Synthetic lock failed"); })]);
    let notifyReader!: (pid: number) => void;
    const started = new Promise<number>((resolve) => { notifyReader = resolve; });
    const principal = { ...fixture.pair[0], expiresAt: new Date(Date.now() + 4000) };
    const pending = context.client.begin((sql) => asAuthenticated(sql, principal, async (probe) => {
      const [backend] = await probe<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`; notifyReader(backend!.pid);
      return probe`SELECT public.mmhr_get_workspace_documents(${JSON.stringify({ organizationId: fixture.organizationId })}::jsonb,${randomUUID()}::uuid)`;
    }, "aal1")).then(() => ({ allowed: true }), (error: { code?: string }) => ({ allowed: false, code: error.code }));
    try {
      const readerPid = await Promise.race([started, pending.then(() => { throw new Error("Synthetic reader did not wait"); })]); let observed = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        const [row] = await holder<{ blocked: boolean }[]>`SELECT pg_backend_pid()=ANY(pg_blocking_pids(${readerPid})) AS blocked`;
        if (row!.blocked) { observed = true; break; } await delay(20);
      }
      expect(observed).toBe(true); await delay(Math.max(0, principal.expiresAt.getTime() - Date.now() + 100));
    } finally { release(); await blocker; }
    expect(await pending).toEqual({ allowed: false, code: "42501" });
  });
  test("excludes legacy metadata and denies archived managed document reads", async () => {
    await rollbackCase(context, async (sql) => {
      const legacy = { action: "upload", organizationId: fixture.organizationId, documentId: randomUUID(), versionId: randomUUID(),
        actorIdentityId: fixture.pair[0].identityId, version: 1, documentType: "attachment", sha256: "a".repeat(64),
        storageReference: "quarantine://legacy", contentType: "application/pdf", byteSize: 128 };
      await asAuthenticated(sql, fixture.pair[0], (probe) => probe`SELECT public.mmhr_record_workflow_document(
        ${JSON.stringify(legacy)}::jsonb,${randomUUID()}::uuid,${randomUUID()}::uuid)`);
      expect(workspaceDocumentPageSchema.parse(await read(sql, "list", { organizationId: fixture.organizationId })).items).toEqual([]);
      await expect(read(sql, "versions", { organizationId: fixture.organizationId, documentId: legacy.documentId, afterVersion: 0 })).rejects.toMatchObject({ code: "42501" });
      const managed = await reserve(sql);
      await sql`UPDATE public.workflow_documents SET state='archived' WHERE id=${managed.documentId}::uuid`;
      expect(workspaceDocumentPageSchema.parse(await read(sql, "list", { organizationId: fixture.organizationId })).items).toEqual([]);
      await expect(read(sql, "history", { organizationId: fixture.organizationId, documentId: managed.documentId, versionId: managed.versionId, afterRevision: 0 }))
        .rejects.toMatchObject({ code: "42501" });
    });
  });
  test("keeps private helpers and product reads outside worker authority", async () => {
    await rollbackCase(context, async (sql) => {
      await expect(asAuthenticated(sql, fixture.pair[0], (probe) => probe`SELECT mmhr_private.r4_workspace_document_reader(${fixture.organizationId}::uuid)`))
        .rejects.toMatchObject({ code: "42501" });
      for (const role of ["anon", "mmhr_worker", "mmhr_document_worker"]) {
        await expect(sql.savepoint(async (probe) => {
          await probe.unsafe(`SET LOCAL ROLE ${role}`);
          await probe`SELECT public.mmhr_get_workspace_documents(${JSON.stringify({ organizationId: fixture.organizationId })}::jsonb,${randomUUID()}::uuid)`;
        })).rejects.toMatchObject({ code: "42501" });
      }
    });
  });
});
