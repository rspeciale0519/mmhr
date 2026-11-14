import { randomUUID } from "node:crypto";
import { expect, test } from "vitest";
import { getFinanceDocumentSources } from "@/server/commands/finance-document-sources";
import { AuthorizationError, type RequestSupabaseClient } from "@/server/auth/authorization";
import { elevatedClient, type SecurityApiPrincipal, type SecurityCommandApiFixtures } from "@/server/auth/security-command-api-fixtures";
import type { FinanceDocumentSource } from "@/lib/finance-document-upload";

type Context = {
  fixture: SecurityCommandApiFixtures;
  internalOrganizationId: string;
  agreementVendorOrganizationId: string;
  unrelatedStaff: SecurityApiPrincipal;
  signedSource: Extract<FinanceDocumentSource, { sourceClass: "signed_contract" }>;
  approvedAgreementOriginal(): Promise<{ documentId: string; versionId: string }>;
  approvedSignedOriginal(): Promise<{ documentId: string; versionId: string }>;
};

/** Register under the existing guarded fixture; no service starts here. */
export function registerFinanceDocumentSourceRegressions(getContext: () => Context) {
  const staff = (context: Context) => ({ supabase: elevatedClient(context.fixture.pair[0]) as RequestSupabaseClient });

  test("returns only actual stored signed customer sources and active internal vendor choices", async () => {
    const context = getContext();
    const customer = await getFinanceDocumentSources({ organizationId: context.fixture.organizationId,
      correlationId: randomUUID() }, staff(context));
    expect(customer.workspaceType).toBe("customer");
    expect(customer.documentBinding).toBeNull();
    expect(customer.choices).toContainEqual(expect.objectContaining({ choiceId: context.signedSource.handoffId,
      source: context.signedSource }));
    expect(customer.choices.every(item => item.source.sourceClass === "signed_contract")).toBe(true);
    const internal = await getFinanceDocumentSources({ organizationId: context.internalOrganizationId,
      correlationId: randomUUID() }, staff(context));
    expect(internal.workspaceType).toBe("internal");
    expect(internal.choices).toContainEqual(expect.objectContaining({ choiceId: context.agreementVendorOrganizationId,
      source: { sourceClass: "agreement", vendorOrganizationId: context.agreementVendorOrganizationId } }));
    expect(internal.choices.every(item => item.source.sourceClass === "agreement")).toBe(true);
  }, 60_000);

  test("denies scoped staff source reads and foreign or missing document bindings", async () => {
    const context = getContext(), original = await context.approvedAgreementOriginal();
    const internal = { organizationId: context.internalOrganizationId, correlationId: randomUUID() };
    const deniedOptions = { supabase: elevatedClient(context.unrelatedStaff) as RequestSupabaseClient };
    await expect(getFinanceDocumentSources(internal, deniedOptions)).rejects.toBeInstanceOf(AuthorizationError);
    const denied = await deniedOptions.supabase.rpc("mmhr_get_finance_document_sources", {
      payload: { organizationId: internal.organizationId }, correlation_id: internal.correlationId });
    expect(denied.data).toBeNull();
    expect(denied.error).toMatchObject({ code: "42501", message: "Finance source read denied" });
    for (const input of [{ organizationId: context.fixture.organizationId, documentId: original.documentId },
      { organizationId: context.internalOrganizationId, documentId: randomUUID() }]) {
      await expect(getFinanceDocumentSources({ ...input, correlationId: randomUUID() }, staff(context)))
        .rejects.toBeInstanceOf(AuthorizationError);
      const direct = await staff(context).supabase.rpc("mmhr_get_finance_document_sources", { payload: input,
        correlation_id: randomUUID() });
      expect(direct.data).toBeNull();
      expect(direct.error).toMatchObject({ code: "42501", message: "Finance source read denied" });
    }
    const own = await getFinanceDocumentSources({ ...internal, documentId: original.documentId }, staff(context));
    expect(own.documentBinding).toMatchObject({ documentId: original.documentId,
      source: { sourceClass: "agreement", vendorOrganizationId: context.agreementVendorOrganizationId } });
  }, 120_000);

  test("excludes suspended vendors from new choices and keeps exact retained original bindings", async () => {
    const context = getContext();
    for (const [organizationId, source, original] of [
      [context.internalOrganizationId, { sourceClass: "agreement", vendorOrganizationId: context.agreementVendorOrganizationId },
        await context.approvedAgreementOriginal()],
      [context.fixture.organizationId, context.signedSource, await context.approvedSignedOriginal()],
    ] as const) {
      await context.fixture.owner`UPDATE public.orgs SET status='suspended',suspended_at=clock_timestamp()
        WHERE id=${source.vendorOrganizationId}::uuid`;
      try {
        const page = await getFinanceDocumentSources({ organizationId,
          documentId: original.documentId, correlationId: randomUUID() }, staff(context));
        expect(page.choices.some(item => item.source.vendorOrganizationId === source.vendorOrganizationId)).toBe(false);
        expect(page.documentBinding).toMatchObject({ documentId: original.documentId, source });
        const [binding] = await context.fixture.owner`SELECT source_snapshot FROM public.finance_document_sources WHERE version_id=${original.versionId}::uuid`;
        expect(binding?.source_snapshot).toEqual(page.documentBinding?.source);
      } finally {
        await context.fixture.owner`UPDATE public.orgs SET status='active',suspended_at=NULL WHERE id=${source.vendorOrganizationId}::uuid`;
      }
    }
  }, 120_000);

  test("pages eligible source choices before the limit without duplicate or missing vendor rows", async () => {
    const context = getContext();
    expect(context.fixture.isolation.apiLoopbackOnly).toBe(true);
    const activeIds = Array.from({ length: 27 }, (_, index) => `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`);
    await context.fixture.owner`INSERT INTO public.orgs(id,name,type,status,activated_at,suspended_at,migration_review_required)
      SELECT ('10000000-0000-4000-8000-'||lpad(series::text,12,'0'))::uuid,'Synthetic paged finance vendor','vendor',
        'active',clock_timestamp(),NULL,false FROM generate_series(1,27) series`;
    await context.fixture.owner`INSERT INTO public.orgs(id,name,type,status,activated_at,suspended_at,migration_review_required)
      SELECT ('00000000-0000-4000-8000-'||lpad(series::text,12,'0'))::uuid,'Synthetic unavailable finance vendor','vendor',
        'suspended',clock_timestamp(),clock_timestamp(),false FROM generate_series(1,30) series`;
    await context.fixture.owner`INSERT INTO public.org_members(org_id,identity_id,user_id,role,role_key,migration_review_required)
      SELECT ('10000000-0000-4000-8000-'||lpad(series::text,12,'0'))::uuid,
        ${context.fixture.pair[1].identityId}::uuid,${context.fixture.pair[1].subjectId}::uuid,'admin','organization_admin',false
      FROM generate_series(1,27) series`;
    await context.fixture.owner`INSERT INTO public.user_permission_overrides(identity_id,permission_key,scope_kind,organization_id,scope_key,effect,issued_by_identity_id,issue_reason)
      SELECT ${context.fixture.pair[1].identityId}::uuid,'workspace.access','organization',
        ('10000000-0000-4000-8000-'||lpad(series::text,12,'0'))::uuid,
        'organization:10000000-0000-4000-8000-'||lpad(series::text,12,'0'),'allow',
        ${context.fixture.pair[0].identityId}::uuid,'Synthetic paged vendor administrator scope'
      FROM generate_series(1,27) series`;
    await context.fixture.owner`SELECT mmhr_private.r1_assert_administration_capacity(clock_timestamp())`;
    const collected: string[] = [];
    let afterId: string | undefined;
    for (let pageNumber = 0; pageNumber < 10; pageNumber++) {
      const page = await getFinanceDocumentSources({ organizationId: context.internalOrganizationId,
        ...(afterId ? { afterId } : {}), correlationId: randomUUID() }, staff(context));
      if (pageNumber === 0) expect(page.choices).toHaveLength(25);
      for (const choice of page.choices) {
        expect(choice.choiceId).not.toMatch(/^00000000-0000-4000-8000-/);
        expect(collected.at(-1) === undefined || choice.choiceId > collected.at(-1)!).toBe(true);
        collected.push(choice.choiceId);
      }
      if (page.nextCursor === null) break;
      expect(page.choices).toHaveLength(25);
      expect(page.nextCursor).toBe(collected.at(-1));
      expect(pageNumber).toBeLessThan(9);
      afterId = page.nextCursor;
    }
    expect(new Set(collected).size).toBe(collected.length);
    expect(activeIds.every(id => collected.includes(id))).toBe(true);
  }, 60_000);
}
