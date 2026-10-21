import { randomUUID } from "node:crypto";
import { afterEach,beforeEach,expect,test,vi } from "vitest";
import { appRouter } from "./root";
import type { Context } from "./trpc";
vi.mock("@/lib/supabase/server",()=>({createClient:vi.fn()}));
const subject=randomUUID(),identityId=randomUUID(),organizationId=randomUUID(),correlationId=randomUUID(),recipientId=randomUUID(),proposalVersionId=randomUUID(),intakeId=randomUUID(),comparisonId=randomUUID();
const origin="https://mmhr.example",rpc=vi.fn(),getClaims=vi.fn(),digest="a".repeat(64);
const metadata={organizationId,correlationId,idempotencyKey:randomUUID()};
const quote={quoteReference:"Synthetic original",quoteDate:null,quoteSummary:"Synthetic scope",pricing:{currency:"USD",implementationCostMinorUnits:null,recurringCostMinorUnits:null,
  recurringPeriod:null,recurringCostBasis:null,optionalCostMinorUnits:null,optionalCostDescription:null,discountMinorUnits:null,discountDescription:null,termMonths:null,termsAndAssumptions:[],customerRequestedChanges:[]}};
const submit={...metadata,action:"submit" as const,recipientId,expectedVersion:0,quote};
function caller(overrides:Partial<Context>={}){return appRouter.createCaller({user:{id:subject},supabase:{auth:{getClaims},rpc} as never,transport:{method:"POST",origin},...overrides}).proposals;}
beforeEach(()=>{
  vi.stubEnv("NEXT_PUBLIC_APP_URL",origin);
  getClaims.mockReset().mockResolvedValue({data:{claims:{sub:subject,aal:"aal2"}},error:null});
  rpc.mockReset().mockImplementation(async(name,args)=>{
    if(name==="mmhr_authorize")return{data:[{identity_id:identityId,authorized_organization_id:args.organization_id,assurance:"aal2"}],error:null};
    if(name==="mmhr_get_proposal_quotes")return{data:{organizationId,correlationId,items:[],nextCursor:null,submission:args.payload.view==="vendor"?{eligible:true,expectedVersion:0}:null},error:null};
    if(name==="mmhr_get_proposal_quote_comparisons")return{data:{organizationId,correlationId,items:[],nextCursor:null},error:null};
    if(name==="mmhr_record_proposal_quote_comparison")return{data:{organizationId,correlationId,comparisonId,state:args.payload.action==="prepare"?"draft":args.payload.action==="approve"?"approved":"rejected",
      revision:args.payload.action==="prepare"?1:2,sourceDigest:digest,outcomeCode:"recorded"},error:null};
    const states={submit:"received",review:"under_review",approve:"approved_for_comparison",request_revision:"revision_requested",withdraw:"withdrawn"} as const;
    return{data:{organizationId,correlationId,proposalVersionId,state:states[args.payload.action as keyof typeof states],revision:args.payload.action==="submit"?1:args.payload.expectedRevision+1,outcomeCode:"recorded"},error:null};
  });
});
afterEach(()=>vi.unstubAllEnvs());
test("submits using vendor authority without a caller actor, date, or deal",async()=>{
  await expect(caller().submit(submit)).resolves.toMatchObject({proposalVersionId});
  expect(rpc.mock.calls.filter(([name])=>name==="mmhr_authorize").map(([,args])=>args.permission_key)).toEqual(["portal.vendor.access","portal.vendor.access"]);
  const payload=rpc.mock.calls.find(([name])=>name==="mmhr_record_proposal_quote")![1].payload;
  expect(payload).toMatchObject({recipientId,quote});expect(payload).not.toHaveProperty("actorIdentityId");expect(payload).not.toHaveProperty("receivedAt");expect(payload).not.toHaveProperty("dealId");
});
test.each([undefined,{method:"GET",origin},{method:"POST",origin:null},{method:"POST",origin:"https://wrong.example"}])("blocks unsafe mutation transport %#",async(transport)=>{
  await expect(caller({transport}).submit(submit)).rejects.toMatchObject({code:"FORBIDDEN"});expect(rpc).not.toHaveBeenCalled();
});
test("blocks anonymous callers and injected actor fields",async()=>{
  await expect(caller({user:null}).submit(submit)).rejects.toMatchObject({code:"UNAUTHORIZED"});
  await expect(caller().submit({...submit,actorIdentityId:identityId} as never)).rejects.toMatchObject({code:"BAD_REQUEST"});expect(rpc).not.toHaveBeenCalled();
});
test("uses staff authority for review, approval, and revision requests",async()=>{
  const common={...metadata,proposalVersionId,reason:"Synthetic reviewed source",expectedRevision:1};
  await caller().review({...common,action:"review"});
  await caller().approve({...common,action:"approve",expectedRevision:2,approvalReference:"approval:synthetic"});
  await caller().requestRevision({...common,action:"request_revision",expectedRevision:2});
  expect(rpc.mock.calls.filter(([name])=>name==="mmhr_authorize").every(([,args])=>args.permission_key==="rfp.approve")).toBe(true);
  getClaims.mockResolvedValue({data:{claims:{sub:subject,aal:"aal1"}},error:null});rpc.mockClear();
  await expect(caller().review({...common,action:"review"})).rejects.toMatchObject({code:"NOT_FOUND"});expect(rpc).not.toHaveBeenCalled();
});
test("withdraws only through vendor authority",async()=>{
  await caller().withdraw({...metadata,proposalVersionId,expectedRevision:3,action:"withdraw",reason:"Synthetic withdrawal"});
  expect(rpc.mock.calls.filter(([name])=>name==="mmhr_authorize").every(([,args])=>args.permission_key==="portal.vendor.access")).toBe(true);
});
test("requires staff authority and exact sources for comparison preparation and decisions",async()=>{
  await caller().prepareComparison({...metadata,action:"prepare",intakeId,proposalVersionIds:[proposalVersionId,randomUUID()],reason:"Synthetic comparison"});
  const common={...metadata,comparisonId,expectedRevision:1 as const,expectedDigest:digest,reason:"Independent comparison decision"};
  await caller().approveComparison({...common,action:"approve",approvalReference:"approval:synthetic-comparison"});
  await caller().rejectComparison({...common,action:"reject"});
  expect(rpc.mock.calls.filter(([name])=>name==="mmhr_authorize").every(([,args])=>args.permission_key==="rfp.approve")).toBe(true);
});
test.each(["vendor","staff","customer"] as const)("binds %s reads to a fixed view and current scope",async(view)=>{
  const read={organizationId,correlationId},reads=caller({transport:{method:"GET",origin:null}});
  await (view==="vendor"?reads.vendor({...read,recipientId,view}):view==="staff"?reads.staff({...read,intakeId,view}):reads.customer({...read,intakeId,view}));
  const permission=view==="staff"?"rfp.approve":`portal.${view}.access`;
  expect(rpc.mock.calls.filter(([name])=>name==="mmhr_authorize").every(([,args])=>args.permission_key===permission)).toBe(true);
  await expect(reads[view]({...read,view:view==="vendor"?"staff":"vendor",recipientId,intakeId} as never)).rejects.toMatchObject({code:"BAD_REQUEST"});
});
test("binds approved comparison reads to customer authority and denies a vendor view",async()=>{
  await caller({transport:{method:"GET",origin:null}}).customerComparisons({organizationId,correlationId,intakeId,view:"customer"});
  expect(rpc.mock.calls.filter(([name])=>name==="mmhr_authorize").every(([,args])=>args.permission_key==="portal.customer.access")).toBe(true);
  await expect(caller().staffComparisons({organizationId,correlationId,intakeId,view:"vendor"} as never)).rejects.toMatchObject({code:"BAD_REQUEST"});
});
test("hides private database errors",async()=>{
  const original=rpc.getMockImplementation()!;
  rpc.mockImplementation(async(name,args)=>name==="mmhr_authorize"?original(name,args):{error:{code:"42501",message:"Private quote"},data:null});
  await expect(caller().submit(submit)).rejects.toMatchObject({code:"NOT_FOUND",message:"Proposal request failed"});
});
