import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { proposalComparisonPageSchema, proposalComparisonResultSchema, proposalQuotePageSchema, proposalQuoteResultSchema } from "@/lib/proposal-quote";
import { applyAllMigrations, startRehearsal, stopRehearsal, type RehearsalContext } from "./r1-migration-rehearsal";
import { asAuthenticated, createCommandFixture, rollbackCase, type SecurityCommandFixture, type SecurityTokenPrincipal, type SecurityTransaction } from "./r1-security-command-fixtures";
import { invoke, read, seedQuoteWorkflow, syntheticQuote } from "./test/r6-proposal-quote-fixtures";

describe("Preserved portal quotes and independently approved multi-vendor comparisons",()=>{
  let context: RehearsalContext | undefined;
  let fixture: SecurityCommandFixture;
  let target: Awaited<ReturnType<typeof seedQuoteWorkflow>>;
  beforeAll(async()=>{
    context=await startRehearsal("r6-quotes"); await applyAllMigrations(context);
    ({ fixture,target }=await context.client.begin(async(sql)=>{
      const fixture=await createCommandFixture(sql);
      return { fixture,target:await seedQuoteWorkflow(sql,fixture) };
    }));
  },240000);
  afterAll(async()=>{if(context)await stopRehearsal(context);},180000);
  async function submit(sql:SecurityTransaction,index=0,expectedVersion=0,quote=syntheticQuote,key=randomUUID()){
    const vendor=target.vendors[index]!;
    return proposalQuoteResultSchema.parse(await invoke(sql,vendor.actor,"mmhr_record_proposal_quote",{
      action:"submit",organizationId:vendor.organizationId,recipientId:vendor.recipientId,expectedVersion,quote },"aal1",key));
  }
  async function decision(sql:SecurityTransaction,id:string,action:"review"|"approve"|"request_revision"|"withdraw",revision:number,actor:SecurityTokenPrincipal=fixture.pair[0],org=fixture.organizationId){
    return proposalQuoteResultSchema.parse(await invoke(sql,actor,"mmhr_record_proposal_quote",{
      action,organizationId:org,proposalVersionId:id,expectedRevision:revision,reason:"Synthetic quote decision",
      ...(action==="approve"?{approvalReference:"approval:synthetic-proposal"}:{}) }));
  }
  async function quotePage(sql:SecurityTransaction,view:"staff"|"customer"|"vendor",actor?:SecurityTokenPrincipal){
    const vendor=target.vendors[0]!;
    return proposalQuotePageSchema.parse(await read(sql,actor??(view==="staff"?fixture.pair[0]:view==="customer"?target.customer:vendor.actor),
      "mmhr_get_proposal_quotes",{organizationId:view==="vendor"?vendor.organizationId:fixture.organizationId,view,
        ...(view==="vendor"?{recipientId:vendor.recipientId}:{intakeId:target.intakeId})},view==="staff"?"aal2":"aal1"));
  }
  async function approveQuote(sql:SecurityTransaction,index=0){
    const quote=await submit(sql,index); await decision(sql,quote.proposalVersionId,"review",1);
    return decision(sql,quote.proposalVersionId,"approve",2,fixture.pair[1]);
  }
  async function prepareComparison(sql:SecurityTransaction,ids:string[]){
    return proposalComparisonResultSchema.parse(await invoke(sql,fixture.pair[0],"mmhr_record_proposal_quote_comparison",{
      action:"prepare",organizationId:fixture.organizationId,intakeId:target.intakeId,proposalVersionIds:ids,reason:"Compare synthetic quotes"}));
  }
  async function comparisonDecision(sql:SecurityTransaction,input:Awaited<ReturnType<typeof prepareComparison>>,actor=fixture.pair[1],action="approve"){
    return proposalComparisonResultSchema.parse(await invoke(sql,actor,"mmhr_record_proposal_quote_comparison",{
      action,organizationId:fixture.organizationId,comparisonId:input.comparisonId,expectedRevision:1,expectedDigest:input.sourceDigest,
      reason:"Synthetic independent comparison decision",...(action==="approve"?{approvalReference:"approval:synthetic-comparison"}:{})}));
  }
  async function comparisonPage(sql:SecurityTransaction,view:"staff"|"customer"){
    return proposalComparisonPageSchema.parse(await read(sql,view==="staff"?fixture.pair[0]:target.customer,"mmhr_get_proposal_quote_comparisons",{
      organizationId:fixture.organizationId,intakeId:target.intakeId,view},view==="staff"?"aal2":"aal1"));
  }
  test("preserves the original source and exposes pricing only after independent approval",async()=>{
    await rollbackCase(context!,async(sql)=>{
      const key=randomUUID(),first=await submit(sql,0,0,syntheticQuote,key);
      expect(await submit(sql,0,0,syntheticQuote,key)).toMatchObject({proposalVersionId:first.proposalVersionId,outcomeCode:"replayed"});
      expect((await quotePage(sql,"customer")).items).toEqual([]);
      expect((await quotePage(sql,"vendor")).items[0]).toMatchObject({quote:syntheticQuote,state:"received"});
      await expect(decision(sql,first.proposalVersionId,"approve",1,fixture.pair[1])).rejects.toMatchObject({code:"42501"});
      await decision(sql,first.proposalVersionId,"review",1);
      await expect(decision(sql,first.proposalVersionId,"approve",2)).rejects.toMatchObject({code:"42501"});
      await decision(sql,first.proposalVersionId,"approve",2,fixture.pair[1]);
      expect((await quotePage(sql,"customer")).items[0]).toMatchObject({state:"approved_for_comparison",quote:syntheticQuote,current:true,reason:null,canApprove:false});
      const [proof]=await sql`SELECT count(*)::integer events FROM public.proposal_quote_events WHERE proposal_version_id=${first.proposalVersionId}::uuid`;
      expect(proof!.events).toBe(3);
      await expect(sql.savepoint(async(probe)=>{await probe`UPDATE public.proposal_versions SET pricing='{}'::jsonb WHERE id=${first.proposalVersionId}::uuid`;})).rejects.toMatchObject({code:"42501"});
      await expect(sql.savepoint(async(probe)=>{await probe`DELETE FROM public.proposal_quote_sources WHERE proposal_version_id=${first.proposalVersionId}::uuid`;})).rejects.toMatchObject({code:"42501"});
    });
  });
  test("keeps approved pricing during a pending revision and supersedes it only on new approval",async()=>{
    await rollbackCase(context!,async(sql)=>{
      const first=await approveQuote(sql); const second=await submit(sql,0,1,{...syntheticQuote,quoteReference:"Second original quote"});
      expect((await quotePage(sql,"customer")).items).toHaveLength(1);
      await decision(sql,second.proposalVersionId,"review",1); await decision(sql,second.proposalVersionId,"approve",2,fixture.pair[1]);
      const page=await quotePage(sql,"customer"); expect(page.items).toHaveLength(2);
      expect(page.items.find((row)=>row.proposalVersionId===first.proposalVersionId)).toMatchObject({state:"superseded",quote:syntheticQuote,current:false});
      expect(page.items.find((row)=>row.proposalVersionId===second.proposalVersionId)).toMatchObject({state:"approved_for_comparison",current:true});
      await expect(invoke(sql,fixture.pair[0],"mmhr_record_proposal",{action:"review",organizationId:fixture.organizationId,
        actorIdentityId:fixture.pair[0].identityId,proposalId:second.proposalVersionId,status:"withdrawn"})).rejects.toMatchObject({code:"42501"});
    });
  });
  test("creates a comparison across different vendor deals and requires a separate decision",async()=>{
    await rollbackCase(context!,async(sql)=>{
      const left=await approveQuote(sql),right=await approveQuote(sql,1);
      const prepared=await prepareComparison(sql,[left.proposalVersionId,right.proposalVersionId]);
      expect((await comparisonPage(sql,"customer")).items).toEqual([]);
      await expect(comparisonDecision(sql,prepared,fixture.pair[0])).rejects.toMatchObject({code:"42501"});
      await comparisonDecision(sql,prepared);
      const page=await comparisonPage(sql,"customer"); expect(page.items).toHaveLength(1);
      expect(page.items[0]).toMatchObject({state:"approved",current:true,reason:null,sourceDigest:null,canApprove:false});
      expect(page.items[0]!.sources).toHaveLength(2);
      expect(JSON.stringify(page)).not.toMatch(/sourceHash|actorIdentityId|dealId|vendorOrganizationId/);
      const vendor=target.vendors[0]!;
      await decision(sql,left.proposalVersionId,"withdraw",3,vendor.actor,vendor.organizationId);
      expect((await comparisonPage(sql,"customer")).items[0]).toMatchObject({state:"approved",current:false});
      await expect(sql.savepoint(async(probe)=>{await probe`UPDATE public.proposal_quote_comparisons SET source_snapshot='[]'::jsonb WHERE id=${prepared.comparisonId}::uuid`;})).rejects.toMatchObject({code:"42501"});
    });
  });
  test("denies stale comparison sources, duplicate versions, same vendors, and mismatched currencies",async()=>{
    await rollbackCase(context!,async(sql)=>{
      const left=await approveQuote(sql),right=await approveQuote(sql,1);
      await expect(prepareComparison(sql,[left.proposalVersionId,left.proposalVersionId])).rejects.toMatchObject({code:"22023"});
      const prepared=await prepareComparison(sql,[left.proposalVersionId,right.proposalVersionId]);
      const vendor=target.vendors[1]!;
      await decision(sql,right.proposalVersionId,"withdraw",3,vendor.actor,vendor.organizationId);
      await expect(comparisonDecision(sql,prepared)).rejects.toMatchObject({code:"42501"});
      await comparisonDecision(sql,prepared,fixture.pair[1],"reject");
      const different=await submit(sql,1,1,{...syntheticQuote,pricing:{...syntheticQuote.pricing,currency:"EUR"}});
      await decision(sql,different.proposalVersionId,"review",1); await decision(sql,different.proposalVersionId,"approve",2,fixture.pair[1]);
      await expect(prepareComparison(sql,[left.proposalVersionId,different.proposalVersionId])).rejects.toMatchObject({code:"22023"});
    });
  },60000);
  test("retains approved customer history after recipient withdrawal and hides stale staff decisions",async()=>{
    await rollbackCase(context!,async(sql)=>{
      const approved=await approveQuote(sql),pending=await submit(sql,0,1),vendor=target.vendors[0]!;
      await decision(sql,pending.proposalVersionId,"review",1);
      await sql`UPDATE public.rfp_recipients SET state='withdrawn' WHERE id=${vendor.recipientId}::uuid`;
      expect((await quotePage(sql,"customer")).items).toEqual([expect.objectContaining({proposalVersionId:approved.proposalVersionId,current:false,quote:syntheticQuote})]);
      expect((await quotePage(sql,"staff",fixture.pair[1])).items.find((row)=>row.proposalVersionId===pending.proposalVersionId)).toMatchObject({canReview:false,canApprove:false});
      await expect(decision(sql,pending.proposalVersionId,"approve",2,fixture.pair[1])).rejects.toMatchObject({code:"42501"});
    });
  },60000);
  test("denies raw tables, low assurance staff, foreign recipients, viewer writes, and revoked replay",async()=>{
    await rollbackCase(context!,async(sql)=>{
      const vendor=target.vendors[0]!,key=randomUUID(),first=await submit(sql,0,0,syntheticQuote,key);
      await expect(invoke(sql,target.customer,"mmhr_record_proposal_quote",{action:"submit",organizationId:vendor.organizationId,
        recipientId:vendor.recipientId,expectedVersion:1,quote:syntheticQuote},"aal1")).rejects.toMatchObject({code:"42501"});
      await expect(invoke(sql,fixture.pair[0],"mmhr_record_proposal_quote",{action:"review",organizationId:fixture.organizationId,
        proposalVersionId:first.proposalVersionId,expectedRevision:1,reason:"Synthetic review"},"aal1")).rejects.toMatchObject({code:"42501"});
      await expect(read(sql,target.vendors[1]!.actor,"mmhr_get_proposal_quotes",{organizationId:target.vendors[1]!.organizationId,
        recipientId:vendor.recipientId,view:"vendor"},"aal1")).rejects.toMatchObject({code:"42501"});
      for(const table of ["proposal_quote_sources","proposal_quote_events","proposal_quote_comparisons"]){
        await expect(asAuthenticated(sql,vendor.actor,async(probe)=>probe`SELECT * FROM public.${probe(table)}`,"aal1")).rejects.toMatchObject({code:"42501"});
      }
      await sql`UPDATE public.org_members SET role='viewer',role_key='viewer' WHERE identity_id=${vendor.actor.identityId}::uuid AND org_id=${vendor.organizationId}::uuid`;
      expect((await quotePage(sql,"vendor")).items[0]!.canSubmit).toBe(false);
      await expect(submit(sql,0,0,syntheticQuote,key)).rejects.toMatchObject({code:"42501"});
      await sql`UPDATE public.org_members SET role='contributor',role_key='contributor' WHERE identity_id=${vendor.actor.identityId}::uuid AND org_id=${vendor.organizationId}::uuid`;
      await sql`DELETE FROM auth.sessions WHERE id=${vendor.actor.sessionId}::uuid`;
      await expect(submit(sql,0,0,syntheticQuote,key)).rejects.toMatchObject({code:"42501"});
    });
  });
  test("rejects unknown fields, fractional amounts, future dates, stale revisions, and inconsistent unknowns",async()=>{
    await rollbackCase(context!,async(sql)=>{
      const vendor=target.vendors[0]!;
      const input={action:"submit",organizationId:vendor.organizationId,recipientId:vendor.recipientId,expectedVersion:0,quote:syntheticQuote};
      for(const quote of [{...syntheticQuote,quoteDate:"2999-01-01"},{...syntheticQuote,pricing:{...syntheticQuote.pricing,recurringCostMinorUnits:1.5}},
        {...syntheticQuote,pricing:{...syntheticQuote.pricing,currency:null}},{...syntheticQuote,pricing:{...syntheticQuote.pricing,recurringCostBasis:null}}]){
        await expect(invoke(sql,vendor.actor,"mmhr_record_proposal_quote",{...input,quote},"aal1")).rejects.toMatchObject({code:"22023"});
      }
      await expect(invoke(sql,vendor.actor,"mmhr_record_proposal_quote",{...input,approvedByIdentityId:fixture.pair[0].identityId},"aal1")).rejects.toMatchObject({code:"22023"});
      const first=await submit(sql); await decision(sql,first.proposalVersionId,"review",1);
      await expect(decision(sql,first.proposalVersionId,"approve",1,fixture.pair[1])).rejects.toMatchObject({code:"42501"});
      await decision(sql,first.proposalVersionId,"request_revision",2);
      expect((await quotePage(sql,"customer")).items).toEqual([]);
    });
  });
  test("rolls back source, version, event, and receipt when the audit write fails",async()=>{
    await rollbackCase(context!,async(sql)=>{
      await sql`ALTER TABLE public.audit_events ADD CONSTRAINT synthetic_quote_audit_rejection CHECK(command<>'r6.proposal.quote.submit') NOT VALID`;
      await expect(submit(sql)).rejects.toMatchObject({code:"23514"});
      for(const table of ["proposal_quote_sources","proposal_versions","proposal_quote_events"]){
        const [proof]=await sql`SELECT count(*)::integer count FROM public.${sql(table)}`;
        expect(proof!.count).toBe(0);
      }
      const [proof]=await sql`SELECT count(*)::integer count FROM public.security_command_receipts WHERE command LIKE 'r6.proposal.quote.%'`;
      expect(proof!.count).toBe(0);
    });
  });
  test("preserves append-only decisions and denies changed idempotent requests",async()=>{
    await rollbackCase(context!,async(sql)=>{
      const key=randomUUID(),quote=await submit(sql,0,0,syntheticQuote,key);
      await expect(submit(sql,0,0,{...syntheticQuote,quoteReference:"Changed request"},key)).rejects.toMatchObject({code:"22023"});
      await decision(sql,quote.proposalVersionId,"review",1);
      await expect(sql.savepoint(async(probe)=>{await probe`UPDATE public.proposal_quote_events SET action='approve' WHERE proposal_version_id=${quote.proposalVersionId}::uuid`;})).rejects.toMatchObject({code:"P0001",message:expect.stringContaining("append-only")});
      await expect(sql.savepoint(async(probe)=>{await probe`DELETE FROM public.proposal_quote_events WHERE proposal_version_id=${quote.proposalVersionId}::uuid`;})).rejects.toMatchObject({code:"P0001",message:expect.stringContaining("append-only")});
      await expect(sql.savepoint(async(probe)=>{await probe`TRUNCATE public.proposal_quote_events`;})).rejects.toMatchObject({code:"P0001",message:expect.stringContaining("append-only")});
      const vendor=target.vendors[0]!;
      await sql`UPDATE public.rfp_recipients SET state='withdrawn' WHERE id=${vendor.recipientId}::uuid`;
      await expect(submit(sql,0,0,syntheticQuote,key)).rejects.toMatchObject({code:"42501"});
    });
  });
});
