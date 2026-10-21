import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createSecurityCommandApiFixtures, elevatedClient, verifiedApiClaims,
  type SecurityApiPrincipal, type SecurityCommandApiFixtures } from "@/server/auth/security-command-api-fixtures";
import type { SecurityPrincipal, SecurityTokenPrincipal, SecurityTransaction } from "./r1-security-command-fixtures";
import { seedQuoteWorkflow } from "./test/r6-proposal-quote-fixtures";
import { getRfpReceiptStatus } from "@/server/commands/rfp-receipt";
import type { RequestSupabaseClient } from "@/server/auth/authorization";
import { applicationPrivateTables } from "./test/application-schema-inventory";
import { waitForRfpReceiptStatusSchema } from "./test/r4-rfp-receipt-schema-ready";

describe("RFP receipt expansion preserves genuine earlier response evidence", () => {
  let fixture: SecurityCommandApiFixtures, customer: SecurityApiPrincipal, vendor: SecurityApiPrincipal;
  let source: Awaited<ReturnType<typeof seedQuoteWorkflow>>, intact: string, missing: string;
  let originalEvidence: unknown, originalProperties: unknown;
  const payloads: Record<string, unknown>[] = [], results: Record<string, unknown>[] = [], correlations: string[] = [], keys: string[] = [];
  async function response(index: number) {
    const result = await vendor.aal1.rpc("mmhr_submit_portal_response", {
      payload: payloads[index], correlation_id: correlations[index], idempotency_key: keys[index],
    });
    expect(result.error).toBeNull(); return result.data as Record<string, unknown>;
  }
  async function evidence() {
    const [row] = await fixture.owner`SELECT jsonb_build_object(
      'recipients',(SELECT jsonb_agg(to_jsonb(rr) ORDER BY rr.id) FROM public.rfp_recipients rr WHERE rr.id IN (${intact}::uuid,${missing}::uuid)),
      'submissions',(SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id) FROM public.rfp_portal_submissions s WHERE s.recipient_id IN (${intact}::uuid,${missing}::uuid)),
      'normalizations',(SELECT jsonb_agg(to_jsonb(n) ORDER BY n.id) FROM public.rfp_response_normalizations n JOIN public.rfp_portal_submissions s ON s.normalization_id=n.id WHERE s.recipient_id IN (${intact}::uuid,${missing}::uuid)),
      'receipts',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM public.security_command_receipts r JOIN public.rfp_portal_submissions s ON s.normalization_id=r.entity_id WHERE s.recipient_id IN (${intact}::uuid,${missing}::uuid)),
      'audits',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM public.audit_events a JOIN public.security_command_receipts r ON r.audit_event_id=a.id JOIN public.rfp_portal_submissions s ON s.normalization_id=r.entity_id WHERE s.recipient_id IN (${intact}::uuid,${missing}::uuid))) proof`;
    return row!.proof;
  }
  async function properties() {
    return fixture.owner`SELECT p.oid::text,p.proowner::text,p.proacl::text,p.prosecdef,p.provolatile,p.proconfig,
      pg_get_function_identity_arguments(p.oid) arguments,pg_get_function_result(p.oid) result,pg_get_functiondef(p.oid) definition
      FROM pg_proc p WHERE p.oid='public.mmhr_submit_portal_response(jsonb,uuid,uuid)'::regprocedure`;
  }
  async function retainedProgress() {
    const [row]=await fixture.owner`SELECT jsonb_build_object(
      'confirmations',(SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id) FROM mmhr_private.rfp_receipt_confirmations e),
      'receipts',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM public.security_command_receipts r),
      'audits',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM public.audit_events a),
      'inboundEvents',(SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id) FROM public.inbound_email_events e)) proof`;
    return { history:await evidence(),global:row!.proof };
  }
  async function ownerWithCurrentVendor(operation:(sql:SecurityTransaction)=>Promise<void>) {
    await verifiedApiClaims(vendor.aal1,"aal1");
    const claims=await vendor.aal1.auth.getClaims();expect(claims.error).toBeNull();
    await fixture.owner.begin(async sql=>{
      await sql`SELECT set_config('request.jwt.claims',${JSON.stringify(claims.data!.claims)},true)`;
      const [actor]=await sql<{actor:string}[]>`SELECT mmhr_private.r4_receipt_actor(${source.vendors[0]!.organizationId}::uuid) actor`;
      expect(actor!.actor).toBe(vendor.identityId);await operation(sql);
    });
  }
  beforeAll(async () => {
    fixture = await createSecurityCommandApiFixtures({ migrationStage: "before_r4_rfp_receipts" });
    console.info(JSON.stringify({ event: "receipt_fixture_owned", projectId: fixture.projectId, ...fixture.isolation }));
    expect(fixture.rfpReceiptMigration).not.toBeNull();
    customer = await fixture.createSyntheticPrincipal(); vendor = await fixture.createSyntheticPrincipal();
    const other = await fixture.createSyntheticPrincipal();
    async function portal(actor: SecurityApiPrincipal): Promise<SecurityTokenPrincipal> {
      const claims = await verifiedApiClaims(actor.aal1,"aal1");
      return { identityId:actor.identityId,subject:actor.subjectId,sessionId:claims.sessionId,expiresAt:new Date(claims.expiresAt) };
    }
    async function staff(actor: SecurityApiPrincipal): Promise<SecurityPrincipal> {
      const claims = await verifiedApiClaims(elevatedClient(actor),"aal2");
      const [session] = await fixture.owner<{ factor_id:string|null }[]>`SELECT factor_id FROM auth.sessions WHERE id=${claims.sessionId}::uuid`;
      if (!session?.factor_id) throw new Error("A genuine MFA factor is required");
      return { identityId:actor.identityId,subject:actor.subjectId,sessionId:claims.sessionId,factorId:session.factor_id,expiresAt:new Date(claims.expiresAt) };
    }
    const pair = await Promise.all(fixture.pair.map(staff)), admin = await staff(fixture.organizationAdmin);
    const actors = await Promise.all([customer,vendor,other].map(portal));
    source = await fixture.owner.begin(async sql => {
      const [membership] = await sql<{id:string}[]>`INSERT INTO public.org_members(org_id,identity_id,user_id,role,role_key,migration_review_required)
        VALUES(${fixture.organizationId}::uuid,${pair[0]!.identityId}::uuid,${pair[0]!.subject}::uuid,'contributor','contributor',false) RETURNING id`;
      await sql`INSERT INTO public.user_permission_overrides(identity_id,permission_key,scope_kind,organization_id,scope_key,effect,issued_by_identity_id,issue_reason)
        VALUES(${pair[0]!.identityId}::uuid,'workspace.access','organization',${fixture.organizationId}::uuid,${`organization:${fixture.organizationId}`},'allow',${pair[1]!.identityId}::uuid,'Synthetic receipt scoped staff fixture')`;
      return seedQuoteWorkflow(sql,{ organizationId:fixture.organizationId,pair:[pair[0]!,pair[1]!],organizationAdmin:admin,target:admin,
        adminMembershipId:fixture.adminMembershipId,actorMembershipId:membership!.id,targetMembershipId:fixture.adminMembershipId },
        { customer:actors[0]!,vendors:[actors[1]!,actors[2]!] });
    });
    intact=source.vendors[0]!.recipientId;
    // Create the second delivery through the real approved questionnaire path.
    const rfpId=randomUUID(),metadata=()=>({correlation_id:randomUUID(),idempotency_key:randomUUID()});
    async function command(actor:SecurityApiPrincipal,name:string,payload:object) {
      const result=await elevatedClient(actor).rpc(name,{payload,...metadata()});expect(result.error).toBeNull();return result.data;
    }
    await command(fixture.pair[0],"mmhr_create_rfp_questionnaire",{organizationId:fixture.organizationId,intakeId:source.intakeId,rfpId,sourceRevision:2,title:"Earlier receipt fixture",content:"Describe synthetic payroll support."});
    await command(fixture.pair[1],"mmhr_approve_rfp_version",{organizationId:fixture.organizationId,rfpId,version:1,actorIdentityId:fixture.pair[1].identityId,approvalReference:"approval:earlier-receipt"});
    const read=await elevatedClient(fixture.pair[0]).rpc("mmhr_get_rfp_workflow",{payload:{organizationId:fixture.organizationId,intakeId:source.intakeId},correlation_id:randomUUID()});expect(read.error).toBeNull();
    const base=(read.data.rfps as {rfpId:string;deliveryDigest:string}[]).find(row=>row.rfpId===rfpId);expect(base).toBeDefined();
    await command(fixture.pair[0],"mmhr_deliver_rfp_to_portals",{organizationId:fixture.organizationId,rfpId,version:1,deadlineAt:new Date(Date.now()+86400000).toISOString(),expectedDigest:base!.deliveryDigest});
    const [recipient]=await fixture.owner<{id:string}[]>`SELECT rr.id FROM public.rfp_recipients rr JOIN public.rfp_versions r ON r.id=rr.rfp_version_id WHERE r.rfp_id=${rfpId}::uuid AND rr.vendor_organization_id=${source.vendors[0]!.organizationId}::uuid`;missing=recipient!.id;
    for (const recipientId of [intact,missing]) {
      payloads.push({organizationId:source.vendors[0]!.organizationId,recipientId,expectedRevision:0,response:{supportedRequirements:["Earlier genuine synthetic response"],unsupportedRequirements:[],caveats:[],dependencies:[],commitments:[],implementationDetails:[],missingAnswers:[],proposedFollowUps:[]}});
      correlations.push(randomUUID());keys.push(randomUUID());results.push(await response(results.length));
    }
    const [old]=await fixture.owner<{available:boolean}[]>`SELECT to_regclass('mmhr_private.rfp_receipt_confirmations') IS NULL available`;expect(old!.available).toBe(true);
    // Model an earlier incomplete projection before the new guard exists. Keep its real submission and receipt.
    await fixture.owner`UPDATE public.rfp_recipients SET acknowledged_at=NULL WHERE id=${missing}::uuid`;
    originalEvidence=await evidence();originalProperties=await properties();
    await fixture.finishRfpReceiptMigration();
    await waitForRfpReceiptStatusSchema(signal => fixture.anonymous.rpc("mmhr_get_rfp_receipt_status", {
      payload: { organizationId: fixture.organizationId, intakeId: source.intakeId, view: "customer" }, correlation_id: randomUUID(),
    }).abortSignal(signal));
    expect(await evidence()).toEqual(originalEvidence);expect(await properties()).toEqual(originalProperties);
    console.info("RFP receipt historical migration capture",fixture.rfpReceiptMigration);
  },420000);
  afterAll(async()=>{if(fixture)await fixture.close();},180000);
  test("preserves earlier recipient, response, receipt, audit and function bytes without backfill",async()=>{
    expect(await evidence()).toEqual(originalEvidence);expect(await properties()).toEqual(originalProperties);
    const [rows]=await fixture.owner<{count:number}[]>`SELECT count(*)::integer count FROM mmhr_private.rfp_receipt_confirmations`;expect(rows!.count).toBe(0);
    const page=await getRfpReceiptStatus({organizationId:fixture.organizationId,intakeId:source.intakeId,view:"customer",correlationId:randomUUID()},
      {supabase:customer.aal1 as RequestSupabaseClient});
    expect(page.items.find(row=>row.recipientId===intact)).toMatchObject({receiptKind:"recorded",state:"responded",canConfirm:false});
    expect(page.items.find(row=>row.recipientId===missing)).toMatchObject({receiptKind:"none",acknowledgedAt:null,state:"responded",canConfirm:false});
  });
  test("replays genuine earlier submissions without changing any historical bytes",async()=>{
    const before=await evidence();
    for(const index of [0,1])expect(await response(index)).toEqual({...results[index],outcomeCode:"replayed"});
    expect(await evidence()).toEqual(before);
  });
  test.each(["pending","distributed"] as const)("denies historical responded state reset to %s with a missing first time",async state=>{
    const before=await evidence(),claims=await vendor.aal1.auth.getClaims();expect(claims.error).toBeNull();
    const globalProof=async()=>{
      const [row]=await fixture.owner`SELECT jsonb_build_object(
        'confirmations',(SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id) FROM mmhr_private.rfp_receipt_confirmations e),
        'receipts',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM public.security_command_receipts r),
        'audits',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM public.audit_events a),
        'inboundEvents',(SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id) FROM public.inbound_email_events e)) proof`;
      return row!.proof;
    };
    const savedGlobal=await globalProof();
    const [recipient]=await fixture.owner`SELECT state,acknowledged_at FROM public.rfp_recipients WHERE id=${missing}::uuid`;
    expect(recipient!.state).toBe("responded");expect(recipient!.acknowledged_at).toBeNull();
    await expect(fixture.owner.begin(async sql=>{
      await sql`SELECT set_config('request.jwt.claims',${JSON.stringify(claims.data!.claims)},true)`;
      const [actor]=await sql<{actor:string}[]>`SELECT mmhr_private.r4_receipt_actor(${source.vendors[0]!.organizationId}::uuid) actor`;expect(actor!.actor).toBe(vendor.identityId);
      await sql`UPDATE public.rfp_recipients SET state=${state} WHERE id=${missing}::uuid`;
      await sql`SET CONSTRAINTS ALL IMMEDIATE`;
    })).rejects.toMatchObject({code:"42501",message:"RFP receipt state cannot regress"});
    expect(await evidence()).toEqual(before);expect(await globalProof()).toEqual(savedGlobal);
  });
  test.each(["future","infinite","before_submission"] as const)("denies owner-forged %s first time on earlier incomplete response evidence",async attack=>{
    const before=await evidence(),claims=await vendor.aal1.auth.getClaims();expect(claims.error).toBeNull();
    await expect(fixture.owner.begin(async sql=>{
      await sql`SELECT set_config('request.jwt.claims',${JSON.stringify(claims.data!.claims)},true)`;
      const [actor]=await sql<{actor:string}[]>`SELECT mmhr_private.r4_receipt_actor(${source.vendors[0]!.organizationId}::uuid) actor`;expect(actor!.actor).toBe(vendor.identityId);
      await sql`UPDATE public.rfp_recipients SET acknowledged_at=CASE WHEN ${attack}='future' THEN clock_timestamp()+interval '1 day'
        WHEN ${attack}='infinite' THEN 'infinity'::timestamptz ELSE (SELECT min(submitted_at)-interval '1 microsecond' FROM public.rfp_portal_submissions WHERE recipient_id=${missing}::uuid) END WHERE id=${missing}::uuid`;
      await sql`SET CONSTRAINTS ALL IMMEDIATE`;
    })).rejects.toMatchObject({code:"42501",message:"RFP receipt requires a submitted response or confirmation"});
    expect(await evidence()).toEqual(before);
  });
  test("denies historical same-transaction withdrawal and redistribution with unchanged earlier evidence",async()=>{
    const before=await retainedProgress();
    for(const state of ["pending","distributed"] as const){
      await expect(ownerWithCurrentVendor(async sql=>{
        const [recipient]=await sql`SELECT state,acknowledged_at FROM public.rfp_recipients WHERE id=${missing}::uuid`;
        expect(recipient!.state).toBe("responded");expect(recipient!.acknowledged_at).toBeNull();
        await sql`UPDATE public.rfp_recipients SET state='withdrawn' WHERE id=${missing}::uuid`;
        const [withdrawn]=await sql`SELECT state,acknowledged_at FROM public.rfp_recipients WHERE id=${missing}::uuid`;
        expect(withdrawn!.state).toBe("withdrawn");expect(withdrawn!.acknowledged_at).toBeNull();
        await sql`UPDATE public.rfp_recipients SET state=${state} WHERE id=${missing}::uuid`;
        await sql`SET CONSTRAINTS ALL IMMEDIATE`;
      })).rejects.toMatchObject({code:"42501",message:"RFP receipt state cannot regress"});
      expect(await retainedProgress()).toEqual(before);
    }
  });
  test("matches the private schema inventory and retains default-deny receipt access",async()=>{
    const tables=await fixture.owner<{tablename:string}[]>`SELECT tablename FROM pg_tables WHERE schemaname='mmhr_private' ORDER BY tablename`;
    expect(tables.map(row=>row.tablename)).toEqual(applicationPrivateTables);
    const [receipt]=await fixture.owner<{rowsecurity:boolean}[]>`SELECT rowsecurity FROM pg_tables WHERE schemaname='mmhr_private' AND tablename='rfp_receipt_confirmations'`;
    expect(receipt!.rowsecurity).toBe(true);
  });
  test("refuses repeated migration completion without writes",async()=>{
    const before=await evidence();await expect(fixture.finishRfpReceiptMigration()).rejects.toThrow("The captured RFP receipt migration is already finished or applying");expect(await evidence()).toEqual(before);
  });
  test.each(["intact","missing"] as const)("denies same-transaction historical withdrawal reactivation for %s first time",async kind=>{
    const recipientId=kind==="intact"?intact:missing,before=await retainedProgress();
    const [prior]=await fixture.owner`SELECT state,acknowledged_at FROM public.rfp_recipients WHERE id=${recipientId}::uuid`;
    expect(prior!.state).toBe("responded");
    for(const state of ["pending","distributed","acknowledged","responded"] as const){
      await expect(ownerWithCurrentVendor(async sql=>{
        await sql`UPDATE public.rfp_recipients SET state='withdrawn' WHERE id=${recipientId}::uuid`;
        const [withdrawn]=await sql`SELECT state,acknowledged_at FROM public.rfp_recipients WHERE id=${recipientId}::uuid`;
        expect(withdrawn!.state).toBe("withdrawn");expect(withdrawn!.acknowledged_at).toEqual(prior!.acknowledged_at);
        await sql`UPDATE public.rfp_recipients SET state=${state} WHERE id=${recipientId}::uuid`;
        await sql`SET CONSTRAINTS ALL IMMEDIATE`;
      })).rejects.toMatchObject({code:"42501",message:"RFP receipt state cannot regress"});
      expect(await retainedProgress()).toEqual(before);
    }
  });
  test("preserves committed historical withdrawal and denies later redistribution",async()=>{
    const original=await retainedProgress();
    await ownerWithCurrentVendor(async sql=>{
      const [recipient]=await sql`SELECT state,acknowledged_at FROM public.rfp_recipients WHERE id=${missing}::uuid`;
      expect(recipient!.state).toBe("responded");expect(recipient!.acknowledged_at).toBeNull();
      await sql`UPDATE public.rfp_recipients SET state='withdrawn' WHERE id=${missing}::uuid`;
    });
    const expected=JSON.parse(JSON.stringify(original));
    expected.history.recipients.find((row:{id:string})=>row.id===missing).state="withdrawn";
    const before=await retainedProgress();expect(before).toEqual(expected);
    for(const state of ["pending","distributed"] as const){
      await expect(ownerWithCurrentVendor(async sql=>{
        await sql`UPDATE public.rfp_recipients SET state=${state} WHERE id=${missing}::uuid`;
        await sql`SET CONSTRAINTS ALL IMMEDIATE`;
      })).rejects.toMatchObject({code:"42501",message:"RFP receipt state cannot regress"});
      expect(await retainedProgress()).toEqual(before);
    }
  });
  test.each(["intact","missing"] as const)("preserves committed historical withdrawal and denies active states for %s first time",async kind=>{
    const recipientId=kind==="intact"?intact:missing,index=kind==="intact"?0:1,original=await retainedProgress();
    await ownerWithCurrentVendor(async sql=>{
      await sql`UPDATE public.rfp_recipients SET state='withdrawn' WHERE id=${recipientId}::uuid`;
    });
    const expected=JSON.parse(JSON.stringify(original));
    expected.history.recipients.find((row:{id:string})=>row.id===recipientId).state="withdrawn";
    const before=await retainedProgress();expect(before).toEqual(expected);
    // An unchanged withdrawn projection must remain valid, including a missing historical timestamp.
    await ownerWithCurrentVendor(async sql=>{
      await sql`UPDATE public.rfp_recipients SET state='withdrawn' WHERE id=${recipientId}::uuid`;
    });
    expect(await retainedProgress()).toEqual(before);
    for(const state of ["pending","distributed","acknowledged","responded"] as const){
      await expect(ownerWithCurrentVendor(async sql=>{
        await sql`UPDATE public.rfp_recipients SET state=${state} WHERE id=${recipientId}::uuid`;
        await sql`SET CONSTRAINTS ALL IMMEDIATE`;
      })).rejects.toMatchObject({code:"42501",message:"RFP receipt state cannot regress"});
      expect(await retainedProgress()).toEqual(before);
    }
    const replay=await vendor.aal1.rpc("mmhr_submit_portal_response",{payload:payloads[index],correlation_id:correlations[index],idempotency_key:keys[index]});
    expect(replay.error?.code).toBe("42501");expect(replay.data).toBeNull();
    const vendorPage=await getRfpReceiptStatus({organizationId:source.vendors[0]!.organizationId,view:"vendor",correlationId:randomUUID()},
      {supabase:vendor.aal1 as RequestSupabaseClient});
    expect(vendorPage.items.find(row=>row.recipientId===recipientId)).toBeUndefined();
    const customerPage=await getRfpReceiptStatus({organizationId:fixture.organizationId,intakeId:source.intakeId,view:"customer",correlationId:randomUUID()},
      {supabase:customer.aal1 as RequestSupabaseClient});
    expect(customerPage.items.find(row=>row.recipientId===recipientId)).toMatchObject({state:"withdrawn",receiptKind:kind==="intact"?"recorded":"none",canConfirm:false});
    expect(await retainedProgress()).toEqual(before);
  });
});
