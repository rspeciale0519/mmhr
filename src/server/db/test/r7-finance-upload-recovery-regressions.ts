import { randomUUID } from "node:crypto";
import { expect, test } from "vitest";
import { elevatedClient, type SecurityApiPrincipal, type SecurityCommandApiFixtures } from "@/server/auth/security-command-api-fixtures";
import { reserveFinanceDocument, completeFinanceDocumentUpload } from "@/server/commands/finance-document-upload";
import { getFinanceDocumentRecovery, abandonFinanceDocumentUpload } from "@/server/commands/finance-document-recovery";
import { AuthorizationError } from "@/server/auth/authorization";
import { createSupabaseDocumentStore } from "@/server/integrations/documents/supabase-document-store";
import type { RequestSupabaseClient } from "@/server/auth/authorization";
import type { FinanceDocumentSource } from "@/lib/finance-document-upload";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SecurityTransaction } from "../r1-security-command-fixtures";

type Reservation = { organizationId: string; source: FinanceDocumentSource; documentId: string; versionId: string;
  expectedVersion: number; fileName: string; declaredMimeType: string; correlationId: string; idempotencyKey: string };
type Context = { fixture: SecurityCommandApiFixtures; internalOrganizationId: string; agreementVendorOrganizationId: string;
  unrelatedStaff: SecurityApiPrincipal; vendorAdmin: SecurityApiPrincipal; bytes: Uint8Array;
  reservation(organizationId: string, source: FinanceDocumentSource, documentId?: string, expectedVersion?: number): Reservation;
  ready(request: Reservation): Promise<void>;
  claim(versionId: string): Promise<unknown>;
  verifiedOwnerContext(client: SupabaseClient, operation: (sql: SecurityTransaction) => Promise<void>): Promise<void> };

/** Register inside the existing owned Auth/Storage fixture. No service starts here. */
export function registerFinanceUploadRecoveryRegressions(getContext: () => Context) {
  const options = (context: Context, index: 0 | 1 = 0) => ({ supabase: elevatedClient(context.fixture.pair[index]) as RequestSupabaseClient });
  const fresh = (context: Context, documentId?: string, expectedVersion = 0) => context.reservation(context.internalOrganizationId,
    { sourceClass: "agreement", vendorOrganizationId: context.agreementVendorOrganizationId }, documentId, expectedVersion);
  const scope = (request: Reservation) => ({ organizationId: request.organizationId, documentId: request.documentId, versionId: request.versionId });
  const decision = (request: Reservation) => ({ ...scope(request), expectedRevision: 1,
    reason: "Synthetic unfinished upload abandoned", correlationId: randomUUID(), idempotencyKey: randomUUID() });
  async function recover(context: Context, request: Reservation, index: 0 | 1 = 0) {
    const response = await options(context, index).supabase.rpc("mmhr_get_finance_document_recovery", {
      payload: scope(request), correlation_id: randomUUID() });
    expect(response.error).toBeNull();
    expect(response.data).toMatchObject({ organizationId: request.organizationId,
      document: { documentId: request.documentId, versionId: request.versionId }, reservationCorrelationId: request.correlationId });
    return response.data as { canResume: boolean; canAbandon: boolean; reservationExpiresAt: string; sha256: string };
  }
  async function abandon(context: Context, input: ReturnType<typeof decision>, index: 0 | 1 = 0) {
    const { correlationId, idempotencyKey, ...payload } = input;
    return options(context, index).supabase.rpc("mmhr_abandon_finance_document_upload", {
      payload, correlation_id: correlationId, idempotency_key: idempotencyKey });
  }
  async function snapshot(context: Context) {
    const [row] = await context.fixture.owner`SELECT jsonb_build_object(
      'documents',(SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY id),'[]'::jsonb) FROM public.workflow_documents d),
      'versions',(SELECT coalesce(jsonb_agg(to_jsonb(v) ORDER BY id),'[]'::jsonb) FROM public.workflow_document_versions v),
      'uploads',(SELECT coalesce(jsonb_agg(to_jsonb(u) ORDER BY version_id),'[]'::jsonb) FROM public.workflow_document_uploads u),
      'events',(SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY id),'[]'::jsonb) FROM public.workflow_document_upload_events e),
      'sources',(SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY version_id),'[]'::jsonb) FROM public.finance_document_sources s),
      'receipts',(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY id),'[]'::jsonb) FROM public.security_command_receipts r),
      'audits',(SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY id),'[]'::jsonb) FROM public.audit_events a),
      'jobs',(SELECT coalesce(jsonb_agg(to_jsonb(j) ORDER BY id),'[]'::jsonb) FROM public.workflow_jobs j),
      'objects',(SELECT coalesce(jsonb_agg(to_jsonb(o) ORDER BY id),'[]'::jsonb) FROM storage.objects o)) proof`;
    return row!.proof;
  }
  async function put(context: Context, request: Reservation) {
    await createSupabaseDocumentStore(options(context).supabase).putQuarantined({ ...scope(request), fileName: request.fileName,
      declaredMimeType: request.declaredMimeType, bytes: context.bytes });
  }
  const journey = (name: string, run: () => Promise<void>) => test(name, run, 60_000);

  journey("records abandonment through the actual scoped finance application commands", async () => {
    const context = getContext(), request = fresh(context); await reserveFinanceDocument(request, context.bytes, options(context));
    expect(await getFinanceDocumentRecovery({ ...scope(request), correlationId: randomUUID() }, options(context)))
      .toMatchObject({ canResume: true, canAbandon: true });
    const input = decision(request), recorded = await abandonFinanceDocumentUpload(input, options(context));
    expect(recorded).toMatchObject({ state: "rejected", revision: 2, outcomeCode: "recorded" });
    const before = await snapshot(context);
    expect(await abandonFinanceDocumentUpload(input, options(context))).toEqual({ ...recorded, outcomeCode: "replayed" });
    expect(await snapshot(context)).toEqual(before);
  });

  journey("resumes an actual private finance object with the original reservation", async () => {
    const context = getContext(), request = fresh(context);
    await reserveFinanceDocument(request, context.bytes, options(context));
    expect(await recover(context, request)).toMatchObject({ canResume: true, canAbandon: true });
    await put(context, request);
    expect(await reserveFinanceDocument(request, context.bytes, options(context))).toMatchObject({ outcomeCode: "replayed" });
    expect(await completeFinanceDocumentUpload({ ...scope(request), expectedRevision: 1,
      correlationId: randomUUID(), idempotencyKey: randomUUID() }, options(context))).toMatchObject({ state: "quarantined", revision: 2 });
    const before = await snapshot(context), response = await abandon(context, decision(request));
    expect(response.error?.code).toBe("42501");
    expect(await snapshot(context)).toEqual(before);
  });

  journey("allows another finance operator to abandon but prevents original byte resume", async () => {
    const context = getContext(), request = fresh(context);
    await reserveFinanceDocument(request, context.bytes, options(context));
    expect(await recover(context, request, 1)).toMatchObject({ canResume: false, canAbandon: true });
    const input = decision(request), response = await abandon(context, input, 1);
    expect(response.error).toBeNull();
    expect(response.data).toMatchObject({ action: "abandon_upload", state: "rejected", revision: 2, outcomeCode: "recorded" });
    const before = await snapshot(context), retry = await abandon(context, input, 1);
    expect(retry.error).toBeNull(); expect(retry.data).toEqual({ ...response.data as object, outcomeCode: "replayed" });
    expect(await snapshot(context)).toEqual(before);
  });

  journey("preserves an abandoned original object and source while recording replacement and exact replay", async () => {
    const context = getContext(), request = fresh(context);
    await reserveFinanceDocument(request, context.bytes, options(context)); await put(context, request);
    const [original] = await context.fixture.owner`SELECT to_jsonb(v) version,to_jsonb(s) source,
      (SELECT to_jsonb(o) FROM storage.objects o WHERE o.name=${`${request.organizationId}/${request.documentId}/${request.versionId}`}) object
      FROM public.workflow_document_versions v JOIN public.finance_document_sources s ON s.version_id=v.id WHERE v.id=${request.versionId}::uuid`;
    expect(original?.object).not.toBeNull();
    const input = decision(request), abandoned = await abandon(context, input);
    expect(abandoned.error).toBeNull(); expect(abandoned.data).toMatchObject({ state: "rejected", outcomeCode: "recorded" });
    const replacement = fresh(context, request.documentId, 1);
    expect(await reserveFinanceDocument(replacement, context.bytes, options(context))).toMatchObject({ version: 2, state: "received" });
    const [retained] = await context.fixture.owner`SELECT to_jsonb(v) version,to_jsonb(s) source,
      (SELECT to_jsonb(o) FROM storage.objects o WHERE o.name=${`${request.organizationId}/${request.documentId}/${request.versionId}`}) object
      FROM public.workflow_document_versions v JOIN public.finance_document_sources s ON s.version_id=v.id WHERE v.id=${request.versionId}::uuid`;
    expect(retained).toEqual(original);
    const before = await snapshot(context), replay = await abandon(context, input);
    expect(replay.error).toBeNull(); expect(replay.data).toEqual({ ...abandoned.data as object, outcomeCode: "replayed" });
    expect(await snapshot(context)).toEqual(before);
    expect((await abandon(context, { ...input, reason: "Changed abandonment reason" })).error?.code).toBe("22023");
    expect(await snapshot(context)).toEqual(before);
  });

  journey("permits abandonment after vendor suspension while preserving exact original source integrity", async () => {
    const context = getContext(), request = fresh(context);
    await reserveFinanceDocument(request, context.bytes, options(context));
    await context.fixture.owner`UPDATE public.orgs SET status='suspended',suspended_at=clock_timestamp()
      WHERE id=${context.agreementVendorOrganizationId}::uuid`;
    try {
      expect(await recover(context, request)).toMatchObject({ canResume: false, canAbandon: true });
      expect((await abandon(context, decision(request))).error).toBeNull();
      const [source] = await context.fixture.owner`SELECT source_snapshot FROM public.finance_document_sources WHERE version_id=${request.versionId}::uuid`;
      expect(source?.source_snapshot).toEqual(request.source);
    } finally {
      await context.fixture.owner`UPDATE public.orgs SET status='active',suspended_at=NULL WHERE id=${context.agreementVendorOrganizationId}::uuid`;
    }
  });

  journey("denies changed original manifests and crossed recovery scope or version without writes", async () => {
    const context = getContext(), request = fresh(context); await reserveFinanceDocument(request, context.bytes, options(context));
    const before = await snapshot(context);
    for (const changed of [{ fileName: "changed.pdf" }, { declaredMimeType: "image/png" }]) {
      await expect(reserveFinanceDocument({ ...request, ...changed }, context.bytes, options(context))).rejects.toThrow();
      expect(await snapshot(context)).toEqual(before);
    }
    for (const changed of [{ organizationId: context.fixture.organizationId }, { documentId: randomUUID() }, { versionId: randomUUID() }]) {
      const read = await options(context).supabase.rpc("mmhr_get_finance_document_recovery", { payload: { ...scope(request), ...changed }, correlation_id: randomUUID() });
      expect(read.error?.code).toBe("42501"); expect(read.data).toBeNull();
      expect((await abandon(context, { ...decision(request), ...changed })).error?.code).toBe("42501");
      expect(await snapshot(context)).toEqual(before);
    }
  });

  journey("denies recovery and abandonment to non-finance, AAL1, vendor, customer and anonymous request roles", async () => {
    const context = getContext(), request = fresh(context); await reserveFinanceDocument(request, context.bytes, options(context));
    const before = await snapshot(context), input = decision(request), { correlationId, idempotencyKey, ...payload } = input;
    for (const client of [context.fixture.anonymous, context.fixture.pair[0].aal1, elevatedClient(context.unrelatedStaff),
      elevatedClient(context.vendorAdmin), elevatedClient(context.fixture.organizationAdmin)]) {
      const deniedOptions = { supabase: client as RequestSupabaseClient };
      await expect(getFinanceDocumentRecovery({ ...scope(request), correlationId }, deniedOptions)).rejects.toBeInstanceOf(AuthorizationError);
      await expect(abandonFinanceDocumentUpload(input, deniedOptions)).rejects.toBeInstanceOf(AuthorizationError);
      const read = await client.rpc("mmhr_get_finance_document_recovery", { payload: scope(request), correlation_id: correlationId });
      expect(read.error?.code).toBe("42501"); expect(read.data).toBeNull();
      const write = await client.rpc("mmhr_abandon_finance_document_upload", { payload, correlation_id: correlationId, idempotency_key: idempotencyKey });
      expect(write.error?.code).toBe("42501"); expect(write.data).toBeNull(); expect(await snapshot(context)).toEqual(before);
    }
  });

  journey("reauthorizes abandoned upload retries after scoped finance permission revocation", async () => {
    const context = getContext(), request = fresh(context); await reserveFinanceDocument(request, context.bytes, options(context));
    const input = decision(request); expect((await abandon(context, input)).error).toBeNull(); const before = await snapshot(context);
    await context.fixture.owner`UPDATE public.user_permission_overrides SET effect='deny' WHERE identity_id=${context.fixture.pair[0].identityId}::uuid
      AND organization_id=${context.internalOrganizationId}::uuid AND permission_key='finance.manage'`;
    try { expect((await abandon(context, input)).error?.code).toBe("42501"); }
    finally { await context.fixture.owner`UPDATE public.user_permission_overrides SET effect='allow' WHERE identity_id=${context.fixture.pair[0].identityId}::uuid
      AND organization_id=${context.internalOrganizationId}::uuid AND permission_key='finance.manage'`; }
    expect(await snapshot(context)).toEqual(before);
  });

  journey("rejects malformed abandonment revisions and payload additions without writes", async () => {
    const context = getContext(), request = fresh(context); await reserveFinanceDocument(request, context.bytes, options(context));
    const before = await snapshot(context), input = decision(request), { correlationId, idempotencyKey, ...base } = input;
    for (const expectedRevision of [null, "1", 0, 2, 1.5, {}, []]) {
      const response = await options(context).supabase.rpc("mmhr_abandon_finance_document_upload", {
        payload: { ...base, expectedRevision }, correlation_id: correlationId, idempotency_key: idempotencyKey });
      expect(response.error?.code).toBe("22023"); expect(await snapshot(context)).toEqual(before);
    }
    const missing: Record<string, unknown> = { ...base }; delete missing.expectedRevision;
    for (const payload of [missing, { ...base, extra: true }, { ...base, reason: null }]) {
      const response = await options(context).supabase.rpc("mmhr_abandon_finance_document_upload", { payload, correlation_id: correlationId, idempotency_key: idempotencyKey });
      expect(response.error?.code).toBe("22023"); expect(await snapshot(context)).toEqual(before);
    }
  });

  journey("denies abandonment after a real upload job starts and after replacement", async () => {
    const context = getContext(), queued = fresh(context); await reserveFinanceDocument(queued, context.bytes, options(context)); await put(context, queued);
    await completeFinanceDocumentUpload({ ...scope(queued), expectedRevision: 1, correlationId: randomUUID(), idempotencyKey: randomUUID() }, options(context));
    const beforeQueued = await snapshot(context); expect((await abandon(context, decision(queued))).error?.code).toBe("42501");
    expect(await snapshot(context)).toEqual(beforeQueued);
    expect(await context.claim(queued.versionId)).not.toBeNull();
    const beforeScanning = await snapshot(context); expect((await abandon(context, decision(queued))).error?.code).toBe("42501");
    expect(await snapshot(context)).toEqual(beforeScanning);
    const original = fresh(context); await context.ready(original);
    await reserveFinanceDocument(fresh(context, original.documentId, 1), context.bytes, options(context));
    const beforeReplacement = await snapshot(context); expect((await abandon(context, decision(original))).error?.code).toBe("42501");
    expect(await snapshot(context)).toEqual(beforeReplacement);
  });

  journey("rolls back abandonment when its required audit cannot be stored", async () => {
    const context = getContext(), request = fresh(context); await reserveFinanceDocument(request, context.bytes, options(context));
    const input = decision(request), before = await snapshot(context);
    await context.fixture.owner`ALTER TABLE public.audit_events ADD CONSTRAINT finance_abandon_audit_failure CHECK(command<>'r7.finance.document.abandon') NOT VALID`;
    try { expect((await abandon(context, input)).error).not.toBeNull(); }
    finally { await context.fixture.owner`ALTER TABLE public.audit_events DROP CONSTRAINT finance_abandon_audit_failure`; }
    expect(await snapshot(context)).toEqual(before); expect((await abandon(context, input)).error).toBeNull();
  });

  for (const forgery of ["reason", "digest", "actor"] as const) journey(`denies forged abandonment ${forgery} receipts under genuine signed finance claims`, async () => {
    const context = getContext(), request = fresh(context); await reserveFinanceDocument(request, context.bytes, options(context));
    const input = decision(request), before = await snapshot(context); let receiptCreated = false;
    await expect(context.verifiedOwnerContext(elevatedClient(context.fixture.pair[0]), async sql => {
      const [clock] = await sql<{ at: Date }[]>`SELECT clock_timestamp() AS at`;
      await sql`UPDATE public.workflow_document_uploads SET state='rejected',revision=2,review_reason=${input.reason},updated_at=${clock!.at}
        WHERE version_id=${request.versionId}::uuid`;
      await sql`INSERT INTO public.workflow_document_upload_events(organization_id,version_id,revision,action,actor_identity_id,snapshot,correlation_id,created_at)
        VALUES(${request.organizationId}::uuid,${request.versionId}::uuid,2,'abandon',${context.fixture.pair[0].identityId}::uuid,
          jsonb_build_object('state','rejected','reason',${input.reason}),${input.correlationId}::uuid,${clock!.at})`;
      const { correlationId: _correlation, idempotencyKey: _key, ...payload } = input; void [_correlation, _key];
      await sql`SELECT mmhr_private.r1_finish_security_command(
        ${context.fixture.pair[forgery === "actor" ? 1 : 0].identityId}::uuid,'r7.finance.document.abandon','document.abandon',
        'workflow_document_version',${request.versionId}::uuid,${request.organizationId}::uuid,
        ${forgery === "reason" ? "Different receipt reason" : input.reason},${input.correlationId}::uuid,${input.idempotencyKey}::uuid,
        ${JSON.stringify(forgery === "digest" ? { ...payload, extra: true } : payload)}::jsonb,
        jsonb_build_object('status','completed'),jsonb_build_object('status','completed'),${clock!.at}::timestamptz)`;
      receiptCreated = true;
    })).rejects.toMatchObject({ code: "42501", message: "Finance upload abandonment evidence missing" });
    expect(receiptCreated).toBe(true); expect(await snapshot(context)).toEqual(before);
  });

  journey("preserves abandoned immutable history and denies raw owner state edits", async () => {
    const context = getContext(), request = fresh(context); await reserveFinanceDocument(request, context.bytes, options(context));
    const before = await snapshot(context);
    await expect(context.fixture.owner`UPDATE public.workflow_document_uploads SET state='rejected',revision=2,review_reason='Missing evidence'
      WHERE version_id=${request.versionId}::uuid`).rejects.toMatchObject({ code: "42501" });
    expect(await snapshot(context)).toEqual(before); expect((await abandon(context, decision(request))).error).toBeNull();
    const retained = await snapshot(context);
    await expect(context.fixture.owner`UPDATE public.workflow_document_upload_events SET snapshot='{}'::jsonb WHERE version_id=${request.versionId}::uuid`)
      .rejects.toMatchObject({ code: "42501", message: "Document upload history is immutable" });
    await expect(context.fixture.owner`DELETE FROM public.workflow_document_upload_events WHERE version_id=${request.versionId}::uuid`)
      .rejects.toMatchObject({ code: "42501", message: "Document upload history is immutable" });
    expect(await snapshot(context)).toEqual(retained);
  });

  test("restricts recovery entry points and private evidence helpers to their exact execution roles", async () => {
    const context = getContext();
    const rows = await context.fixture.owner<{ proname: string; prosecdef: boolean; fixed_path: boolean;
      authenticated: boolean; anonymous: boolean; service: boolean; worker: boolean; scanner: boolean }[]>`
      SELECT p.proname,p.prosecdef,p.proconfig @> ARRAY['search_path=""'] fixed_path,
        has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated,
        has_function_privilege('anon',p.oid,'EXECUTE') anonymous,has_function_privilege('service_role',p.oid,'EXECUTE') service,
        has_function_privilege('mmhr_worker',p.oid,'EXECUTE') worker,
        has_function_privilege('mmhr_document_worker',p.oid,'EXECUTE') scanner
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
        AND p.proname IN ('mmhr_get_finance_document_recovery','mmhr_abandon_finance_document_upload')`;
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(row).toMatchObject({ prosecdef: true, fixed_path: true, authenticated: true,
      anonymous: false, service: false, worker: false, scanner: false });
    const privateRows = await context.fixture.owner<{ denied: boolean }[]>`SELECT
      NOT has_function_privilege('authenticated',p.oid,'EXECUTE') AND NOT has_function_privilege('anon',p.oid,'EXECUTE')
      AND NOT has_function_privilege('service_role',p.oid,'EXECUTE') AND NOT has_function_privilege('mmhr_worker',p.oid,'EXECUTE')
      AND NOT has_function_privilege('mmhr_document_worker',p.oid,'EXECUTE') denied
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='mmhr_private' AND p.proname IN ('r7_finance_document_unstarted','r7_finance_document_abandon_evidence')`;
    expect(privateRows).toHaveLength(2); expect(privateRows.every(row => row.denied)).toBe(true);
  });

  test("uses the actual ten-minute reservation expiry before abandonment and replacement", async () => {
    const context = getContext(), request = fresh(context); await reserveFinanceDocument(request, context.bytes, options(context));
    const live = await recover(context, request); expect(live).toMatchObject({ canResume: true, canAbandon: true });
    const deadline = Date.parse(live.reservationExpiresAt); expect(Number.isFinite(deadline)).toBe(true);
    expect(deadline - Date.now()).toBeGreaterThan(0); expect(deadline - Date.now()).toBeLessThanOrEqual(600_000);
    console.info("Finance recovery waits for actual reservation expiry", { milliseconds: deadline - Date.now() });
    while (Date.now() <= deadline) await new Promise(resolve => setTimeout(resolve, Math.min(30_000, deadline - Date.now() + 1)));
    console.info("Finance recovery actual reservation expiry reached");
    expect(await recover(context, request)).toMatchObject({ canResume: false, canAbandon: true });
    await expect(put(context, request)).rejects.toThrow();
    const input = decision(request), response = await abandon(context, input); expect(response.error).toBeNull();
    expect(await reserveFinanceDocument(fresh(context, request.documentId, 1), context.bytes, options(context))).toMatchObject({ version: 2 });
    const before = await snapshot(context), replay = await abandon(context, input);
    expect(replay.error).toBeNull(); expect(replay.data).toEqual({ ...response.data as object, outcomeCode: "replayed" });
    expect(await snapshot(context)).toEqual(before);
  }, 720_000);
}
