import { randomUUID } from "node:crypto";
import { expect, test } from "vitest";
import { elevatedClient, type SecurityApiPrincipal, type SecurityCommandApiFixtures } from "@/server/auth/security-command-api-fixtures";
import { demoOutcomeSchema, demoPlanSchema } from "@/lib/demo-planning";

type PortalContext = {
  fixture: SecurityCommandApiFixtures;
  customer: SecurityApiPrincipal;
  vendor: SecurityApiPrincipal;
  vendorOrganizationId: string;
  candidateId: string;
  recipientId: string;
  approvedFinanceOriginal(): Promise<{ versionId: string }>;
  approvedWorkspaceOriginal(): Promise<{ versionId: string }>;
};

/** Register inside the guarded finance Auth suite. This helper starts no services. */
export function registerFinanceDemoEvidenceRegressions(getContext: () => PortalContext) {
  const plan = demoPlanSchema.parse({ round: 1, audience: "Synthetic customer staff",
    purpose: "Verify ordinary demo evidence privacy", format: "remote",
    participants: [{ name: "Synthetic customer", role: "Owner", organization: "customer" }],
    requiredTopics: ["Synthetic payroll export"] });

  async function prepareEarlierMeeting(context: PortalContext) {
    const { fixture } = context;
    expect(fixture.isolation.apiLoopbackOnly).toBe(true);
    const created = await elevatedClient(fixture.pair[0]).rpc("mmhr_record_demo_coordination", {
      payload: { action: "create", organizationId: fixture.organizationId, candidateId: context.candidateId,
        recipientId: context.recipientId, plan }, correlation_id: randomUUID(), idempotency_key: randomUUID(),
    });
    expect(created.error).toBeNull();
    expect(created.data).toMatchObject({ status: "requested", revision: 1, outcomeCode: "recorded" });
    const earlierId = randomUUID(), start = new Date(Date.now() - 7_200_000).toISOString();
    const end = new Date(Date.now() - 3_600_000).toISOString();
    const availability = { timeZone: "UTC", windows: [{ startAt: start, endAt: end }], note: null };
    const state = { plan, customerAvailability: availability, vendorAvailability: availability,
      schedule: { window: { startAt: start, endAt: end }, timeZone: "UTC", location: "Synthetic private meeting",
        reminderAt: new Date(Date.now() - 10_800_000).toISOString(), confirmationNote: "Synthetic prior meeting" },
      outcome: null, reason: "Earlier synthetic meeting fixture" };
    // Match the existing0144 rehearsal pattern. Keep the public command's real clock checks.
    await fixture.owner`INSERT INTO public.demo_rounds(id,organization_id,deal_id,customer_organization_id,vendor_organization_id,
      requested_by_identity_id,requested_at,status,revision,portal_recipient_id,coordination,scheduled_start_at,scheduled_end_at,
      meeting_reference,correlation_id)
      SELECT ${earlierId}::uuid,organization_id,deal_id,customer_organization_id,vendor_organization_id,requested_by_identity_id,
        now()-interval '1 day','scheduled',1,portal_recipient_id,${JSON.stringify(state)}::jsonb,${start}::timestamptz,${end}::timestamptz,
        ${`demo:${earlierId}`},${randomUUID()}::uuid FROM public.demo_rounds WHERE id=${created.data.demoId}::uuid`;
    await fixture.owner`INSERT INTO public.demo_coordination_events(organization_id,demo_id,revision,action,actor_identity_id,snapshot,correlation_id)
      VALUES(${fixture.organizationId}::uuid,${earlierId}::uuid,1,'confirm',${fixture.pair[0].identityId}::uuid,
        ${JSON.stringify({ status: "scheduled", coordination: state })}::jsonb,${randomUUID()}::uuid)`;
    return earlierId;
  }

  async function snapshot(context: PortalContext) {
    const [row] = await context.fixture.owner`SELECT jsonb_build_object(
      'demos',(SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY id),'[]'::jsonb) FROM public.demo_rounds d),
      'history',(SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY id),'[]'::jsonb) FROM public.demo_coordination_events e),
      'receipts',(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY id),'[]'::jsonb) FROM public.security_command_receipts r),
      'audits',(SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY id),'[]'::jsonb) FROM public.audit_events a)) state`;
    return row!.state;
  }

  function outcome(versionId: string) {
    return demoOutcomeSchema.parse({ attendance: [{ name: plan.participants[0]!.name, attended: true }],
      feedback: "Synthetic ordinary demo evidence review", score: 4, commitments: [], requestedChanges: [],
      nextAction: "Review synthetic demo results", nextActionAt: new Date(Date.now() + 86_400_000).toISOString(),
      evidenceVersionIds: [versionId] });
  }

  async function portalHistory(context: PortalContext, demoId: string, view: "customer" | "vendor") {
    const client = view === "customer" ? context.customer.aal1 : context.vendor.aal1;
    const organizationId = view === "customer" ? context.fixture.organizationId : context.vendorOrganizationId;
    const read = await client.rpc("mmhr_get_demo_coordination_history", { payload: {
      organizationId, view, demoId, afterRevision: 0 }, correlation_id: randomUUID() });
    expect(read.error).toBeNull();
    return read.data as { items: { revision: number; coordination: { outcome: null | { evidenceVersionIds: string[] } } }[] };
  }

  test.each(["complete", "no_show"] as const)(
    "denies an approved finance original in %s without changing demo or evidence history", async action => {
      const context = getContext(), original = await context.approvedFinanceOriginal();
      const [source] = await context.fixture.owner`SELECT u.source_kind,u.state,v.state version_state,v.scan_state,
        v.organization_id,d.state document_state,f.source_class,a.sha256
        FROM public.workflow_document_uploads u JOIN public.workflow_document_versions v ON v.id=u.version_id
        JOIN public.workflow_documents d ON d.id=v.document_id AND d.organization_id=v.organization_id
        JOIN public.finance_document_sources f ON f.version_id=u.version_id
        JOIN public.finance_document_approvals a ON a.version_id=u.version_id WHERE u.version_id=${original.versionId}::uuid`;
      expect(source).toMatchObject({ source_kind: "finance", source_class: "signed_contract", state: "approved",
        version_state: "approved", scan_state: "clean", document_state: "active", organization_id: context.fixture.organizationId });
      expect(source?.sha256).toMatch(/^[0-9a-f]{64}$/);
      const demoId = await prepareEarlierMeeting(context), before = await snapshot(context);
      const rejected = await elevatedClient(context.fixture.pair[0]).rpc("mmhr_record_demo_coordination", {
        payload: { action, organizationId: context.fixture.organizationId, demoId, expectedRevision: 1,
          outcome: outcome(original.versionId), reason: "Synthetic finance association denial" },
        correlation_id: randomUUID(), idempotency_key: randomUUID(),
      });
      expect(rejected.data).toBeNull();
      expect(rejected.error).toMatchObject({ code: "42501", message: "Demo outcome evidence or next action denied" });
      expect(await snapshot(context)).toEqual(before);
      for (const view of ["customer", "vendor"] as const) {
        const history = await portalHistory(context, demoId, view);
        expect(history.items).toHaveLength(1);
        expect(history.items[0]?.coordination.outcome).toBeNull();
        expect(JSON.stringify(history)).not.toContain(original.versionId);
      }
      expect(await snapshot(context)).toEqual(before);
    }, 120_000);

  test.each(["complete", "no_show"] as const)(
    "preserves approved ordinary workspace evidence in %s", async action => {
      const context = getContext(), original = await context.approvedWorkspaceOriginal();
      const [source] = await context.fixture.owner`SELECT u.source_kind,u.state,v.state version_state,v.scan_state,
        v.organization_id,d.state document_state
        FROM public.workflow_document_uploads u JOIN public.workflow_document_versions v ON v.id=u.version_id
        JOIN public.workflow_documents d ON d.id=v.document_id AND d.organization_id=v.organization_id
        WHERE u.version_id=${original.versionId}::uuid`;
      expect(source).toMatchObject({ source_kind: "workspace", state: "approved", version_state: "approved", scan_state: "clean",
        document_state: "active", organization_id: context.fixture.organizationId });
      const demoId = await prepareEarlierMeeting(context);
      const payload = { action, organizationId: context.fixture.organizationId, demoId, expectedRevision: 1,
        outcome: outcome(original.versionId), reason: "Synthetic ordinary evidence compatibility" };
      const metadata = { correlation_id: randomUUID(), idempotency_key: randomUUID() };
      const client = elevatedClient(context.fixture.pair[0]);
      const saved = await client.rpc("mmhr_record_demo_coordination", { payload, ...metadata });
      expect(saved.error).toBeNull();
      expect(saved.data).toMatchObject({ status: action === "complete" ? "completed" : "no_show", revision: 2, outcomeCode: "recorded" });
      const beforeReplay = await snapshot(context);
      const replay = await client.rpc("mmhr_record_demo_coordination", { payload, ...metadata });
      expect(replay.error).toBeNull(); expect(replay.data).toMatchObject({ outcomeCode: "replayed", revision: 2 });
      expect(await snapshot(context)).toEqual(beforeReplay);
      for (const view of ["customer", "vendor"] as const) {
        const history = await portalHistory(context, demoId, view);
        expect(history.items).toHaveLength(2);
        expect(history.items[1]?.coordination.outcome?.evidenceVersionIds).toEqual([original.versionId]);
      }
    }, 120_000);
}
