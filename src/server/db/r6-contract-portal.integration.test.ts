import { randomUUID } from "node:crypto";
import { afterAll,beforeAll,describe,expect,test } from "vitest";
import { applyAllMigrations,startRehearsal,stopRehearsal,type RehearsalContext } from "@/server/db/r1-migration-rehearsal";
import { asAuthenticated,createCommandFixture,createSecurityPrincipal,rollbackCase,type SecurityCommandFixture,type SecurityTransaction } from "@/server/db/r1-security-command-fixtures";
import { invoke,read,seedQuoteWorkflow,syntheticQuote } from "@/server/db/test/r6-proposal-quote-fixtures";
import { portalHandoffHistoryPageSchema,portalHandoffPageSchema,portalHandoffResultSchema } from "@/lib/contract-handoff-portal";
describe("Registered contract portal database controls",()=>{
  let context:RehearsalContext|undefined,fixture:SecurityCommandFixture,target:Awaited<ReturnType<typeof seedQuoteWorkflow>>,quoteId:string;
  beforeAll(async()=>{
    context=await startRehearsal("r6-contract-portal");await applyAllMigrations(context);
    ({fixture,target,quoteId}=await context.client.begin(async sql=>{
      const fixture=await createCommandFixture(sql),target=await seedQuoteWorkflow(sql,fixture),vendor=target.vendors[0]!;
      const quote=await invoke(sql,vendor.actor,"mmhr_record_proposal_quote",{action:"submit",organizationId:vendor.organizationId,recipientId:vendor.recipientId,expectedVersion:0,quote:syntheticQuote},"aal1");
      const id=String(quote.proposalVersionId);
      await invoke(sql,fixture.pair[0],"mmhr_record_proposal_quote",{action:"review",organizationId:fixture.organizationId,proposalVersionId:id,expectedRevision:1,reason:"Synthetic review"});
      await invoke(sql,fixture.pair[1],"mmhr_record_proposal_quote",{action:"approve",organizationId:fixture.organizationId,proposalVersionId:id,expectedRevision:2,reason:"Synthetic approval",approvalReference:"Synthetic original quote approval"});
      return {fixture,target,quoteId:id};
    }));
  },300000);
  afterAll(async()=>{if(context)await stopRehearsal(context);},180000);
  const selection=()=>({action:"select",organizationId:fixture.organizationId,intakeId:target.intakeId,comparisonId:null,proposalVersionId:quoteId,
    expectedQuoteRevision:3,selectionReasons:["Synthetic scope fits the customer requirements."],remainingRisks:["Private customer implementation concern."]});
  async function select(sql:SecurityTransaction,key=randomUUID(),payload=selection()){
    return portalHandoffResultSchema.parse(await invoke(sql,target.customer,"mmhr_record_portal_contract_handoff",payload,"aal1",key));
  }
  async function command(sql:SecurityTransaction,payload:object,key=randomUUID()){
    return portalHandoffResultSchema.parse(await invoke(sql,fixture.pair[0],"mmhr_record_portal_contract_handoff",{organizationId:fixture.organizationId,...payload},"aal2",key));
  }
  async function approve(sql:SecurityTransaction){const selected=await select(sql);return command(sql,{action:"approve_selection",selectionId:selected.selectionId,expectedRevision:1,reason:"Synthetic independent approval",approvalReference:"Synthetic staff approval"});}
  async function page(sql:SecurityTransaction,view:"customer"|"staff"|"vendor"){
    const vendor=target.vendors[0]!;return portalHandoffPageSchema.parse(await read(sql,view==="staff"?fixture.pair[0]:view==="customer"?target.customer:vendor.actor,
      "mmhr_get_portal_contract_handoffs",{organizationId:view==="vendor"?vendor.organizationId:fixture.organizationId,view,
        ...(view==="vendor"?{recipientId:vendor.recipientId}:{intakeId:target.intakeId})},view==="staff"?"aal2":"aal1"));
  }
  async function introduce(sql:SecurityTransaction){let result=await approve(sql);result=await command(sql,{action:"introduce",handoffId:result.handoffId,expectedRevision:1,
    reason:"Synthetic introduction sent to both parties",introducedAt:new Date().toISOString(),introductionReference:"Synthetic introduction email receipt"});return result;}
  test("shows one approved quote and keeps a pending customer decision private from vendors",async()=>rollbackCase(context!,async sql=>{
    expect(await page(sql,"customer")).toMatchObject({canSelect:true,choices:[{proposalVersionId:quoteId,comparisonId:null}]});
    const key=randomUUID(),selected=await select(sql,key);expect(await select(sql,key)).toMatchObject({selectionId:selected.selectionId,outcomeCode:"replayed"});
    await expect(select(sql,key,{...selection(),remainingRisks:[]})).rejects.toMatchObject({code:"22023"});
    expect(await page(sql,"customer")).toMatchObject({canSelect:false,items:[{state:"pending",canWithdraw:true,decisionReason:null}]});
    expect((await page(sql,"vendor")).items).toEqual([]);
    await expect(select(sql)).rejects.toMatchObject({code:"42501"});
  }));
  test("requires actual customer authority and separate current staff approval",async()=>rollbackCase(context!,async sql=>{
    await expect(invoke(sql,fixture.pair[0],"mmhr_record_portal_contract_handoff",selection())).rejects.toMatchObject({code:"42501"});
    const selected=await select(sql);const payload={action:"approve_selection",organizationId:fixture.organizationId,selectionId:selected.selectionId,expectedRevision:1,reason:"Synthetic approval",approvalReference:"Synthetic approval receipt"};
    await expect(invoke(sql,target.customer,"mmhr_record_portal_contract_handoff",payload,"aal1")).rejects.toMatchObject({code:"42501"});
    await expect(invoke(sql,fixture.pair[0],"mmhr_record_portal_contract_handoff",payload,"aal1")).rejects.toMatchObject({code:"42501"});
    await expect(invoke(sql,fixture.pair[0],"mmhr_record_portal_contract_handoff",{...payload,approvedByIdentityIds:[fixture.pair[0].identityId]})).rejects.toMatchObject({code:"22023"});
    const approved=await command(sql,payload);expect(approved).toMatchObject({selectionState:"approved",status:"introduction_pending",revision:1});
    expect((await page(sql,"vendor")).items[0]).toMatchObject({selectionReasons:[],remainingRisks:[],decisionReason:null,canUpdate:false});
    const [row]=await sql`SELECT approved_by_identity_ids FROM public.contract_handoffs WHERE id=${approved.handoffId}::uuid`;
    expect(row!.approved_by_identity_ids).toEqual([target.customer.identityId,fixture.pair[0].identityId]);
  }));
  test("withdraws or rejects a pending decision without deleting it",async()=>rollbackCase(context!,async sql=>{
    const first=await select(sql);await invoke(sql,target.customer,"mmhr_record_portal_contract_handoff",{action:"withdraw_selection",organizationId:fixture.organizationId,
      selectionId:first.selectionId,expectedRevision:1,reason:"Synthetic customer reconsidered"},"aal1");
    const second=await select(sql);await command(sql,{action:"reject_selection",selectionId:second.selectionId,expectedRevision:1,reason:"Synthetic unresolved risk"});
    expect((await page(sql,"customer")).items.map(i=>i.state).sort()).toEqual(["rejected","withdrawn"]);expect((await page(sql,"customer")).canSelect).toBe(true);
    await expect(command(sql,{action:"approve_selection",selectionId:second.selectionId,expectedRevision:1,reason:"Late approval",approvalReference:"Late receipt"})).rejects.toMatchObject({code:"42501"});
  }));
  test("rejects stale or withdrawn approved sources",async()=>rollbackCase(context!,async sql=>{
    const selected=await select(sql),vendor=target.vendors[0]!;await invoke(sql,vendor.actor,"mmhr_record_proposal_quote",{action:"withdraw",organizationId:vendor.organizationId,
      proposalVersionId:quoteId,expectedRevision:3,reason:"Synthetic vendor withdrew terms"},"aal1");
    expect((await page(sql,"staff")).items[0]).toMatchObject({current:false,canApprove:false,canReject:true});
    await expect(command(sql,{action:"approve_selection",selectionId:selected.selectionId,expectedRevision:1,reason:"Stale decision",approvalReference:"Stale receipt"})).rejects.toMatchObject({code:"42501"});
  }));
  test("requires dated introduction evidence before negotiation or signature",async()=>rollbackCase(context!,async sql=>{
    const approved=await approve(sql);
    await expect(command(sql,{action:"transition",handoffId:approved.handoffId,expectedRevision:1,fromStatus:"introduction_pending",toStatus:"negotiating",reason:"Skip introduction"})).rejects.toMatchObject({code:"42501"});
    await expect(command(sql,{action:"introduce",handoffId:approved.handoffId,expectedRevision:1,reason:"Future introduction",introducedAt:new Date(Date.now()+86400000).toISOString(),introductionReference:"Future receipt"})).rejects.toMatchObject({code:"42501"});
    await expect(command(sql,{action:"record_signed",handoffId:approved.handoffId,expectedRevision:1,reason:"Skip negotiation",signedAt:new Date().toISOString(),contractReference:"Synthetic contract"})).rejects.toMatchObject({code:"42501"});
  }));
  test("records a signed outcome once and keeps financial closure separate",async()=>rollbackCase(context!,async sql=>{
    let result=await introduce(sql);result=await command(sql,{action:"transition",handoffId:result.handoffId,expectedRevision:2,fromStatus:"introduced",toStatus:"negotiating",reason:"Parties negotiate directly"});
    const key=randomUUID(),signed={action:"record_signed",handoffId:result.handoffId,expectedRevision:3,reason:"Synthetic parties report their signed contract",signedAt:new Date().toISOString(),contractReference:"Synthetic signed contract reference"};
    result=await command(sql,signed,key);expect(result).toMatchObject({status:"signed",revision:4});expect(await command(sql,signed,key)).toMatchObject({status:"signed",revision:4,outcomeCode:"replayed"});
    const [row]=await sql`SELECT d.stage,d.status,d.contract_id,(SELECT count(*)::int FROM public.commission_events WHERE deal_id=d.id) commissions
      FROM public.deals d JOIN public.contract_handoffs h ON h.deal_id=d.id WHERE h.id=${result.handoffId}::uuid`;
    expect(row).toMatchObject({stage:"contracting",status:"open",commissions:0});expect(row!.contract_id).toBeTypeOf("string");
    await expect(command(sql,{action:"transition",handoffId:result.handoffId,expectedRevision:4,fromStatus:"signed",toStatus:"cancelled",reason:"Reopen terminal record"})).rejects.toMatchObject({code:"42501"});
    expect((await page(sql,"customer")).canSelect).toBe(false);expect((await page(sql,"customer")).items[0]).toMatchObject({status:"signed",hasMoreHistory:false,events:[{revision:4},{revision:3},{revision:2}]});
  }));
  test("advances each required deal stage once with the actual approving actor",async()=>rollbackCase(context!,async sql=>{
    const selected=await select(sql),key=randomUUID();
    const payload={action:"approve_selection",selectionId:selected.selectionId,expectedRevision:1,reason:"Synthetic independent approval",approvalReference:"Synthetic approval"};
    const approved=await command(sql,payload,key);
    await expect(command(sql,payload,key)).resolves.toMatchObject({outcomeCode:"replayed",handoffId:approved.handoffId});
    const history=await sql`SELECT h.from_stage,h.to_stage,h.from_status,h.to_status,h.expected_revision,h.actor_identity_id,
      h.occurred_at >= s.decided_at AS current_date FROM public.deal_stage_history h
      JOIN public.portal_contract_selections s ON s.deal_id=h.deal_id AND s.id=${selected.selectionId}::uuid
      WHERE h.deal_id=s.deal_id ORDER BY h.expected_revision`;
    expect(history.map(h=>[h.from_stage,h.to_stage])).toEqual([["evaluation","proposal"],["proposal","selection"],["selection","contracting"]]);
    for(const event of history)expect(event).toMatchObject({from_status:"open",to_status:"open",actor_identity_id:fixture.pair[0].identityId,current_date:true});
    const [deal]=await sql`SELECT stage,status,revision FROM public.deals WHERE id=(SELECT deal_id FROM public.contract_handoffs WHERE id=${approved.handoffId}::uuid)`;
    expect(deal).toMatchObject({stage:"contracting",status:"open",revision:Number(history[0]!.expected_revision)+3});
  }));
  test("denies legacy closure without changing the managed deal",async()=>rollbackCase(context!,async sql=>{
    const result=await approve(sql);
    const [deal]=await sql`SELECT * FROM public.deals WHERE id=(SELECT deal_id FROM public.contract_handoffs WHERE id=${result.handoffId}::uuid)`;
    await expect(invoke(sql,fixture.pair[0],"mmhr_record_deal",{action:"transition",organizationId:fixture.organizationId,
      dealId:deal!.id,actorIdentityId:fixture.pair[0].identityId,expectedRevision:deal!.revision,fromStage:"contracting",fromStatus:"open",
      toStage:"won",toStatus:"won",reason:"Bypass financial closure"})).rejects.toMatchObject({code:"42501"});
    const [current]=await sql`SELECT stage,status,revision FROM public.deals WHERE id=${String(deal!.id)}::uuid`;
    expect(current).toMatchObject({stage:"contracting",status:"open",revision:deal!.revision});
  }));
  test("rolls back handoff approval when the deal no longer has an eligible stage",async()=>rollbackCase(context!,async sql=>{
    const selected=await select(sql);
    const [before]=await sql`UPDATE public.deals SET stage='discovery' WHERE id=(SELECT deal_id FROM public.portal_contract_selections WHERE id=${selected.selectionId}::uuid)
      RETURNING id,revision`;
    await expect(command(sql,{action:"approve_selection",selectionId:selected.selectionId,expectedRevision:1,
      reason:"Synthetic outdated deal stage",approvalReference:"Synthetic approval"})).rejects.toMatchObject({code:"42501"});
    const [current]=await sql`SELECT s.state,s.revision,s.handoff_id,d.stage,d.revision AS deal_revision,
      (SELECT count(*)::int FROM public.contract_handoffs WHERE deal_id=d.id) AS handoffs,
      (SELECT count(*)::int FROM public.deal_stage_history WHERE deal_id=d.id) AS stages
      FROM public.portal_contract_selections s JOIN public.deals d ON d.id=s.deal_id WHERE s.id=${selected.selectionId}::uuid`;
    expect(current).toMatchObject({state:"pending",revision:1,handoff_id:null,stage:"discovery",deal_revision:before!.revision,handoffs:0,stages:0});
  }));
  test("preserves non-signed and cancelled outcomes and permits another decision",async()=>rollbackCase(context!,async sql=>{
    async function measured<T>(phase:string,operation:()=>Promise<T>):Promise<T>{
      const started=performance.now();
      try{return await operation();}
      finally{console.log("Contract outcome journey timing",{phase,milliseconds:Math.round(performance.now()-started)});}
    }
    let result=await measured("first selection approval and introduction",()=>introduce(sql));
    result=await measured("first negotiation",()=>command(sql,{action:"transition",handoffId:result.handoffId,expectedRevision:2,fromStatus:"introduced",toStatus:"negotiating",reason:"Synthetic negotiation"}));
    await measured("first not-signed outcome",()=>command(sql,{action:"transition",handoffId:result.handoffId,expectedRevision:3,fromStatus:"negotiating",toStatus:"not_signed",reason:"Synthetic agreement not reached"}));
    const next=await measured("second selection and approval",()=>approve(sql));
    await measured("second cancelled outcome",()=>command(sql,{action:"transition",handoffId:next.handoffId,expectedRevision:1,fromStatus:"introduction_pending",toStatus:"cancelled",reason:"Synthetic customer cancelled"}));
    expect((await measured("preserved customer outcomes",()=>page(sql,"customer"))).items.map(i=>i.status).sort()).toEqual(["cancelled","not_signed"]);
    expect((await measured("customer can make another decision",()=>page(sql,"customer"))).canSelect).toBe(true);
  // Eight commands and two reads each perform modeled Auth round trips; keep the composed journey budget separate from request limits.
  }),120000);
  test("pages immutable status history and redacts internal reasons",async()=>rollbackCase(context!,async sql=>{
    let result=await introduce(sql);result=await command(sql,{action:"transition",handoffId:result.handoffId,expectedRevision:2,fromStatus:"introduced",toStatus:"negotiating",reason:"Private staff context"});
    for(let i=0;i<26;i++){const next=result.status==="negotiating"?"stalled":"negotiating";result=await command(sql,{action:"transition",handoffId:result.handoffId,expectedRevision:result.revision,fromStatus:result.status,toStatus:next,reason:"Private internal staff reason"});}
    expect((await page(sql,"customer")).items[0]).toMatchObject({hasMoreHistory:true,events:[{reason:"Contract status updated."},{reason:"Contract status updated."},{reason:"Contract status updated."}]});
    const input={organizationId:fixture.organizationId,view:"customer",intakeId:target.intakeId,handoffId:result.handoffId};
    const first=portalHandoffHistoryPageSchema.parse(await read(sql,target.customer,"mmhr_get_portal_contract_handoff_history",input,"aal1"));
    expect(first.events).toHaveLength(25);expect(first.nextRevision).toBe(first.events.at(-1)!.revision);
    const second=portalHandoffHistoryPageSchema.parse(await read(sql,target.customer,"mmhr_get_portal_contract_handoff_history",{...input,beforeRevision:first.nextRevision},"aal1"));
    expect(second.events).toHaveLength(3);expect(second.nextRevision).toBeNull();expect(new Set([...first.events,...second.events].map(e=>e.eventId)).size).toBe(28);
  }),180000);
  test("blocks raw writes and legacy commands against managed handoffs",async()=>rollbackCase(context!,async sql=>{
    const result=await approve(sql);
    await expect(invoke(sql,fixture.pair[0],"mmhr_record_contract_handoff",{action:"transition",organizationId:fixture.organizationId,
      actorIdentityId:fixture.pair[0].identityId,handoffId:result.handoffId,fromStatus:"introduction_pending",toStatus:"introduced",expectedRevision:1,
      reason:"Legacy bypass",occurredAt:new Date().toISOString()})).rejects.toMatchObject({code:"42501"});
    await expect(sql.savepoint(async probe=>probe`UPDATE public.contract_handoffs SET status='signed',revision=2 WHERE id=${result.handoffId}::uuid`)).rejects.toMatchObject({code:"42501"});
    await expect(asAuthenticated(sql,target.customer,async probe=>probe`SELECT * FROM public.portal_contract_selections`)).rejects.toMatchObject({code:"42501"});
    await expect(sql.savepoint(async probe=>probe`DELETE FROM public.portal_contract_selections WHERE id=${result.selectionId}::uuid`)).rejects.toMatchObject({code:"42501"});
  }));
  test("denies foreign recipient, intake, expired session and global recovery reads",async()=>rollbackCase(context!,async sql=>{
    const result=await introduce(sql),vendor=target.vendors[1]!;
    await expect(read(sql,vendor.actor,"mmhr_get_portal_contract_handoff_history",{organizationId:vendor.organizationId,view:"vendor",recipientId:vendor.recipientId,handoffId:result.handoffId},"aal1")).rejects.toMatchObject({code:"42501"});
    await expect(read(sql,target.customer,"mmhr_get_portal_contract_handoffs",{organizationId:fixture.organizationId,view:"customer",intakeId:randomUUID()},"aal1")).rejects.toMatchObject({code:"42501"});
    await sql`UPDATE auth.sessions SET not_after=clock_timestamp()-interval '1 minute' WHERE id=${target.customer.sessionId}::uuid`;
    await expect(page(sql,"customer")).rejects.toMatchObject({code:"42501"});
    const recovering=await createSecurityPrincipal(sql);await sql`UPDATE public.identities SET status='recovery_pending' WHERE id=${recovering.identityId}::uuid`;
    await expect(page(sql,"staff")).rejects.toMatchObject({code:"42501"});
  }));
});
