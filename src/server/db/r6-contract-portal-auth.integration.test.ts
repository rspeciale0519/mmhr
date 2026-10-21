import { randomUUID } from "node:crypto";
import { afterAll,beforeAll,describe,expect,test } from "vitest";
import { createSecurityCommandApiFixtures,elevatedClient,verifiedApiClaims,type SecurityApiPrincipal,type SecurityCommandApiFixtures } from "@/server/auth/security-command-api-fixtures";
import { seedQuoteWorkflow,syntheticQuote } from "@/server/db/test/r6-proposal-quote-fixtures";
import { portalHandoffPageSchema,portalHandoffResultSchema } from "@/lib/contract-handoff-portal";
import type { SecurityPrincipal,SecurityTokenPrincipal } from "@/server/db/r1-security-command-fixtures";
import type { SupabaseClient } from "@supabase/supabase-js";
describe("Registered contract controls with genuine signed local Auth",()=>{
  let fixture:SecurityCommandApiFixtures,customer:SecurityApiPrincipal,left:SecurityApiPrincipal,right:SecurityApiPrincipal,lowStaff:SecurityApiPrincipal;
  let target:Awaited<ReturnType<typeof seedQuoteWorkflow>>,quoteId:string,handoffId:string;
  beforeAll(async()=>{
    fixture=await createSecurityCommandApiFixtures();
    expect(fixture.isolation.apiLoopbackOnly).toBe(true);
    [customer,left,right]=await Promise.all([fixture.createSyntheticPrincipal(),fixture.createSyntheticPrincipal(),fixture.createSyntheticPrincipal()]);
    lowStaff=await fixture.createSyntheticPrincipal({mfa:true});
    const portalPrincipal=async(actor:SecurityApiPrincipal):Promise<SecurityTokenPrincipal>=>{const claims=await verifiedApiClaims(actor.aal1,"aal1");return {identityId:actor.identityId,subject:actor.subjectId,sessionId:claims.sessionId,expiresAt:new Date(claims.expiresAt)};};
    const staffPrincipal=async(actor:SecurityApiPrincipal):Promise<SecurityPrincipal>=>{
      const claims=await verifiedApiClaims(elevatedClient(actor),"aal2"),[session]=await fixture.owner<{factor_id:string|null}[]>`SELECT factor_id FROM auth.sessions WHERE id=${claims.sessionId}::uuid AND user_id=${actor.subjectId}::uuid`;
      if(!session?.factor_id)throw new Error("Genuine MFA session required");return {identityId:actor.identityId,subject:actor.subjectId,sessionId:claims.sessionId,factorId:session.factor_id,expiresAt:new Date(claims.expiresAt)};
    };
    const pair=await Promise.all(fixture.pair.map(staffPrincipal)),actors=await Promise.all([customer,left,right].map(portalPrincipal)),admin=await staffPrincipal(fixture.organizationAdmin);
    await fixture.owner.begin(async sql=>{
      const [membership]=await sql<{id:string}[]>`INSERT INTO public.org_members(org_id,identity_id,user_id,role,role_key,migration_review_required)
        VALUES(${fixture.organizationId}::uuid,${pair[0]!.identityId}::uuid,${pair[0]!.subject}::uuid,'contributor','contributor',false) RETURNING id`;
      await sql`INSERT INTO public.user_permission_overrides(identity_id,permission_key,scope_kind,organization_id,scope_key,effect,issued_by_identity_id,issue_reason)
        VALUES(${pair[0]!.identityId}::uuid,'workspace.access','organization',${fixture.organizationId}::uuid,${`organization:${fixture.organizationId}`},'allow',${pair[1]!.identityId}::uuid,'Synthetic contract Auth fixture')`;
      target=await seedQuoteWorkflow(sql,{organizationId:fixture.organizationId,pair:[pair[0]!,pair[1]!],organizationAdmin:admin,target:admin,
        adminMembershipId:fixture.adminMembershipId,actorMembershipId:membership!.id,targetMembershipId:fixture.adminMembershipId},
        {customer:actors[0]!,vendors:[actors[1]!,actors[2]!]});
      const [assignment]=await sql<{id:string}[]>`INSERT INTO public.platform_role_assignments(identity_id,role_key,assigned_at,assignment_reason)
        VALUES(${lowStaff.identityId}::uuid,'staff',clock_timestamp(),'Synthetic current low-assurance contract test') RETURNING id`;
      await sql`INSERT INTO public.role_authority_records(record_kind,authority_kind,platform_assignment_id,role_definition_id,correlation_id,created_at)
        SELECT 'platform_assignment','reviewed_owner',${assignment!.id}::uuid,r.id,${randomUUID()}::uuid,a.assigned_at
        FROM public.role_definitions r JOIN public.platform_role_assignments a ON a.id=${assignment!.id}::uuid WHERE r.stable_key='staff' AND r.kind='platform' AND r.state='active'`;
      await sql`INSERT INTO public.org_members(org_id,identity_id,user_id,role,role_key,migration_review_required)
        VALUES(${fixture.organizationId}::uuid,${lowStaff.identityId}::uuid,${lowStaff.subjectId}::uuid,'contributor','contributor',false)`;
      await sql`INSERT INTO public.user_permission_overrides(identity_id,permission_key,scope_kind,organization_id,scope_key,effect,issued_by_identity_id,issue_reason)
        SELECT ${lowStaff.identityId}::uuid,permission,'organization',${fixture.organizationId}::uuid,${`organization:${fixture.organizationId}`},'allow',
          ${fixture.pair[0].identityId}::uuid,'Synthetic current low-assurance contract test' FROM unnest(ARRAY['workspace.access','rfp.approve']) permission`;
    });
    const vendor=target.vendors[0]!,submitted=await command(left.aal1,"mmhr_record_proposal_quote",{action:"submit",organizationId:vendor.organizationId,recipientId:vendor.recipientId,expectedVersion:0,quote:syntheticQuote});
    expect(submitted.error).toBeNull();quoteId=String(submitted.data.proposalVersionId);
    for(const [actor,action,revision] of [[fixture.pair[0],"review",1],[fixture.pair[1],"approve",2]] as const){
      const result=await command(elevatedClient(actor),"mmhr_record_proposal_quote",{action,organizationId:fixture.organizationId,proposalVersionId:quoteId,expectedRevision:revision,reason:"Genuine Auth synthetic quote decision",...(action==="approve"?{approvalReference:"Synthetic independent quote approval"}:{})});expect(result.error).toBeNull();
    }
  },420000);
  afterAll(async()=>{if(fixture)await fixture.close();},180000);
  const command=async(client:SupabaseClient,name:string,payload:object,key=randomUUID())=>{
    const started=performance.now(),response=await client.rpc(name,{payload,correlation_id:randomUUID(),idempotency_key:key});
    console.log("Contract request timing",{name,action:(payload as {action?:string}).action,milliseconds:Math.round(performance.now()-started),code:response.error?.code??null});
    return response;
  };
  const selection=()=>({action:"select",organizationId:fixture.organizationId,intakeId:target.intakeId,comparisonId:null,proposalVersionId:quoteId,expectedQuoteRevision:3,
    selectionReasons:["Synthetic customer decision"],remainingRisks:["Private customer implementation concern"]});
  async function page(client:SupabaseClient,view:"customer"|"staff"|"vendor"){
    const vendor=target.vendors[0]!,response=await client.rpc("mmhr_get_portal_contract_handoffs",{payload:{organizationId:view==="vendor"?vendor.organizationId:fixture.organizationId,view,
      ...(view==="vendor"?{recipientId:vendor.recipientId}:{intakeId:target.intakeId})},correlation_id:randomUUID()});expect(response.error).toBeNull();return portalHandoffPageSchema.parse(response.data);
  }
  test("rolls back a real request timeout and accepts its unchanged retry once",async()=>{
    const selected=await command(customer.aal1,"mmhr_record_portal_contract_handoff",selection());expect(selected.error).toBeNull();const id=String(selected.data.selectionId);
    const input={action:"approve_selection",organizationId:fixture.organizationId,selectionId:id,expectedRevision:1,reason:"Synthetic timeout recovery approval",approvalReference:"Synthetic retry receipt"},key=randomUUID();
    let unlock:(()=>void)|undefined,locked:(()=>void)|undefined;
    const held=new Promise<void>(resolve=>{unlock=resolve;}),ready=new Promise<void>(resolve=>{locked=resolve;});
    const holder=fixture.owner.begin(async sql=>{await sql`SELECT id FROM public.portal_contract_selections WHERE id=${id}::uuid FOR UPDATE`;locked!();await held;});
    try{await ready;const blocked=await command(elevatedClient(fixture.pair[0]),"mmhr_record_portal_contract_handoff",input,key);expect(blocked.error?.code).toBe("57014");}
    finally{unlock!();await holder;}
    const [pending]=await fixture.owner`SELECT state,handoff_id,(SELECT count(*)::int FROM public.portal_contract_handoff_details d WHERE d.selection_id=s.id) details FROM public.portal_contract_selections s WHERE s.id=${id}::uuid`;
    expect(pending).toEqual({state:"pending",handoff_id:null,details:0});
    const retried=await command(elevatedClient(fixture.pair[0]),"mmhr_record_portal_contract_handoff",input,key);expect(retried.error).toBeNull();expect(retried.data).toMatchObject({selectionId:id,selectionState:"approved",outcomeCode:"recorded"});
    const repeated=await command(elevatedClient(fixture.pair[0]),"mmhr_record_portal_contract_handoff",input,key);expect(repeated.error).toBeNull();expect(repeated.data).toMatchObject({handoffId:retried.data.handoffId,outcomeCode:"replayed"});
    const [proof]=await fixture.owner`SELECT count(*)::int count FROM public.contract_handoffs h JOIN public.portal_contract_selections s ON s.handoff_id=h.id WHERE s.id=${id}::uuid`;expect(proof!.count).toBe(1);
    const cancelled=await command(elevatedClient(fixture.pair[0]),"mmhr_record_portal_contract_handoff",{action:"transition",organizationId:fixture.organizationId,handoffId:retried.data.handoffId,expectedRevision:1,fromStatus:"introduction_pending",toStatus:"cancelled",reason:"Synthetic timeout test complete"});expect(cancelled.error).toBeNull();
  },120000);
  test("runs customer selection, separate staff approval, introduction and signing through signed Auth",async()=>{
    const key=randomUUID(),input=selection(),selected=await command(customer.aal1,"mmhr_record_portal_contract_handoff",input,key);expect(selected.error).toBeNull();const decision=portalHandoffResultSchema.parse(selected.data);
    const replay=await command(customer.aal1,"mmhr_record_portal_contract_handoff",input,key);expect(replay.error).toBeNull();expect(replay.data).toMatchObject({selectionId:decision.selectionId,outcomeCode:"replayed"});expect((await page(left.aal1,"vendor")).items.some(item=>item.selectionId===decision.selectionId)).toBe(false);
    const payload={action:"approve_selection",organizationId:fixture.organizationId,selectionId:decision.selectionId,expectedRevision:1,reason:"Separate current staff decision",approvalReference:"Synthetic staff decision receipt"};
    expect((await command(customer.aal1,"mmhr_record_portal_contract_handoff",payload)).error?.code).toBe("42501");
    const approved=await command(elevatedClient(fixture.pair[0]),"mmhr_record_portal_contract_handoff",payload);expect(approved.error).toBeNull();handoffId=String(approved.data.handoffId);
    expect((await page(left.aal1,"vendor")).items[0]).toMatchObject({state:"approved",selectionReasons:[],remainingRisks:[],decisionReason:null});
    const introduced=await command(elevatedClient(fixture.pair[0]),"mmhr_record_portal_contract_handoff",{action:"introduce",organizationId:fixture.organizationId,handoffId,expectedRevision:1,reason:"Both parties introduced",introducedAt:new Date().toISOString(),introductionReference:"Synthetic introduction receipt"});expect(introduced.error).toBeNull();
    const negotiating=await command(elevatedClient(fixture.pair[0]),"mmhr_record_portal_contract_handoff",{action:"transition",organizationId:fixture.organizationId,handoffId,expectedRevision:2,fromStatus:"introduced",toStatus:"negotiating",reason:"Parties negotiate legal terms directly"});expect(negotiating.error).toBeNull();
    const signed=await command(elevatedClient(fixture.pair[0]),"mmhr_record_portal_contract_handoff",{action:"record_signed",organizationId:fixture.organizationId,handoffId,expectedRevision:3,reason:"Synthetic parties report signing",signedAt:new Date().toISOString(),contractReference:"Synthetic signed contract reference"});expect(signed.error).toBeNull();
    expect((await page(customer.aal1,"customer")).items.find(item=>item.handoffId===handoffId)).toMatchObject({status:"signed",handoffRevision:4,canUpdate:false,events:[{reason:"Contract status updated."},{reason:"Contract status updated."},{reason:"Contract status updated."}]});
    const [proof]=await fixture.owner`SELECT d.stage,d.status,(SELECT count(*)::int FROM public.commission_events c WHERE c.deal_id=d.id) events FROM public.deals d JOIN public.contract_handoffs h ON h.deal_id=d.id WHERE h.id=${handoffId}::uuid`;expect(proof).toEqual({stage:"contracting",status:"open",events:0});
  },120000);
  test("denies legacy financial closure through genuine signed staff Auth",async()=>{
    const [deal]=await fixture.owner`SELECT d.id,d.revision FROM public.deals d JOIN public.contract_handoffs h ON h.deal_id=d.id WHERE h.id=${handoffId}::uuid`;
    const payload={action:"transition",organizationId:fixture.organizationId,dealId:deal!.id,actorIdentityId:fixture.pair[0].identityId,
      expectedRevision:deal!.revision,fromStage:"contracting",fromStatus:"open",toStage:"won",toStatus:"won",reason:"Synthetic legacy closure attempt"};
    expect((await command(elevatedClient(fixture.pair[0]),"mmhr_record_deal",payload)).error?.code).toBe("42501");
    const foreign={...payload,actorIdentityId:fixture.outsider.identityId};
    expect((await command(fixture.outsider.aal1,"mmhr_record_deal",foreign)).error?.code).toBe("42501");
    const [current]=await fixture.owner`SELECT stage,status,revision FROM public.deals WHERE id=${String(deal!.id)}::uuid`;
    expect(current).toEqual({stage:"contracting",status:"open",revision:deal!.revision});
    const [definition]=await fixture.owner`SELECT pg_get_functiondef('public.mmhr_record_deal(jsonb,uuid,uuid)'::regprocedure) AS source`;
    expect(String(definition!.source)).toContain("r1_start_security_command");
  },120000);
  test("denies live low-assurance staff and foreign vendor history",async()=>{
    const claims=await verifiedApiClaims(lowStaff.aal1,"aal1"),[session]=await fixture.owner<{live:boolean}[]>`SELECT EXISTS(SELECT 1 FROM auth.sessions WHERE id=${claims.sessionId}::uuid AND user_id=${lowStaff.subjectId}::uuid AND (not_after IS NULL OR not_after>clock_timestamp())) live`;expect(session!.live).toBe(true);
    const low=await lowStaff.aal1.rpc("mmhr_get_portal_contract_handoffs",{payload:{organizationId:fixture.organizationId,view:"staff",intakeId:target.intakeId},correlation_id:randomUUID()});expect(low.error?.code).toBe("42501");
    const vendor=target.vendors[1]!,foreign=await right.aal1.rpc("mmhr_get_portal_contract_handoff_history",{payload:{organizationId:vendor.organizationId,view:"vendor",recipientId:vendor.recipientId,handoffId:handoffId??randomUUID()},correlation_id:randomUUID()});expect(foreign.error?.code).toBe("42501");
    const outsider=await fixture.outsider.aal1.rpc("mmhr_get_portal_contract_handoffs",{payload:{organizationId:fixture.organizationId,view:"customer",intakeId:target.intakeId},correlation_id:randomUUID()});expect(outsider.error?.code).toBe("42501");
  });
  test("denies raw REST table access for ordinary and staff sessions",async()=>{
    for(const client of [customer.aal1,left.aal1,elevatedClient(fixture.pair[0]),fixture.anonymous])for(const table of ["portal_contract_selections","portal_contract_handoff_details","portal_contract_handoff_events"]){
      const response=await client.from(table).select("*").limit(1);expect(response.error?.code).toBe("42501");expect(response.data).toBeNull();
    }
  });
});
