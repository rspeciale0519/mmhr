import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll,beforeAll,describe,expect,test } from "vitest";
import { createSecurityCommandApiFixtures,elevatedClient,verifiedApiClaims,type SecurityApiPrincipal,type SecurityCommandApiFixtures } from "@/server/auth/security-command-api-fixtures";
import { proposalComparisonPageSchema,proposalComparisonResultSchema,proposalQuotePageSchema,proposalQuoteResultSchema } from "@/lib/proposal-quote";
import type { SecurityPrincipal,SecurityTokenPrincipal } from "./r1-security-command-fixtures";
import { seedQuoteWorkflow,syntheticQuote } from "./test/r6-proposal-quote-fixtures";

describe("Portal proposals with genuine signed Auth sessions",()=>{
  let fixture:SecurityCommandApiFixtures,target:Awaited<ReturnType<typeof seedQuoteWorkflow>>;
  let customer:SecurityApiPrincipal,left:SecurityApiPrincipal,right:SecurityApiPrincipal,lowStaff:SecurityApiPrincipal;
  beforeAll(async()=>{
    fixture=await createSecurityCommandApiFixtures();
    [customer,left,right]=await Promise.all([fixture.createSyntheticPrincipal(),fixture.createSyntheticPrincipal(),fixture.createSyntheticPrincipal()]);
    lowStaff=await fixture.createSyntheticPrincipal({mfa:true});
    await fixture.owner.begin(async(sql)=>{
      const [assignment]=await sql<{id:string}[]>`INSERT INTO public.platform_role_assignments(identity_id,role_key,assigned_at,assignment_reason)
        VALUES(${lowStaff.identityId}::uuid,'staff',clock_timestamp(),'Synthetic live low-assurance proposal test') RETURNING id`;
      await sql`INSERT INTO public.role_authority_records(record_kind,authority_kind,platform_assignment_id,role_definition_id,correlation_id,created_at)
        SELECT 'platform_assignment','reviewed_owner',${assignment!.id}::uuid,r.id,${randomUUID()}::uuid,a.assigned_at
        FROM public.role_definitions r JOIN public.platform_role_assignments a ON a.id=${assignment!.id}::uuid
        WHERE r.stable_key='staff' AND r.kind='platform' AND r.state='active'`;
      await sql`INSERT INTO public.org_members(org_id,identity_id,user_id,role,role_key,migration_review_required)
        VALUES(${fixture.organizationId}::uuid,${lowStaff.identityId}::uuid,${lowStaff.subjectId}::uuid,'contributor','contributor',false)`;
      await sql`INSERT INTO public.user_permission_overrides(identity_id,permission_key,scope_kind,organization_id,scope_key,effect,issued_by_identity_id,issue_reason)
        SELECT ${lowStaff.identityId}::uuid,permission,'organization',${fixture.organizationId}::uuid,${`organization:${fixture.organizationId}`},'allow',
          ${fixture.pair[0].identityId}::uuid,'Synthetic live low-assurance proposal test' FROM unnest(ARRAY['workspace.access','rfp.approve']) permission`;
    });
    async function databasePrincipal(actor:SecurityApiPrincipal):Promise<SecurityPrincipal>{
      const claims=await verifiedApiClaims(elevatedClient(actor),"aal2");
      const [session]=await fixture.owner<{factor_id:string|null}[]>`SELECT factor_id FROM auth.sessions WHERE id=${claims.sessionId}::uuid AND user_id=${actor.subjectId}::uuid`;
      if(!session?.factor_id)throw new Error("The synthetic setup needs a genuine verified MFA session");
      return{identityId:actor.identityId,subject:actor.subjectId,sessionId:claims.sessionId,factorId:session.factor_id,expiresAt:new Date(claims.expiresAt)};
    }
    async function portalPrincipal(actor:SecurityApiPrincipal):Promise<SecurityTokenPrincipal>{
      const claims=await verifiedApiClaims(actor.aal1,"aal1");
      return{identityId:actor.identityId,subject:actor.subjectId,sessionId:claims.sessionId,expiresAt:new Date(claims.expiresAt)};
    }
    const [first,second,admin]=await Promise.all([
      ...fixture.pair.map(databasePrincipal),databasePrincipal(fixture.organizationAdmin),
    ]);
    const [customerPrincipal,leftPrincipal,rightPrincipal]=await Promise.all([portalPrincipal(customer),portalPrincipal(left),portalPrincipal(right)]);
    target=await fixture.owner.begin(async(sql)=>{
      const [membership]=await sql<{id:string}[]>`INSERT INTO public.org_members(org_id,identity_id,user_id,role,role_key,migration_review_required)
        VALUES(${fixture.organizationId}::uuid,${first!.identityId}::uuid,${first!.subject}::uuid,'contributor','contributor',false) RETURNING id`;
      await sql`INSERT INTO public.user_permission_overrides(identity_id,permission_key,scope_kind,organization_id,scope_key,effect,issued_by_identity_id,issue_reason)
        VALUES(${first!.identityId}::uuid,'workspace.access','organization',${fixture.organizationId}::uuid,${`organization:${fixture.organizationId}`},'allow',${second!.identityId}::uuid,'Synthetic quote Auth fixture')`;
      return seedQuoteWorkflow(sql,{pair:[first!,second!],organizationAdmin:admin!,target:admin!,organizationId:fixture.organizationId,
        adminMembershipId:fixture.adminMembershipId,actorMembershipId:membership!.id,targetMembershipId:fixture.adminMembershipId},
        {customer:customerPrincipal!,vendors:[leftPrincipal!,rightPrincipal!]});
    });
    expect(fixture.isolation.apiLoopbackOnly).toBe(true);
    for(const [actor,vendor] of [[left,target.vendors[0]!],[right,target.vendors[1]!]] as const){
      const checked=await actor.aal1.auth.getClaims();expect(checked.error).toBeNull();const claims=checked.data!.claims;
      const diagnostics=await fixture.owner.begin(async(sql)=>{
        await sql`SELECT set_config('request.jwt.claims',${JSON.stringify(claims)},true)`;
        const [proof]=await sql`SELECT
          mmhr_private.r1_verified_identity(${actor.identityId}::uuid,false) identity,
          mmhr_private.r1_evaluate_permission(${actor.identityId}::uuid,'portal.vendor.access',${vendor.organizationId}::uuid,'aal1',clock_timestamp(),false) portal,
          mmhr_private.r1_evaluate_permission(${actor.identityId}::uuid,'workspace.access',${vendor.organizationId}::uuid,'aal1',clock_timestamp(),false) workspace,
          mmhr_private.r6_quote_actor(${vendor.organizationId}::uuid,'vendor') IS NOT NULL actor,
          EXISTS(SELECT 1 FROM auth.sessions WHERE id=${String(claims.session_id)}::uuid AND user_id=${actor.subjectId}::uuid) session,
          (coalesce(auth.jwt()->>'iat','') ~ '^[0-9]{1,12}$') has_issued_time,
          (auth.jwt()->>'iat')::numeric<=floor(extract(epoch FROM clock_timestamp())) current_issued_time`;
        return proof;
      });
      expect(diagnostics).toEqual({identity:true,portal:true,workspace:true,actor:true,session:true,has_issued_time:true,current_issued_time:true});
    }
  },300000);
  afterAll(async()=>{if(fixture)await fixture.close();},180000);
  async function command(client:SupabaseClient,name:string,payload:object,key=randomUUID()){
    return client.rpc(name,{payload,correlation_id:randomUUID(),idempotency_key:key});
  }
  async function submit(index=0,quote=syntheticQuote,key=randomUUID()){
    const client=index===0?left.aal1:right.aal1,vendor=target.vendors[index]!;
    const page=await client.rpc("mmhr_get_proposal_quotes",{payload:{view:"vendor",organizationId:vendor.organizationId,recipientId:vendor.recipientId},correlation_id:randomUUID()});
    expect(page.error).toBeNull();const input={action:"submit",organizationId:vendor.organizationId,recipientId:vendor.recipientId,expectedVersion:page.data.submission.expectedVersion,quote};
    const result=await command(client,"mmhr_record_proposal_quote",input,key);expect(result.error).toBeNull();
    return{input,key,client,result:proposalQuoteResultSchema.parse(result.data)};
  }
  async function approve(index=0){
    const source=await submit(index),input={organizationId:fixture.organizationId,proposalVersionId:source.result.proposalVersionId,reason:"Genuine Auth synthetic source review"};
    const reviewed=await command(elevatedClient(fixture.pair[0]),"mmhr_record_proposal_quote",{...input,action:"review",expectedRevision:1});expect(reviewed.error).toBeNull();
    const selfApproved=await command(elevatedClient(fixture.pair[0]),"mmhr_record_proposal_quote",{...input,action:"approve",expectedRevision:2,approvalReference:"approval:synthetic"});expect(selfApproved.error?.code).toBe("42501");
    const approved=await command(elevatedClient(fixture.pair[1]),"mmhr_record_proposal_quote",{...input,action:"approve",expectedRevision:2,approvalReference:"approval:synthetic"});expect(approved.error).toBeNull();
    return proposalQuoteResultSchema.parse(approved.data);
  }
  async function customerQuotes(){
    const response=await customer.aal1.rpc("mmhr_get_proposal_quotes",{payload:{organizationId:fixture.organizationId,intakeId:target.intakeId,view:"customer"},correlation_id:randomUUID()});
    expect(response.error).toBeNull();return proposalQuotePageSchema.parse(response.data);
  }
  test("runs both vendor quotes through different staff decisions and approved customer comparisons",async()=>{
    const first=await approve(),second=await approve(1);
    expect((await customerQuotes()).items).toHaveLength(2);
    const prepared=await command(elevatedClient(fixture.pair[0]),"mmhr_record_proposal_quote_comparison",{action:"prepare",organizationId:fixture.organizationId,
      intakeId:target.intakeId,proposalVersionIds:[first.proposalVersionId,second.proposalVersionId],reason:"Synthetic two-vendor comparison"});
    expect(prepared.error).toBeNull();const comparison=proposalComparisonResultSchema.parse(prepared.data);
    const payload={action:"approve",organizationId:fixture.organizationId,comparisonId:comparison.comparisonId,expectedRevision:1,
      expectedDigest:comparison.sourceDigest,reason:"Independent synthetic comparison",approvalReference:"approval:synthetic-comparison"};
    const self=await command(elevatedClient(fixture.pair[0]),"mmhr_record_proposal_quote_comparison",payload);expect(self.error?.code).toBe("42501");
    const approved=await command(elevatedClient(fixture.pair[1]),"mmhr_record_proposal_quote_comparison",payload);expect(approved.error).toBeNull();
    const page=await customer.aal1.rpc("mmhr_get_proposal_quote_comparisons",{payload:{organizationId:fixture.organizationId,intakeId:target.intakeId,view:"customer"},correlation_id:randomUUID()});
    expect(page.error).toBeNull();expect(proposalComparisonPageSchema.parse(page.data).items[0]).toMatchObject({state:"approved",current:true,sourceDigest:null,canReject:false});
  },90000);
  test("keeps pending revisions private and denies foreign vendor access",async()=>{
    const pending=await submit(),before=await customerQuotes();expect(before.items.every((row)=>row.proposalVersionId!==pending.result.proposalVersionId)).toBe(true);
    const foreign=await right.aal1.rpc("mmhr_get_proposal_quotes",{payload:{organizationId:target.vendors[1]!.organizationId,view:"vendor",recipientId:target.vendors[0]!.recipientId},correlation_id:randomUUID()});expect(foreign.error?.code).toBe("42501");
    for(const table of ["proposal_quote_sources","proposal_quote_events","proposal_quote_comparisons"]){const raw=await left.aal1.from(table).select("*");expect(raw.error?.code).toBe("42501");}
  },60000);
  test("denies a current staff session without MFA despite its valid assigned permissions",async()=>{
    const claims=await verifiedApiClaims(lowStaff.aal1,"aal1");
    const [proof]=await fixture.owner`SELECT
      EXISTS(SELECT 1 FROM auth.sessions WHERE id=${claims.sessionId}::uuid AND user_id=${lowStaff.subjectId}::uuid) session,
      mmhr_private.r1_evaluate_permission(${lowStaff.identityId}::uuid,'rfp.approve',${fixture.organizationId}::uuid,'aal2',clock_timestamp(),false) assigned,
      mmhr_private.r1_evaluate_permission(${lowStaff.identityId}::uuid,'workspace.access',${fixture.organizationId}::uuid,'aal2',clock_timestamp(),false) workspace,
      mmhr_private.r1_evaluate_permission(${lowStaff.identityId}::uuid,'admin.access',NULL,'aal2',clock_timestamp(),false) administration`;
    expect(proof).toEqual({session:true,assigned:true,workspace:true,administration:true});
    const quotes=await lowStaff.aal1.rpc('mmhr_get_proposal_quotes',{payload:{view:'staff',organizationId:fixture.organizationId,intakeId:target.intakeId},correlation_id:randomUUID()});
    expect(quotes.error?.code).toBe('42501');
    const pending=await submit(),review=await command(lowStaff.aal1,'mmhr_record_proposal_quote',{action:'review',organizationId:fixture.organizationId,
      proposalVersionId:pending.result.proposalVersionId,expectedRevision:1,reason:'Current low-assurance staff denial'});
    expect(review.error?.code).toBe('42501');
  },60000);
  test("validates typed prices at the public boundary and leaves approval unchanged",async()=>{
    const vendor=target.vendors[0]!,input={action:"submit",organizationId:vendor.organizationId,recipientId:vendor.recipientId,expectedVersion:2,quote:syntheticQuote};
    for(const override of [{quote:{...syntheticQuote,pricing:{...syntheticQuote.pricing,implementationCostMinorUnits:0.1}}},{approvedByIdentityId:fixture.pair[1].identityId},
      {quote:{...syntheticQuote,quoteDate:"2999-01-01"}},{quote:{...syntheticQuote,quoteReference:"\n"}}]){
      const result=await command(left.aal1,"mmhr_record_proposal_quote",{...input,...override});expect(result.error?.code).toBe("22023");
    }
    expect((await customerQuotes()).items.every((row)=>row.approvedAt!==null)).toBe(true);
  },60000);
  test("reauthorizes idempotent replay after membership and session revocation",async()=>{
    const pending=await submit(1),vendor=target.vendors[1]!;
    const replay=await command(right.aal1,"mmhr_record_proposal_quote",pending.input,pending.key);expect(replay.error).toBeNull();expect(replay.data.outcomeCode).toBe("replayed");
    await fixture.owner`UPDATE public.org_members SET role='viewer',role_key='viewer' WHERE org_id=${vendor.organizationId}::uuid AND identity_id=${right.identityId}::uuid`;
    const viewer=await command(right.aal1,"mmhr_record_proposal_quote",pending.input,pending.key);expect(viewer.error?.code).toBe("42501");
    await fixture.owner`UPDATE public.org_members SET role='contributor',role_key='contributor' WHERE org_id=${vendor.organizationId}::uuid AND identity_id=${right.identityId}::uuid`;
    const claims=await verifiedApiClaims(right.aal1,"aal1");await fixture.owner`DELETE FROM auth.sessions WHERE id=${claims.sessionId}::uuid AND user_id=${right.subjectId}::uuid`;
    const revoked=await command(right.aal1,"mmhr_record_proposal_quote",pending.input,pending.key);expect(revoked.error?.code).toBe("42501");
  },60000);
});
