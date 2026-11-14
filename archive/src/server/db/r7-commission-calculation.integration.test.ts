import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { applyAllMigrations, applyMigrationsBeforeFinanceCalculation, startRehearsal, stopRehearsal, type RehearsalContext } from './r1-migration-rehearsal';
import { asAuthenticated, createCommandFixture, createMembership, rollbackCase, type SecurityCommandFixture } from './r1-security-command-fixtures';

describe('registered finance calculation and receipt correction', () => {
  let context: RehearsalContext | undefined;
  let fixture: SecurityCommandFixture, vendorId: string, dealId: string;
  let beforeProperties: Record<string, unknown>;
  let historicalEvent: Record<string, unknown>;
  beforeAll(async () => {
    context = await startRehearsal('r7-rounding');
    await applyMigrationsBeforeFinanceCalculation(context);
    [beforeProperties] = await context.client`SELECT oid,proacl::text AS permissions,prosecdef,proconfig
      FROM pg_proc WHERE oid='public.mmhr_record_commission(jsonb,uuid,uuid)'::regprocedure`;
    fixture = await context.client.begin(async sql => {
      const fixture = await createCommandFixture(sql);
      const [vendor] = await sql<{id:string}[]>`INSERT INTO public.orgs(name,type,status,activated_at,migration_review_required)
        VALUES('Synthetic rounding vendor','vendor','active',now(),false) RETURNING id`;
      vendorId = vendor!.id;
      await createMembership(sql,vendorId,fixture.organizationAdmin,'organization_admin');
      const [deal] = await sql<{id:string}[]>`INSERT INTO public.deals(organization_id,vendor_organization_id,owner_identity_id,stage,status)
        VALUES(${fixture.organizationId}::uuid,${vendorId}::uuid,${fixture.pair[0].identityId}::uuid,'won','won') RETURNING id`;
      dealId = deal!.id;
      return fixture;
    });
    await context.client.begin(async sql => {
      const base = () => ({ organizationId: fixture.organizationId, actorIdentityId: fixture.pair[0].identityId,
        correlationId: randomUUID(), idempotencyKey: randomUUID() });
      const structureId = randomUUID();
      const structure = { ...base(), action: 'create_structure', structureId, vendorOrganizationId: vendorId,
        effectiveFrom: new Date(Date.now() - 86400000).toISOString(), effectiveTo: null, calculationType: 'contract_value_rate',
        rateBasisPoints: 500, flatAmountMinorUnits: null, currency: 'USD', sourceAgreementId: randomUUID(), revision: 1 };
      historicalEvent = { ...base(), action: 'create_event', eventId: randomUUID(), contractId: randomUUID(), dealId,
        vendorOrganizationId: vendorId, structureId, eventIdempotencyKey: randomUUID(), signedAt: new Date().toISOString(),
        currency: 'USD', contractValueMinorUnits: 10, commissionAmountMinorUnits: 0, calculationRevision: 1 };
      for (const payload of [structure, historicalEvent]) {
        await asAuthenticated(sql, fixture.pair[0], probe => probe`SELECT public.mmhr_record_commission(
          ${JSON.stringify(payload)}::jsonb, ${String(payload.correlationId)}::uuid, ${String(payload.idempotencyKey)}::uuid)`);
      }
    });
    await applyAllMigrations(context);
  },240000);
  afterAll(async () => {if(context) await stopRehearsal(context)},180000);
  test('preserves historical amounts and completes their original creation retry receipt', async () => {
    const [stored] = await context!.client`SELECT commission_amount_minor_units::text AS amount
      FROM public.commission_events WHERE id=${String(historicalEvent.eventId)}::uuid`;
    expect(stored!.amount).toBe('0');
    await context!.client.begin(async sql => {
      const [receipt] = await asAuthenticated(sql, fixture.pair[0], probe => probe`SELECT public.mmhr_record_commission(
        ${JSON.stringify(historicalEvent)}::jsonb, ${String(historicalEvent.correlationId)}::uuid,
        ${String(historicalEvent.idempotencyKey)}::uuid) AS result`);
      expect(receipt!.result).toMatchObject({ entityId: historicalEvent.eventId, status: 'pending_review', outcomeCode: 'replayed' });
    });
  }, 120000);
  test.each([[500,9,0],[500,10,1],[500,11,1],[1250,12,2],[10000,Number.MAX_SAFE_INTEGER,Number.MAX_SAFE_INTEGER]])(
    'rounds rate %i on value %i to %i through the actual commission RPC',async(rate,value,amount) => {
      await rollbackCase(context!,async sql => {
        const base = () => ({organizationId:fixture.organizationId,actorIdentityId:fixture.pair[0].identityId,
          correlationId:randomUUID(),idempotencyKey:randomUUID()});
        const invoke = (payload:Record<string,unknown>) => asAuthenticated(sql,fixture.pair[0],async probe => {
          const [row] = await probe<{result:Record<string,unknown>}[]>`SELECT public.mmhr_record_commission(${JSON.stringify(payload)}::jsonb,
            ${String(payload.correlationId)}::uuid,${String(payload.idempotencyKey)}::uuid) AS result`;
          return row!.result;
        });
        const structureId = randomUUID();
        const structure={...base(),action:'create_structure',structureId,vendorOrganizationId:vendorId,
          effectiveFrom:new Date(Date.now()-86400000).toISOString(),effectiveTo:null,calculationType:'contract_value_rate',
          rateBasisPoints:rate,flatAmountMinorUnits:null,currency:'USD',sourceAgreementId:randomUUID(),revision:1};
        await expect(invoke(structure)).resolves.toMatchObject({status:'active',outcomeCode:'recorded'});
        await expect(invoke(structure)).resolves.toMatchObject({status:'active',outcomeCode:'replayed'});
        const payload = {...base(),action:'create_event',eventId:randomUUID(),contractId:randomUUID(),dealId,
          vendorOrganizationId:vendorId,structureId,eventIdempotencyKey:randomUUID(),signedAt:new Date().toISOString(),currency:'USD',
          contractValueMinorUnits:value,commissionAmountMinorUnits:amount,calculationRevision:1};
        await expect(invoke(payload)).resolves.toMatchObject({status:'pending_review',outcomeCode:'recorded'});
        await expect(invoke(payload)).resolves.toMatchObject({status:'pending_review',outcomeCode:'replayed'});
        const [stored] = await sql`SELECT commission_amount_minor_units::text AS amount FROM public.commission_events WHERE id=${payload.eventId}::uuid`;
        expect(stored!.amount).toBe(String(amount));
      });
    },120000);
  test('preserves function identity, ownership mode, privileges, and safe search path',async() => {
    const [properties] = await context!.client`SELECT oid,proacl::text AS permissions,prosecdef,proconfig
      FROM pg_proc WHERE oid='public.mmhr_record_commission(jsonb,uuid,uuid)'::regprocedure`;
    expect(properties).toEqual(beforeProperties);
  });
  test('keeps external and low-assurance finance requests denied',async() => {
    for (const principal of [fixture.organizationAdmin,fixture.target]) {
      await rollbackCase(context!,async sql => {
        await expect(asAuthenticated(sql,principal,probe=>probe`SELECT public.mmhr_record_commission(
          ${JSON.stringify({action:'create_structure',organizationId:fixture.organizationId,actorIdentityId:principal.identityId})}::jsonb,
          ${randomUUID()}::uuid,${randomUUID()}::uuid)`)).rejects.toMatchObject({code:'42501'});
      });
    }
    await rollbackCase(context!,async sql => {
      await expect(asAuthenticated(sql,fixture.pair[0],probe=>probe`SELECT public.mmhr_record_commission(
        ${JSON.stringify({action:'create_structure',organizationId:fixture.organizationId,actorIdentityId:fixture.pair[0].identityId})}::jsonb,
        ${randomUUID()}::uuid,${randomUUID()}::uuid)`,'aal1')).rejects.toMatchObject({code:'42501'});
    });
  },120000);
});

