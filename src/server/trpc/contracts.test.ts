import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { appRouter } from "./root";
import type { Context } from "./trpc";
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
const subject=randomUUID(),identityId=randomUUID(),organizationId=randomUUID(),correlationId=randomUUID(),intakeId=randomUUID(),recipientId=randomUUID(),selectionId=randomUUID(),handoffId=randomUUID();
const origin="https://mmhr.example",rpc=vi.fn(),getClaims=vi.fn();
const metadata={organizationId,correlationId,idempotencyKey:randomUUID()};
const selected={...metadata,action:"select" as const,intakeId,comparisonId:null,proposalVersionId:randomUUID(),expectedQuoteRevision:3,selectionReasons:["Synthetic customer scope"],remainingRisks:[]};
function caller(overrides:Partial<Context>={}){return appRouter.createCaller({user:{id:subject},supabase:{auth:{getClaims},rpc} as never,transport:{method:"POST",origin},...overrides}).contracts;}
beforeEach(()=>{
  vi.stubEnv("NEXT_PUBLIC_APP_URL",origin);getClaims.mockReset().mockResolvedValue({data:{claims:{sub:subject,aal:"aal2"}},error:null});
  rpc.mockReset().mockImplementation(async(name,args)=>{
    if(name==="mmhr_authorize")return {data:[{identity_id:identityId,authorized_organization_id:args.organization_id,assurance:"aal2"}],error:null};
    if(name==="mmhr_get_portal_contract_handoffs")return {data:{organizationId,correlationId,items:[],choices:[],canSelect:false,nextCursor:null},error:null};
    if(name==="mmhr_get_portal_contract_handoff_history")return {data:{organizationId,correlationId,handoffId,events:[],nextRevision:null},error:null};
    const action=args.payload.action,approved=["approve_selection","introduce","transition","record_signed"].includes(action);
    return {data:{organizationId,correlationId,selectionId,selectionState:approved?"approved":action==="select"?"pending":action==="withdraw_selection"?"withdrawn":"rejected",
      selectionRevision:action==="select"?1:2,handoffId:approved?handoffId:null,status:action==="approve_selection"?"introduction_pending":action==="introduce"?"introduced":action==="record_signed"?"signed":action==="transition"?args.payload.toStatus:null,
      revision:action==="approve_selection"?1:approved?args.payload.expectedRevision+1:null,outcomeCode:"recorded"},error:null};
  });
});
afterEach(()=>vi.unstubAllEnvs());
test("records a customer decision without caller approval identities or dates",async()=>{
  await expect(caller().select(selected)).resolves.toMatchObject({selectionId,selectionState:"pending"});
  expect(rpc.mock.calls.filter(([name])=>name==="mmhr_authorize").every(([,args])=>args.permission_key==="portal.customer.access")).toBe(true);
  expect(rpc.mock.calls.find(([name])=>name==="mmhr_record_portal_contract_handoff")![1].payload).toEqual(expect.objectContaining({comparisonId:null,intakeId}));
});
test.each([undefined,{method:"GET",origin},{method:"POST",origin:null},{method:"POST",origin:"https://wrong.example"}])("blocks unsafe mutation transport %#",async transport=>{
  await expect(caller({transport}).select(selected)).rejects.toMatchObject({code:"FORBIDDEN"});expect(rpc).not.toHaveBeenCalled();
});
test("blocks anonymous requests and injected approval fields",async()=>{
  await expect(caller({user:null}).select(selected)).rejects.toMatchObject({code:"UNAUTHORIZED"});
  await expect(caller().select({...selected,approvedByIdentityIds:[identityId]} as never)).rejects.toMatchObject({code:"BAD_REQUEST"});expect(rpc).not.toHaveBeenCalled();
});
test("uses customer authority for withdrawal and staff authority for decisions",async()=>{
  await caller().withdraw({...metadata,selectionId,expectedRevision:1,action:"withdraw_selection",reason:"Synthetic customer withdrawal"});
  expect(rpc.mock.calls.filter(([name])=>name==="mmhr_authorize").every(([,args])=>args.permission_key==="portal.customer.access")).toBe(true);rpc.mockClear();
  await caller().approve({...metadata,selectionId,expectedRevision:1,action:"approve_selection",reason:"Independent staff decision",approvalReference:"Synthetic staff receipt"});
  await caller().reject({...metadata,selectionId,expectedRevision:1,action:"reject_selection",reason:"Synthetic unresolved risk"});
  expect(rpc.mock.calls.filter(([name])=>name==="mmhr_authorize").every(([,args])=>args.permission_key==="rfp.approve")).toBe(true);
});
test("requires staff authority for dated introduction and signed outcomes",async()=>{
  await caller().introduce({...metadata,handoffId,expectedRevision:1,action:"introduce",reason:"Both parties introduced",introducedAt:new Date().toISOString(),introductionReference:"Synthetic email receipt"});
  await caller().transition({...metadata,handoffId,expectedRevision:2,action:"transition",fromStatus:"introduced",toStatus:"negotiating",reason:"Parties negotiate directly"});
  await caller().recordSigned({...metadata,handoffId,expectedRevision:3,action:"record_signed",reason:"Parties report signed outcome",signedAt:new Date().toISOString(),contractReference:"Synthetic contract reference"});
  expect(rpc.mock.calls.filter(([name])=>name==="mmhr_authorize").every(([,args])=>args.permission_key==="rfp.approve")).toBe(true);
});
test("rejects low assurance staff decisions before the database call",async()=>{
  getClaims.mockResolvedValue({data:{claims:{sub:subject,aal:"aal1"}},error:null});
  await expect(caller().approve({...metadata,selectionId,expectedRevision:1,action:"approve_selection",reason:"Synthetic approval",approvalReference:"Synthetic receipt"})).rejects.toMatchObject({code:"NOT_FOUND"});expect(rpc).not.toHaveBeenCalled();
});
test.each(["customer","staff","vendor"] as const)("binds %s reads and history to the fixed portal view",async view=>{
  const scope=view==="vendor"?{organizationId,correlationId,view,recipientId}:{organizationId,correlationId,view,intakeId};
  const reads=caller({transport:{method:"GET",origin:null}});
  if(view==="vendor"){await reads.vendor(scope as never);await reads.vendorHistory({...scope,handoffId} as never);}
  else if(view==="staff"){await reads.staff(scope as never);await reads.staffHistory({...scope,handoffId} as never);}
  else {await reads.customer(scope as never);await reads.customerHistory({...scope,handoffId} as never);}
  expect(rpc.mock.calls.filter(([name])=>name==="mmhr_authorize").every(([,args])=>args.permission_key===(view==="staff"?"rfp.approve":`portal.${view}.access`))).toBe(true);
  await expect(reads[view]({...scope,view:view==="vendor"?"staff":"vendor"} as never)).rejects.toMatchObject({code:"BAD_REQUEST"});
});
test("hides database authorization details",async()=>{
  const original=rpc.getMockImplementation()!;rpc.mockImplementation(async(name,args)=>name==="mmhr_authorize"?original(name,args):{data:null,error:{code:"42501",message:"Private contract record"}});
  await expect(caller().select(selected)).rejects.toMatchObject({code:"NOT_FOUND",message:"Contract handoff request failed"});
});
