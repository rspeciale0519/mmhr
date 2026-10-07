import { randomUUID } from "node:crypto";
import { beforeEach, expect, test, vi } from "vitest";
import { AuthorizationError, requirePermission } from "@/server/auth/authorization";
import { getPortalContractHandoffHistory, getPortalContractHandoffs, recordPortalContractHandoff } from "./contract-handoff-portal";

vi.mock("@/server/auth/authorization",()=>({AuthorizationError:class extends Error{},requirePermission:vi.fn()}));
const organizationId=randomUUID(),correlationId=randomUUID(),intakeId=randomUUID(),recipientId=randomUUID();
const selectionId=randomUUID(),handoffId=randomUUID(),proposalVersionId=randomUUID(),comparisonId=randomUUID();
const rpc=vi.fn(),supabase={rpc} as never;
const metadata={organizationId,correlationId,idempotencyKey:randomUUID()};
const input={...metadata,action:"select",intakeId,comparisonId,proposalVersionId,expectedQuoteRevision:3,selectionReasons:["Approved fit"],remainingRisks:[]};
const result={organizationId,correlationId,selectionId,selectionState:"pending",selectionRevision:1,handoffId:null,status:null,revision:null,outcomeCode:"recorded"};
const item={selectionId,intakeId,recipientId,proposalVersionId,comparisonId,vendorName:"Synthetic vendor",quoteReference:"Synthetic quote",
  selectionReasons:["Approved fit"],remainingRisks:[],state:"pending",revision:1,selectedAt:"2026-01-01T00:00:00Z",decidedAt:null,
  decisionReason:null,current:true,canApprove:false,canReject:false,canWithdraw:true,handoffId:null,status:null,handoffRevision:null,
  introducedAt:null,introductionReference:null,signedAt:null,contractReference:null,canIntroduce:false,canUpdate:false,events:[],hasMoreHistory:false};
const page={organizationId,correlationId,items:[item],choices:[],canSelect:false,nextCursor:null};
beforeEach(()=>{
  vi.mocked(requirePermission).mockReset().mockImplementation(async(_permission,scope,options)=>({scope,correlationId:options!.correlationId!,identityId:randomUUID(),assurance:"aal2",supabase}));
  rpc.mockReset().mockResolvedValue({error:null,data:result});
});
test("binds a customer decision to scoped verified authority without caller actors",async()=>{
  await expect(recordPortalContractHandoff(input)).resolves.toEqual(result);
  expect(requirePermission).toHaveBeenCalledWith("portal.customer.access",{kind:"organization",organizationId},{correlationId});
  const {correlationId:correlation,idempotencyKey,...payload}=input;
  expect(rpc).toHaveBeenCalledWith("mmhr_record_portal_contract_handoff",{payload,correlation_id:correlation,idempotency_key:idempotencyKey});
  for(const field of ["actorIdentityId","approvedAt","vendorOrganizationId","dealId"]){
    await expect(recordPortalContractHandoff({...input,[field]:randomUUID()})).rejects.toThrow();
  }
});
test("requires assigned staff authority for independent approval",async()=>{
  const decision={...metadata,action:"approve_selection",selectionId,expectedRevision:1,reason:"Reviewed selection",approvalReference:"Synthetic approval"};
  rpc.mockResolvedValue({error:null,data:{...result,selectionState:"approved",selectionRevision:2,handoffId,status:"introduction_pending",revision:1}});
  await recordPortalContractHandoff(decision);
  expect(requirePermission).toHaveBeenLastCalledWith("rfp.approve",{kind:"organization",organizationId},{correlationId});
});
test.each([{organizationId:randomUUID()},{correlationId:randomUUID()},{selectionState:"rejected",selectionRevision:2},{outcomeCode:"recorded",status:"introduced",handoffId,revision:2}])(
  "rejects altered recorded result bindings %#",async(patch)=>{
    rpc.mockResolvedValue({error:null,data:{...result,...patch}});
    await expect(recordPortalContractHandoff(input)).rejects.toThrow();
  });
test("retains complete entity bindings during a later-state replay",async()=>{
  const decision={...metadata,action:"approve_selection",selectionId,expectedRevision:1,reason:"Reviewed selection",approvalReference:"Synthetic approval"};
  rpc.mockResolvedValue({error:null,data:{...result,selectionState:"approved",selectionRevision:2,handoffId,status:"negotiating",revision:3,outcomeCode:"replayed"}});
  await expect(recordPortalContractHandoff(decision)).resolves.toMatchObject({status:"negotiating",revision:3});
  rpc.mockResolvedValue({error:null,data:{...result,selectionId:randomUUID(),selectionState:"approved",selectionRevision:2,handoffId,status:"negotiating",revision:3,outcomeCode:"replayed"}});
  await expect(recordPortalContractHandoff(decision)).rejects.toThrow("Invalid contract handoff result");
});
test("rejects illegal terminal transitions before any authorization request",async()=>{
  await expect(recordPortalContractHandoff({...metadata,action:"transition",handoffId,expectedRevision:4,reason:"Reopen",fromStatus:"signed",toStatus:"negotiating"})).rejects.toThrow("Invalid contract handoff transition");
  expect(requirePermission).not.toHaveBeenCalled();
  expect(rpc).not.toHaveBeenCalled();
});
test("maps authorization rejection and keeps database failure details private",async()=>{
  rpc.mockResolvedValueOnce({error:{code:"42501",message:"private association"}});
  await expect(recordPortalContractHandoff(input)).rejects.toBeInstanceOf(AuthorizationError);
  rpc.mockResolvedValueOnce({error:{code:"XX000",message:"private contract reference"}});
  await expect(recordPortalContractHandoff(input)).rejects.toThrow("Contract handoff request failed");
});
test("rejects an authorization context with a different organization or correlation",async()=>{
  for(const patch of [{scope:{kind:"organization",organizationId:randomUUID()}},{correlationId:randomUUID()}]){
    vi.mocked(requirePermission).mockResolvedValue({scope:{kind:"organization",organizationId},correlationId,supabase,...patch} as never);
    await expect(recordPortalContractHandoff(input)).rejects.toBeInstanceOf(AuthorizationError);
  }
  expect(rpc).not.toHaveBeenCalled();
});
test("reads the customer's own decision without staff action controls",async()=>{
  rpc.mockResolvedValue({error:null,data:page});
  await expect(getPortalContractHandoffs({organizationId,correlationId,view:"customer",intakeId})).resolves.toEqual(page);
  for(const patch of [{intakeId:randomUUID()},{canApprove:true},{canReject:true},{decisionReason:"Internal review"},{selectedByIdentityId:randomUUID()}]){
    rpc.mockResolvedValue({error:null,data:{...page,items:[{...item,...patch}]}});
    await expect(getPortalContractHandoffs({organizationId,correlationId,view:"customer",intakeId})).rejects.toThrow();
  }
});
test("hides pending customer selections from a vendor",async()=>{
  rpc.mockResolvedValue({error:null,data:{...page,items:[{...item,canWithdraw:false}]}});
  await expect(getPortalContractHandoffs({organizationId,correlationId,view:"vendor",recipientId})).rejects.toThrow("Invalid contract handoff page");
});
test("rejects foreign recipient reads and fabricated pagination",async()=>{
  const approved={...item,state:"approved",revision:2,decidedAt:"2026-01-01T01:00:00Z",handoffId,status:"introduction_pending",handoffRevision:1,canWithdraw:false,selectionReasons:[],remainingRisks:[]};
  for(const patch of [{items:[{...approved,recipientId:randomUUID()}]},{items:[approved,approved]},{nextCursor:selectionId}]){
    rpc.mockResolvedValue({error:null,data:{...page,items:[approved],...patch}});
    await expect(getPortalContractHandoffs({organizationId,correlationId,view:"vendor",recipientId})).rejects.toThrow();
  }
});
test("does not disclose customer selection reasons or risks to the selected vendor",async()=>{
  const approved={...item,state:"approved",revision:2,decidedAt:"2026-01-01T01:00:00Z",handoffId,status:"introduction_pending",handoffRevision:1,canWithdraw:false,selectionReasons:[],remainingRisks:[]};
  const read={organizationId,correlationId,view:"vendor",recipientId};
  rpc.mockResolvedValue({error:null,data:{...page,items:[approved]}});
  await expect(getPortalContractHandoffs(read)).resolves.toMatchObject({items:[{selectionReasons:[],remainingRisks:[]}]});
  for(const patch of [{selectionReasons:["Private customer decision"]},{remainingRisks:["Private customer risk"]}]){
    rpc.mockResolvedValue({error:null,data:{...page,items:[{...approved,...patch}]}});
    await expect(getPortalContractHandoffs(read)).rejects.toThrow("Invalid contract handoff page");
  }
});
test("checks introduction and signed outcome associations, revisions, and states",async()=>{
  for(const action of ["introduce","record_signed"] as const){
    const command={...metadata,action,handoffId,expectedRevision:action==="introduce"?1:3,reason:"Synthetic business record",
      ...(action==="introduce"?{introducedAt:"2026-01-01T02:00:00Z",introductionReference:"Synthetic introduction"}:{signedAt:"2026-01-01T03:00:00Z",contractReference:"Synthetic contract"})};
    const saved={...result,selectionState:"approved",selectionRevision:2,handoffId,status:action==="introduce"?"introduced":"signed",revision:command.expectedRevision+1};
    rpc.mockResolvedValue({error:null,data:saved});
    await expect(recordPortalContractHandoff(command)).resolves.toEqual(saved);
    for(const patch of [{handoffId:randomUUID()},{revision:command.expectedRevision},{status:"cancelled"}]){
      rpc.mockResolvedValue({error:null,data:{...saved,...patch}});
      await expect(recordPortalContractHandoff(command)).rejects.toThrow("Invalid contract handoff result");
    }
  }
});
test("preserves separate scoped history pages and descending revision order",async()=>{
  const event={eventId:randomUUID(),revision:4,fromStatus:"negotiating",toStatus:"signed",reason:"Both parties signed",occurredAt:"2026-01-01T04:00:00Z"};
  const history={organizationId,correlationId,handoffId,events:[event],nextRevision:null};
  const read={organizationId,correlationId,view:"customer",intakeId,handoffId,beforeRevision:5};
  rpc.mockResolvedValue({error:null,data:history});
  await expect(getPortalContractHandoffHistory(read)).resolves.toEqual(history);
  for(const patch of [{handoffId:randomUUID()},{events:[event,event]},{nextRevision:4},{events:[{...event,revision:5}]},{events:[{...event,actorIdentityId:randomUUID()}]}]){
    rpc.mockResolvedValue({error:null,data:{...history,...patch}});
    await expect(getPortalContractHandoffHistory(read)).rejects.toThrow();
  }
});
