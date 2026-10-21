import { createHash, randomUUID } from "node:crypto";
import { expect } from "vitest";
import type { SecurityTransaction } from "../r1-security-command-fixtures";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSecurityCommandApiFixtures, elevatedClient, verifiedApiClaims, type SecurityCommandApiFixtures, type SecurityApiPrincipal } from "@/server/auth/security-command-api-fixtures";
import type { RequestSupabaseClient } from "@/server/auth/authorization";
import { executeManagedFinanceCommand, getManagedFinanceDetail } from "@/server/commands/managed-finance";
import { reserveFinanceDocument, completeFinanceDocumentUpload } from "@/server/commands/finance-document-upload";
import { issueFinanceDocumentAccess, recordFinanceDocumentReview } from "@/server/commands/finance-document-review";
import { createSupabaseDocumentStore } from "@/server/integrations/documents/supabase-document-store";
import { downloadFinanceDocument } from "@/server/integrations/documents/finance-document-download";
import { runDocumentScan } from "@/server/workflows/document-scan-worker";
import type { FinanceDocumentSource } from "@/lib/finance-document-upload";
import type { ManagedFinanceCommand } from "@/lib/managed-finance-workflow";
import { seedSignedFinanceDocumentSourceWithPortal } from "./r7-finance-document-fixtures";

export const commandMetadata = () => ({ correlationId: randomUUID(), idempotencyKey: randomUUID(), reason: "Synthetic managed finance verification" });
export type ManagedFinanceAuthFixture = Awaited<ReturnType<typeof createManagedFinanceAuthFixture>>;
export type ManagedFinanceCase = Awaited<ReturnType<typeof seedSignedFinanceDocumentSourceWithPortal>> & {
  organizationId: string; internalOrg: string; agreementId: string };
export type ApprovedOriginal = { organizationId: string; documentId: string; versionId: string; sha256: string;
  version: number; source: FinanceDocumentSource };
export type AgreementPreparation = Extract<ManagedFinanceCommand, { action: "prepare_agreement" }>;
export type FactsPreparation = Extract<ManagedFinanceCommand, { action: "prepare_contract_facts" }>;

export async function signedOwner<T>(fixture: SecurityCommandApiFixtures, client: SupabaseClient,
  operation: (sql: SecurityTransaction) => Promise<T>) {
  await verifiedApiClaims(client, "aal2");
  const verified = await client.auth.getClaims();
  if (verified.error || !verified.data?.claims) throw new Error("Genuine signed claims missing");
  return fixture.owner.begin(async sql => {
    await sql`SELECT set_config('request.jwt.claims',${JSON.stringify(verified.data.claims)},true)`;
    return operation(sql);
  });
}

export async function createManagedFinanceAuthFixture(fixtureOptions: Readonly<{ documentBytes?: Uint8Array }> = {}) {
  if (fixtureOptions.documentBytes !== undefined && (!(fixtureOptions.documentBytes instanceof Uint8Array) ||
    fixtureOptions.documentBytes.byteLength < 1 || fixtureOptions.documentBytes.byteLength > 25_000_000)) {
    throw new Error("Synthetic original bytes must satisfy the existing private file-size bound");
  }
  const providedBytes = fixtureOptions.documentBytes === undefined ? null : Buffer.from(fixtureOptions.documentBytes);
  const fixture = await createSecurityCommandApiFixtures({ storage: true });
  try {
    expect(fixture.isolation.apiLoopbackOnly).toBe(true);
    const internalOrg = randomUUID();
    await fixture.owner`INSERT INTO public.orgs(id,name,type,status,activated_at,migration_review_required)
      VALUES(${internalOrg}::uuid,'Synthetic managed finance staff','internal','active',now(),false)`;
    for (const [index, actor] of fixture.pair.entries()) {
      await verifiedApiClaims(elevatedClient(actor), "aal2");
      await fixture.owner`INSERT INTO public.org_members(org_id,identity_id,user_id,role,role_key,migration_review_required)
        VALUES(${internalOrg}::uuid,${actor.identityId}::uuid,${actor.subjectId}::uuid,
          ${index === 1 ? "admin" : "contributor"},${index === 1 ? "organization_admin" : "contributor"},false)`;
      for (const permission of ["workspace.access", "finance.manage", "rfp.approve"])
        await grant(actor, internalOrg, permission);
    }
    await fixture.owner`SELECT mmhr_private.r1_assert_administration_capacity(clock_timestamp())`;
    await fixture.createPrivateDocumentBucket();
    await fixture.owner`SELECT mmhr_private.r4_install_document_storage_upload_policies()`;
    await fixture.owner`SELECT mmhr_private.r4_install_document_scan_read_policies()`;
    await fixture.owner`SELECT mmhr_private.r4_install_document_content_read_policies()`;

    async function grant(actor: SecurityApiPrincipal, org: string, permission: string, effect = "allow") {
      await fixture.owner`INSERT INTO public.user_permission_overrides(identity_id,permission_key,scope_kind,organization_id,scope_key,effect,issued_by_identity_id,issue_reason)
        VALUES(${actor.identityId}::uuid,${permission},'organization',${org}::uuid,${`organization:${org}`},${effect},
          ${fixture.pair[actor.identityId === fixture.pair[0].identityId ? 1 : 0].identityId}::uuid,'Synthetic managed finance scope')`;
    }
    const options = (index: 0 | 1) => ({ supabase: elevatedClient(fixture.pair[index]) as RequestSupabaseClient });
    const bytes = providedBytes ?? Buffer.from("%PDF-1.7\nSynthetic managed finance original\n%%EOF");
    const hash = createHash("sha256").update(bytes).digest("hex");

    async function createCase() {
      const organizationId = randomUUID(), adminMembershipId = randomUUID();
      await fixture.owner`INSERT INTO public.orgs(id,name,type,status,activated_at,migration_review_required)
        VALUES(${organizationId}::uuid,'Synthetic managed finance customer','customer','active',now(),false)`;
      await fixture.owner`INSERT INTO public.org_members(id,org_id,identity_id,user_id,role,role_key,migration_review_required)
        VALUES(${adminMembershipId}::uuid,${organizationId}::uuid,${fixture.organizationAdmin.identityId}::uuid,
          ${fixture.organizationAdmin.subjectId}::uuid,'admin','organization_admin',false)`;
      for (const [index, actor] of fixture.pair.entries())
        for (const permission of ["workspace.access", "finance.manage", "rfp.approve"])
          // The quote helper creates this exact second staff workspace grant.
          if (!(index === 1 && permission === "workspace.access")) await grant(actor, organizationId, permission);
      await fixture.owner`SELECT mmhr_private.r1_assert_administration_capacity(clock_timestamp())`;
      const scopedFixture = { ...fixture, organizationId, adminMembershipId };
      const portal = await seedSignedFinanceDocumentSourceWithPortal(scopedFixture);
      for (const actor of fixture.pair) {
        const allowed = await elevatedClient(actor).rpc("mmhr_authorize", { permission_key: "finance.manage", organization_id: organizationId });
        expect(allowed.error).toBeNull(); expect(allowed.data).toHaveLength(1);
      }
      return { ...portal, organizationId, internalOrg, agreementId: randomUUID() };
    }

    async function original(org: string, source: FinanceDocumentSource, previous?: ApprovedOriginal): Promise<ApprovedOriginal> {
      const request = { organizationId: org, source, documentId: previous?.documentId ?? randomUUID(), versionId: randomUUID(),
        expectedVersion: previous?.version ?? 0, fileName: "synthetic-managed.pdf", declaredMimeType: "application/pdf", ...commandMetadata() };
      const { reason: _reason, ...reservation } = request; void _reason;
      await reserveFinanceDocument(reservation, bytes, options(0));
      await createSupabaseDocumentStore(options(0).supabase).putQuarantined({ organizationId: reservation.organizationId,
        documentId: reservation.documentId, versionId: reservation.versionId, fileName: reservation.fileName,
        declaredMimeType: reservation.declaredMimeType, bytes });
      await completeFinanceDocumentUpload({ organizationId: org, documentId: request.documentId, versionId: request.versionId,
        expectedRevision: 1, correlationId: randomUUID(), idempotencyKey: randomUUID() }, options(0));
      // The existing helper retains its eight-minute lifetime. Each scan owns fresh credentials and cleanup.
      const worker = await fixture.createDocumentScanProcessor();
      try {
        const scan = await runDocumentScan(request.versionId, { repository: worker.repository,
          store: createSupabaseDocumentStore(worker.reader as RequestSupabaseClient),
          // Explicit scanner double verifies bytes/evidence/leases. It does not prove ClamAV engine safety.
          scanner: { async scan(input) { return { versionId: input.versionId, sha256: input.expectedSha256, state: "clean",
            scanner: "clamav", scannerVersion: "1.4.6", signatureVersion: 28139, signatureUpdatedAt: new Date().toISOString(),
            scannedAt: new Date().toISOString(), failureCode: null }; } } });
        expect(scan).toMatchObject({ outcome: "recorded", state: "ready" });
      } finally { await worker.close(); }
      const scope = { organizationId: org, documentId: request.documentId, versionId: request.versionId };
      await recordFinanceDocumentReview({ ...scope, expectedRevision: 4, action: "begin_review", reviewReference: "synthetic:content",
        ...commandMetadata() }, options(1));
      const access = await issueFinanceDocumentAccess({ ...scope, expectedRevision: 5, purpose: "finance_review",
        correlationId: randomUUID(), idempotencyKey: randomUUID() }, options(1));
      const downloaded = await downloadFinanceDocument({ organizationId: org, accessId: access.accessId, accessToken: access.accessToken,
        correlationId: randomUUID() }, options(1));
      expect(downloaded.bytes).toEqual(new Uint8Array(bytes));
      await recordFinanceDocumentReview({ ...scope, expectedRevision: 5, action: "approve", reviewedAccessId: access.accessId,
        contentsReviewed: true, reviewReference: "synthetic:original-approval", ...commandMetadata() }, options(1));
      return { ...scope, sha256: hash, version: request.expectedVersion + 1, source };
    }

    async function originalAccess(original: ApprovedOriginal, index: 0 | 1) {
      const [upload] = await fixture.owner<{ revision: number }[]>`SELECT revision FROM public.workflow_document_uploads
        WHERE organization_id=${original.organizationId}::uuid AND version_id=${original.versionId}::uuid`;
      if (!upload) throw new Error("Approved original missing");
      const grant = await issueFinanceDocumentAccess({ organizationId: original.organizationId, documentId: original.documentId,
        versionId: original.versionId, expectedRevision: upload.revision, purpose: "finance_original",
        correlationId: randomUUID(), idempotencyKey: randomUUID() }, options(index));
      const download = await downloadFinanceDocument({ organizationId: original.organizationId, accessId: grant.accessId,
        accessToken: grant.accessToken, correlationId: randomUUID() }, options(index));
      expect(download.bytes).toEqual(new Uint8Array(bytes)); expect(download.manifest.sha256).toBe(hash);
      return grant.accessId;
    }

    async function agreement(context: ManagedFinanceCase, source: ApprovedOriginal, rule: AgreementPreparation["rule"],
      changes: Partial<AgreementPreparation> = {}) {
      const request: AgreementPreparation = { organizationId: internalOrg, action: "prepare_agreement", agreementId: context.agreementId,
        versionId: randomUUID(), vendorOrganizationId: context.source.vendorOrganizationId, expectedSeriesRevision: 0,
        predecessorVersionId: null, source: reference(source), effectiveFrom: "2020-01-01T00:00:00Z", statedEffectiveEnd: null,
        replacementSourceReference: null, rule, conditionReferences: [], ...commandMetadata(), ...changes };
      const result = await executeManagedFinanceCommand(request, options(0));
      expect(result).toMatchObject({ outcomeCode: "recorded", entityId: request.versionId, revision: 1 });
      return request;
    }
    async function facts(context: ManagedFinanceCase, source: ApprovedOriginal,
      contractValue: FactsPreparation["contractValue"], changes: Partial<FactsPreparation> = {}) {
      const request: FactsPreparation = { organizationId: context.organizationId, action: "prepare_contract_facts",
        contractId: context.source.contractId, handoffId: context.source.handoffId, versionId: randomUUID(), expectedFactsRevision: 0,
        predecessorVersionId: null, source: reference(source), contractValue, sourceReference: "synthetic:actual-contract-facts",
        ...commandMetadata(), ...changes };
      await executeManagedFinanceCommand(request, options(0)); return request;
    }
    async function sourceDecision(request: AgreementPreparation | FactsPreparation, source: ApprovedOriginal,
      approve: boolean, index: 0 | 1 = 1) {
      const [row] = await fixture.owner<{ source_digest: string }[]>`SELECT source_digest FROM (
        SELECT id,source_digest FROM public.finance_agreement_versions UNION ALL SELECT id,source_digest FROM public.finance_contract_facts_versions
      ) versions WHERE id=${request.versionId}::uuid`;
      if (!row) throw new Error("Prepared source missing");
      const decision = { organizationId: request.organizationId, versionId: request.versionId, expectedRevision: 1,
        expectedSourceDigest: row.source_digest, reviewedAccessId: await originalAccess(source, index), contentsReviewed: true as const,
        reviewReference: "synthetic:independent-commercial-review", ...commandMetadata(),
        ...(request.action === "prepare_agreement" ? { action: approve ? "approve_agreement" as const : "reject_agreement" as const,
          agreementId: request.agreementId, expectedSeriesRevision: request.expectedSeriesRevision, predecessorVersionId: request.predecessorVersionId }
          : { action: approve ? "approve_contract_facts" as const : "reject_contract_facts" as const, contractId: request.contractId,
            expectedFactsRevision: request.expectedFactsRevision, predecessorVersionId: request.predecessorVersionId }) };
      return { request: decision, result: await executeManagedFinanceCommand(decision, options(index)) };
    }
    async function pendingCalculation(context: ManagedFinanceCase) {
      const agreementOriginal = await original(internalOrg, { sourceClass: "agreement", vendorOrganizationId: context.source.vendorOrganizationId });
      await sourceDecision(await agreement(context, agreementOriginal, { kind: "flat_amount", amountMinorUnits: 100, currency: "USD" }), agreementOriginal, true);
      const contractOriginal = await original(context.organizationId, context.source);
      await sourceDecision(await facts(context, contractOriginal, { amountMinorUnits: null, currency: null }), contractOriginal, true);
      const eligibility = { organizationId: context.organizationId, action: "resolve_eligibility" as const, contractId: context.source.contractId,
        handoffId: context.source.handoffId, ...commandMetadata() };
      const event = await executeManagedFinanceCommand(eligibility, options(0));
      const detail = await getManagedFinanceDetail({ organizationId: context.organizationId, entityId: context.source.contractId,
        view: "contract", correlationId: randomUUID() }, options(0));
      if (detail.view !== "contract" || !detail.contract.currentSourceDigest) throw new Error("Calculation source missing");
      const request = { organizationId: context.organizationId, action: "prepare_calculation" as const, commissionEventId: event.entityId,
        calculationId: randomUUID(), expectedEventRevision: 1, expectedSourceDigest: detail.contract.currentSourceDigest, ...commandMetadata() };
      await executeManagedFinanceCommand(request, options(0));
      return { context, contractOriginal, agreementOriginal, request, eligibility, calculationId: request.calculationId,
        commissionEventId: event.entityId, organizationId: context.organizationId, sourceDigest: request.expectedSourceDigest, eventRevision: 1 };
    }
    return { fixture, internalOrg, options, grant, createCase, original, originalAccess, agreement, facts, sourceDecision, pendingCalculation,
      async close() { await fixture.close(); } };
  } catch (error) { await fixture.close(); throw error; }
}

export function reference(source: ApprovedOriginal) {
  return { organizationId: source.organizationId, documentId: source.documentId, versionId: source.versionId, sha256: source.sha256 };
}
export async function financeSnapshot(fixture: SecurityCommandApiFixtures) {
  const [row] = await fixture.owner`SELECT jsonb_build_object(
    'series',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]') FROM public.finance_agreement_series x),
    'agreements',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]') FROM public.finance_agreement_versions x),
    'applicability',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]') FROM public.finance_agreement_applicability x),
    'facts',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]') FROM public.finance_contract_facts_versions x),
    'events',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]') FROM public.commission_events x),
    'sources',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.commission_event_id),'[]') FROM public.managed_commission_sources x),
    'calculations',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]') FROM public.managed_commission_calculations x),
    'history',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]') FROM public.managed_finance_events x),
    'eventHistory',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]') FROM public.commission_event_history x),
    'structures',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]') FROM public.commission_structures x),
    'receipts',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]') FROM public.security_command_receipts x),
    'audits',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]') FROM public.audit_events x)) proof`;
  return row!.proof as Record<string, unknown>;
}
