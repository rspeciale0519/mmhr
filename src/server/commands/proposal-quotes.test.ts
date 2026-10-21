import { randomUUID } from "node:crypto";
import { beforeEach, expect, test, vi } from "vitest";
import { AuthorizationError, requirePermission } from "@/server/auth/authorization";
import { getProposalComparisons, getProposalQuotes, recordProposalComparison, recordProposalQuote } from "./proposal-quotes";

vi.mock("@/server/auth/authorization",()=>({AuthorizationError:class extends Error{},requirePermission:vi.fn()}));
const organizationId=randomUUID(),correlationId=randomUUID(),recipientId=randomUUID(),intakeId=randomUUID(),proposalVersionId=randomUUID(),comparisonId=randomUUID();
const rpc=vi.fn(),supabase={rpc} as never;
const quote={quoteReference:"Synthetic quote",quoteDate:null,quoteSummary:"Synthetic original terms",pricing:{currency:"USD",
  implementationCostMinorUnits:100,recurringCostMinorUnits:null,recurringPeriod:null,recurringCostBasis:null,
  optionalCostMinorUnits:null,optionalCostDescription:null,discountMinorUnits:null,discountDescription:null,termMonths:null,
  termsAndAssumptions:[],customerRequestedChanges:[]}};
const input={action:"submit",organizationId,correlationId,recipientId,expectedVersion:0,quote,idempotencyKey:randomUUID()};
const result={organizationId,correlationId,proposalVersionId,state:"received",revision:1,outcomeCode:"recorded"};
const row={proposalVersionId,recipientId,intakeId,versionNumber:1,revision:3,state:"approved_for_comparison",quote,
  receivedAt:"2026-01-01T00:00:00Z",reviewedAt:"2026-01-01T01:00:00Z",approvedAt:"2026-01-01T02:00:00Z",
  vendorName:"Synthetic vendor",current:true,latest:true,reason:null,canSubmit:false,canReview:false,canApprove:false};
const page={organizationId,correlationId,items:[row],nextCursor:null,submission:null};
const digest="a".repeat(64),source={proposalVersionId,versionNumber:1,vendorName:"Synthetic vendor",quote,receivedAt:row.receivedAt,approvedAt:row.approvedAt};
const source2={...source,proposalVersionId:randomUUID()};
const sources=[source,source2].sort((a,b)=>a.proposalVersionId.localeCompare(b.proposalVersionId));
const comparisonRow={comparisonId,intakeId,state:"approved",revision:2,createdAt:row.receivedAt,decidedAt:row.approvedAt,
  current:true,canApprove:false,canReject:false,reason:null,sourceDigest:null,sources};
beforeEach(()=>{
  vi.mocked(requirePermission).mockReset().mockImplementation(async(_permission,scope,options)=>({scope,correlationId:options!.correlationId!,identityId:randomUUID(),assurance:"aal2",supabase}));
  rpc.mockReset().mockResolvedValue({error:null,data:result});
});
test("binds submission to vendor authority and never forwards caller identity or received dates",async()=>{
  await expect(recordProposalQuote(input)).resolves.toEqual(result);
  expect(requirePermission).toHaveBeenCalledWith("portal.vendor.access",{kind:"organization",organizationId},{correlationId});
  const {correlationId:correlation,idempotencyKey,...payload}=input;
  expect(rpc).toHaveBeenCalledWith("mmhr_record_proposal_quote",{payload,correlation_id:correlation,idempotency_key:idempotencyKey});
  for(const field of ["actorIdentityId","receivedAt","dealId","approvedByIdentityId"]){
    await expect(recordProposalQuote({...input,[field]:randomUUID()})).rejects.toThrow();
  }
});
test("requires staff approval authority and checks the returned association, state, and revision",async()=>{
  const decision={action:"approve",organizationId,correlationId,idempotencyKey:randomUUID(),proposalVersionId,expectedRevision:2,
    reason:"Independent synthetic approval",approvalReference:"approval:synthetic"};
  rpc.mockResolvedValue({error:null,data:{...result,state:"approved_for_comparison",revision:3}});
  await recordProposalQuote(decision);
  expect(requirePermission).toHaveBeenLastCalledWith("rfp.approve",{kind:"organization",organizationId},{correlationId});
  for(const patch of [{organizationId:randomUUID()},{correlationId:randomUUID()},{proposalVersionId:randomUUID()},{revision:2},{state:"withdrawn"}]){
    rpc.mockResolvedValue({error:null,data:{...result,state:"approved_for_comparison",revision:3,...patch}});
    await expect(recordProposalQuote(decision)).rejects.toThrow("Invalid proposal quote result");
  }
});
test("allows a replay to report later state but preserves its entity binding",async()=>{
  rpc.mockResolvedValue({error:null,data:{...result,state:"superseded",revision:4,outcomeCode:"replayed"}});
  await expect(recordProposalQuote(input)).resolves.toMatchObject({state:"superseded"});
});
test("maps access denial and keeps other database errors generic",async()=>{
  rpc.mockResolvedValueOnce({error:{code:"42501",message:"private reason"}});
  await expect(recordProposalQuote(input)).rejects.toBeInstanceOf(AuthorizationError);
  rpc.mockResolvedValueOnce({error:{code:"XX000",message:"private quote contents"}});
  await expect(recordProposalQuote(input)).rejects.toThrow("Proposal request failed");
  vi.mocked(requirePermission).mockResolvedValue({scope:{kind:"organization",organizationId:randomUUID()},correlationId,supabase} as never);
  await expect(recordProposalQuote(input)).rejects.toBeInstanceOf(AuthorizationError);
});
test("reads only approved customer sources and rejects leaked internal fields or actions",async()=>{
  const read={organizationId,correlationId,view:"customer",intakeId};
  rpc.mockResolvedValue({error:null,data:page}); await expect(getProposalQuotes(read)).resolves.toEqual(page);
  expect(requirePermission).toHaveBeenLastCalledWith("portal.customer.access",{kind:"organization",organizationId},{correlationId});
  for(const patch of [{intakeId:randomUUID()},{approvedAt:null},{canApprove:true},{reason:"Internal reason"},{state:"received"},{sourceHash:digest}]){
    rpc.mockResolvedValue({error:null,data:{...page,items:[{...row,...patch}]}}); await expect(getProposalQuotes(read)).rejects.toThrow();
  }
});
test("rejects foreign vendor associations, repeated rows, and forged cursors",async()=>{
  rpc.mockResolvedValue({error:null,data:{...page,items:[{...row,recipientId:randomUUID()}]}});
  await expect(getProposalQuotes({organizationId,correlationId,view:"vendor",recipientId})).rejects.toThrow();
  for(const patch of [{items:[row,row]},{nextCursor:proposalVersionId},{organizationId:randomUUID()}]){
    rpc.mockResolvedValue({error:null,data:{...page,...patch}}); await expect(getProposalQuotes({organizationId,correlationId,view:"staff",intakeId})).rejects.toThrow();
  }
});
test("prepares comparisons as staff and verifies the exact decision digest",async()=>{
  const prepare={organizationId,correlationId,idempotencyKey:randomUUID(),action:"prepare",intakeId,proposalVersionIds:sources.map((entry)=>entry.proposalVersionId),reason:"Compare synthetic terms"};
  const prepared={organizationId,correlationId,comparisonId,state:"draft",revision:1,sourceDigest:digest,outcomeCode:"recorded"};
  rpc.mockResolvedValue({error:null,data:prepared}); await expect(recordProposalComparison(prepare)).resolves.toEqual(prepared);
  expect(requirePermission).toHaveBeenLastCalledWith("rfp.approve",{kind:"organization",organizationId},{correlationId});
  const decision={organizationId,correlationId,idempotencyKey:randomUUID(),action:"approve",comparisonId,expectedRevision:1,expectedDigest:digest,reason:"Reviewed comparison",approvalReference:"approval:comparison"};
  rpc.mockResolvedValue({error:null,data:{...prepared,state:"approved",revision:2,sourceDigest:"b".repeat(64)}});
  await expect(recordProposalComparison(decision)).rejects.toThrow("Invalid proposal comparison result");
});
test("rejects unapproved comparisons, altered sources, and internal information in customer reads",async()=>{
  const read={organizationId,correlationId,view:"customer",intakeId},page={organizationId,correlationId,items:[comparisonRow],nextCursor:null};
  rpc.mockResolvedValue({error:null,data:page}); await expect(getProposalComparisons(read)).resolves.toEqual(page);
  for(const patch of [{state:"draft"},{revision:1},{sourceDigest:digest},{canApprove:true},{reason:"Private comparison"},
    {sources:[source,source]},{sources:sources.map((entry)=>({...entry,sourceHash:digest}))},
    {sources:[sources[0],{...sources[1],quote:{...quote,pricing:{...quote.pricing,currency:"EUR"}}}]}]){
    rpc.mockResolvedValue({error:null,data:{...page,items:[{...comparisonRow,...patch}]}}); await expect(getProposalComparisons(read)).rejects.toThrow();
  }
  rpc.mockResolvedValue({error:null,data:{...page,nextCursor:comparisonId}}); await expect(getProposalComparisons(read)).rejects.toThrow();
});
