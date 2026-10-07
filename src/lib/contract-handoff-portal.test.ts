// @vitest-environment node
import { randomUUID } from "node:crypto";
import { describe, expect, test } from "vitest";
import { canTransitionPortalHandoff, portalHandoffCommandSchema, portalHandoffHistoryReadSchema,
  portalHandoffItemSchema, portalHandoffPermission, portalHandoffReadSchema, portalHandoffResultSchema } from "./contract-handoff-portal";

const organizationId=randomUUID(), correlationId=randomUUID(), intakeId=randomUUID(), proposalVersionId=randomUUID();
const metadata={organizationId,correlationId,idempotencyKey:randomUUID()};
const selected={...metadata,action:"select" as const,intakeId,comparisonId:randomUUID(),proposalVersionId,expectedQuoteRevision:3,
  selectionReasons:["Approved product meets the required scope."],remainingRisks:["Confirm implementation capacity."]};
const pending={selectionId:randomUUID(),intakeId,recipientId:randomUUID(),proposalVersionId,comparisonId:selected.comparisonId,
  vendorName:"Synthetic vendor",quoteReference:"Synthetic original quote",selectionReasons:selected.selectionReasons,
  remainingRisks:selected.remainingRisks,state:"pending" as const,revision:1,selectedAt:new Date().toISOString(),decidedAt:null,
  decisionReason:null,current:true,canApprove:true,canReject:true,canWithdraw:false,handoffId:null,status:null,handoffRevision:null,
  introducedAt:null,introductionReference:null,signedAt:null,contractReference:null,canIntroduce:false,canUpdate:false,events:[],hasMoreHistory:false};

describe("Portal contract handoff contracts",()=>{
  test("accepts a customer decision and normalizes identifiers",()=>{
    expect(portalHandoffCommandSchema.parse({...selected,organizationId:organizationId.toUpperCase()})).toEqual(selected);
  });
  test("permits a single approved quote without requiring a comparison",()=>{
    expect(portalHandoffCommandSchema.safeParse({...selected,comparisonId:null}).success).toBe(true);
    expect(portalHandoffCommandSchema.safeParse({...selected,comparisonId:undefined}).success).toBe(false);
  });
  test.each(["actorIdentityId","approvedAt","approvedByIdentityIds","dealId","vendorOrganizationId","status","contractId"])(
    "rejects caller-controlled authority or association: %s",(field)=>{
      expect(portalHandoffCommandSchema.safeParse({...selected,[field]:randomUUID()}).success).toBe(false);
    });
  test.each([[],[" "],["😀".repeat(126)],["bad\u0000text"],Array(11).fill("reason")])("rejects invalid selection reasons %#",(selectionReasons)=>{
    expect(portalHandoffCommandSchema.safeParse({...selected,selectionReasons}).success).toBe(false);
  });
  test("counts UTF-8 bytes and permits a bounded Unicode reason",()=>{
    expect(portalHandoffCommandSchema.safeParse({...selected,selectionReasons:["😀".repeat(125)]}).success).toBe(true);
  });
  test("bounds the stored JSON form when text contains many escape characters",()=>{
    expect(portalHandoffCommandSchema.safeParse({...selected,selectionReasons:Array(10).fill('"'.repeat(500))}).success).toBe(false);
    expect(portalHandoffCommandSchema.safeParse({...selected,remainingRisks:Array(20).fill('"'.repeat(500))}).success).toBe(false);
  });
  test.each([0,1.5,10000,NaN])("rejects invalid source revision %s",(expectedQuoteRevision)=>{
    expect(portalHandoffCommandSchema.safeParse({...selected,expectedQuoteRevision}).success).toBe(false);
  });
  test("requires an approval reference and rejects an injected approver",()=>{
    const input={...metadata,action:"approve_selection",selectionId:pending.selectionId,expectedRevision:1,reason:"Approved customer decision.",approvalReference:"Synthetic MMHR approval"};
    expect(portalHandoffCommandSchema.safeParse(input).success).toBe(true);
    expect(portalHandoffCommandSchema.safeParse({...input,approvalReference:" "}).success).toBe(false);
    expect(portalHandoffCommandSchema.safeParse({...input,approvedByIdentityId:randomUUID()}).success).toBe(false);
  });
  test("records a formal introduction with its business date and reference",()=>{
    const input={...metadata,action:"introduce",handoffId:randomUUID(),expectedRevision:1,reason:"Both parties received the introduction.",introducedAt:new Date().toISOString(),introductionReference:"Synthetic introduction email"};
    expect(portalHandoffCommandSchema.safeParse(input).success).toBe(true);
    expect(portalHandoffCommandSchema.safeParse({...input,introductionReference:undefined}).success).toBe(false);
  });
  test("requires a signed contract reference rather than a generic status transition",()=>{
    const input={...metadata,action:"record_signed",handoffId:randomUUID(),expectedRevision:3,reason:"Both parties signed.",signedAt:new Date().toISOString(),contractReference:"Synthetic signed contract"};
    expect(portalHandoffCommandSchema.safeParse(input).success).toBe(true);
    expect(portalHandoffCommandSchema.safeParse({...input,contractReference:null}).success).toBe(false);
    expect(portalHandoffCommandSchema.safeParse({...metadata,action:"transition",handoffId:input.handoffId,expectedRevision:3,reason:"Signed",fromStatus:"negotiating",toStatus:"signed"}).success).toBe(false);
  });
  test.each(["signed","not_signed","cancelled"] as const)("preserves terminal %s outcomes",(state)=>{
    for(const next of ["introduced","negotiating","stalled","signed","not_signed","cancelled"] as const){
      expect(canTransitionPortalHandoff(state,next,true)).toBe(false);
    }
  });
  test("requires an introduction before resumed negotiations",()=>{
    expect(canTransitionPortalHandoff("stalled","negotiating",false)).toBe(false);
    expect(canTransitionPortalHandoff("stalled","negotiating",true)).toBe(true);
    expect(canTransitionPortalHandoff("negotiating","signed",true)).toBe(true);
    expect(canTransitionPortalHandoff("introduction_pending","cancelled",false)).toBe(true);
  });
  test("keeps ordinary party reads separate from staff decisions",()=>{
    expect(portalHandoffPermission("customer")).toBe("portal.customer.access");
    expect(portalHandoffPermission("vendor")).toBe("portal.vendor.access");
    expect(portalHandoffPermission("select")).toBe("portal.customer.access");
    expect(portalHandoffPermission("approve_selection")).toBe("rfp.approve");
    expect(portalHandoffPermission("record_signed")).toBe("rfp.approve");
  });
  test.each(["customer","staff"] as const)("accepts scoped %s history pagination",(view)=>{
    const scope={organizationId,correlationId,view,intakeId};
    expect(portalHandoffReadSchema.safeParse(scope).success).toBe(true);
    expect(portalHandoffHistoryReadSchema.safeParse({...scope,handoffId:randomUUID(),beforeRevision:3}).success).toBe(true);
    expect(portalHandoffHistoryReadSchema.safeParse({...scope,handoffId:randomUUID(),afterId:randomUUID()}).success).toBe(false);
  });
  test("requires a vendor recipient scope",()=>{
    expect(portalHandoffReadSchema.safeParse({organizationId,correlationId,view:"vendor",intakeId}).success).toBe(false);
    expect(portalHandoffHistoryReadSchema.safeParse({organizationId,correlationId,view:"vendor",recipientId:randomUUID(),handoffId:randomUUID()}).success).toBe(true);
  });
  test("requires complete handoff identifiers in recorded and replayed approvals",()=>{
    const result={organizationId,correlationId,selectionId:pending.selectionId,selectionState:"approved",selectionRevision:2,
      handoffId:randomUUID(),status:"introduction_pending",revision:1,outcomeCode:"replayed"};
    expect(portalHandoffResultSchema.safeParse(result).success).toBe(true);
    expect(portalHandoffResultSchema.safeParse({...result,revision:undefined}).success).toBe(false);
    expect(portalHandoffResultSchema.safeParse({...result,status:null}).success).toBe(false);
  });
  test("rejects handoff data before customer selection approval",()=>{
    const result={organizationId,correlationId,selectionId:pending.selectionId,selectionState:"pending",selectionRevision:1,
      handoffId:null,status:null,revision:null,outcomeCode:"recorded"};
    expect(portalHandoffResultSchema.safeParse(result).success).toBe(true);
    expect(portalHandoffResultSchema.safeParse({...result,handoffId:randomUUID()}).success).toBe(false);
  });
  test("accepts a consistent pending read without private actor identifiers",()=>{
    expect(portalHandoffItemSchema.safeParse(pending).success).toBe(true);
    expect(portalHandoffItemSchema.safeParse({...pending,selectedByIdentityId:randomUUID()}).success).toBe(false);
  });
  test.each([
    {current:false}, {revision:2}, {decidedAt:new Date().toISOString()}, {handoffId:randomUUID()},
    {canIntroduce:true}, {canUpdate:true}, {signedAt:new Date().toISOString()},
    {introducedAt:new Date().toISOString(),introductionReference:"Unapproved introduction"}, {hasMoreHistory:true},
  ])("rejects inconsistent pending reads %#",(patch)=>{
    expect(portalHandoffItemSchema.safeParse({...pending,...patch}).success).toBe(false);
  });
  test("retains approved history while removing stale introduction authority",()=>{
    const item={...pending,state:"approved",revision:2,decidedAt:new Date().toISOString(),decisionReason:null,
      canApprove:false,canReject:false,handoffId:randomUUID(),status:"introduction_pending",handoffRevision:1,
      current:false,canIntroduce:false,canUpdate:true};
    expect(portalHandoffItemSchema.safeParse(item).success).toBe(true);
    expect(portalHandoffItemSchema.safeParse({...item,canIntroduce:true}).success).toBe(false);
  });
});
