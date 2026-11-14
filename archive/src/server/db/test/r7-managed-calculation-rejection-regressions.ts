import { randomUUID } from "node:crypto";
import { expect, test } from "vitest";
import { elevatedClient, verifiedApiClaims, type SecurityCommandApiFixtures } from "@/server/auth/security-command-api-fixtures";

type PreparedCalculation = { calculationId: string; commissionEventId: string; organizationId: string; sourceDigest: string; eventRevision: number };
type Context = {
  fixture: SecurityCommandApiFixtures;
  preparePendingCalculation(): Promise<PreparedCalculation>;
  replacePreparedOriginal(calculation: PreparedCalculation): Promise<void>;
};

/** Guard regression registration. The caller must provide actual source setup;
 * no commercial state, source approval, fixture, or public API is fabricated here. */
export function registerManagedCalculationRejectionRegressions(getContext: () => Context) {
  async function currentClaims(context: Context) {
    const client=elevatedClient(context.fixture.pair[1]);
    await verifiedApiClaims(client,"aal2");
    const verified=await client.auth.getClaims();
    if(verified.error||!verified.data?.claims)throw new Error("Genuine signed claims missing");
    return verified.data.claims;
  }
  async function snapshot(context: Context, prepared: PreparedCalculation) {
    const [proof] = await context.fixture.owner`SELECT jsonb_build_object(
      'event',(SELECT to_jsonb(e) FROM public.commission_events e WHERE e.id=${prepared.commissionEventId}::uuid),
      'calculations',(SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.id),'[]'::jsonb) FROM public.managed_commission_calculations c),
      'history',(SELECT coalesce(jsonb_agg(to_jsonb(h) ORDER BY h.id),'[]'::jsonb) FROM public.managed_finance_events h),
      'receipts',(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.id),'[]'::jsonb) FROM public.security_command_receipts r),
      'audits',(SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.id),'[]'::jsonb) FROM public.audit_events a)) proof`;
    return proof!.proof as { event: Record<string, unknown> };
  }

  test("rejects a stale calculation after source replacement without changing the canonical event", async () => {
    const context = getContext();
    expect(context.fixture.isolation.apiLoopbackOnly).toBe(true);
    const prepared = await context.preparePendingCalculation();
    await context.replacePreparedOriginal(prepared);
    const claims = await currentClaims(context);
    const before = await snapshot(context, prepared), correlationId = randomUUID(), idempotencyKey = randomUUID();
    await context.fixture.owner.begin(async sql => {
      await sql`SELECT set_config('request.jwt.claims',${JSON.stringify(claims)},true)`;
      const [authority] = await sql`SELECT mmhr_private.r7_finance_document_actor(${prepared.organizationId}::uuid) actor`;
      expect(authority?.actor).toBe(context.fixture.pair[1].identityId);
      const [current] = await sql`SELECT c.state,c.revision,c.prepared_by_identity_id,
        mmhr_private.r7_managed_digest(mmhr_private.r7_managed_calculation_observation(c.commission_event_id,c.facts_version_id)) observed_digest
        FROM public.managed_commission_calculations c WHERE c.id=${prepared.calculationId}::uuid`;
      expect(current).toMatchObject({ state: "pending", revision: 1 });
      expect(current?.prepared_by_identity_id).not.toBe(context.fixture.pair[1].identityId);
      expect(current?.observed_digest).not.toBe(prepared.sourceDigest);
      const request = { organizationId: prepared.organizationId, action: "reject_calculation",
        commissionEventId: prepared.commissionEventId, calculationId: prepared.calculationId,
        expectedEventRevision: prepared.eventRevision, expectedCalculationRevision: 1,
        expectedSourceDigest: prepared.sourceDigest, reason: "Reject a stale synthetic calculation", reviewReference: "synthetic:source-replaced" };
      const [receipt] = await sql`SELECT mmhr_private.r1_finish_security_command(${context.fixture.pair[1].identityId}::uuid,
        'r7.finance.managed.reject_calculation','finance.reject_calculation','managed_commission_calculation',${prepared.calculationId}::uuid,
        ${prepared.organizationId}::uuid,${request.reason},${correlationId}::uuid,${idempotencyKey}::uuid,${JSON.stringify(request)}::jsonb,
        jsonb_build_object('status','completed'),jsonb_build_object('status','completed'),clock_timestamp()) result`;
      const receiptId = (receipt!.result as { receipt_id: string }).receipt_id;
      const [receiptTime] = await sql`SELECT created_at::text exact_time FROM public.security_command_receipts WHERE id=${receiptId}::uuid`;
      const commandTime = receiptTime!.exact_time as string;
      await sql`UPDATE public.managed_commission_calculations SET state='rejected',revision=2,
        decided_by_identity_id=${context.fixture.pair[1].identityId}::uuid,decided_at=${commandTime}::timestamptz,decision_reason=${request.reason},
        review_reference=${request.reviewReference},decision_receipt_id=${receiptId}::uuid,decision_request=${JSON.stringify(request)}::jsonb,
        decision_request_digest=mmhr_private.r7_managed_digest(${JSON.stringify(request)}::jsonb),decision_correlation_id=${correlationId}::uuid
        WHERE id=${prepared.calculationId}::uuid`;
      await sql`INSERT INTO public.managed_finance_events(organization_id,entity_type,entity_id,revision,action,actor_identity_id,
        receipt_id,correlation_id,snapshot,occurred_at) SELECT organization_id,'managed_commission_calculation',id,revision,'reject_calculation',
        decided_by_identity_id,decision_receipt_id,decision_correlation_id,to_jsonb(c),decided_at FROM public.managed_commission_calculations c
        WHERE c.id=${prepared.calculationId}::uuid`;
      await sql`SET CONSTRAINTS ALL IMMEDIATE`;
    });
    expect((await snapshot(context, prepared)).event).toEqual(before.event);
    const [saved] = await context.fixture.owner`SELECT state,revision,source_digest FROM public.managed_commission_calculations
      WHERE id=${prepared.calculationId}::uuid`;
    expect(saved).toMatchObject({ state: "rejected", revision: 2, source_digest: prepared.sourceDigest });
  }, 120_000);

  test("rejects a forged owner decision with no receipt or history and retains every row", async () => {
    const context = getContext(), prepared = await context.preparePendingCalculation();
    expect(context.fixture.isolation.apiLoopbackOnly).toBe(true);
    const before = await snapshot(context, prepared), claims = await currentClaims(context);
    const request = { organizationId: prepared.organizationId, action: "reject_calculation",
      commissionEventId: prepared.commissionEventId, calculationId: prepared.calculationId, expectedEventRevision: prepared.eventRevision,
      expectedCalculationRevision: 1, expectedSourceDigest: prepared.sourceDigest, reason: "Forged synthetic decision",
      reviewReference: "synthetic:missing-receipt" };
    await expect(context.fixture.owner.begin(async sql => {
      await sql`SELECT set_config('request.jwt.claims',${JSON.stringify(claims)},true)`;
      const [authority] = await sql`SELECT mmhr_private.r7_finance_document_actor(${prepared.organizationId}::uuid) actor`;
      expect(authority?.actor).toBe(context.fixture.pair[1].identityId);
      await sql`UPDATE public.managed_commission_calculations SET state='rejected',revision=2,
        decided_by_identity_id=${context.fixture.pair[1].identityId}::uuid,decided_at=clock_timestamp(),decision_reason=${request.reason},
        review_reference=${request.reviewReference},decision_receipt_id=prepare_receipt_id,
        decision_request=${JSON.stringify(request)}::jsonb,decision_request_digest=mmhr_private.r7_managed_digest(${JSON.stringify(request)}::jsonb),
        decision_correlation_id=${randomUUID()}::uuid WHERE id=${prepared.calculationId}::uuid`;
      await sql`SET CONSTRAINTS ALL IMMEDIATE`;
    })).rejects.toMatchObject({ code: "42501", message: "Managed calculation receipt or history denied" });
    expect(await snapshot(context, prepared)).toEqual(before);
  }, 120_000);
}
