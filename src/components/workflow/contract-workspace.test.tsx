import { cleanup,fireEvent,render,screen } from "@testing-library/react";
import { afterEach,beforeEach,expect,test,vi } from "vitest";

// These views belong to Launch Candidate B (owner decision D2).
beforeEach(() => { vi.stubEnv("MMHR_LAUNCH_CANDIDATE", "B"); });
import { ContractWorkspace } from "./contract-workspace";
import ContractError from "./contract-error";
import ContractLoading from "./contract-loading";
import { requirePagePermission,requireSelectedOrganizationPermission } from "@/server/auth/page-guards";
import { requirePortalPageAccess } from "@/server/auth/portal/portal-guards";
import { getPortalContractHandoffs,getPortalContractHandoffHistory } from "@/server/commands/contract-handoff-portal";
import { getIntakesPage } from "@/server/commands/intake-read";
import { getVendorRfps } from "@/server/commands/rfp-portal";
import { AuthorizationError } from "@/server/auth/authorization";
vi.mock("@/server/auth/page-guards",()=>({requirePagePermission:vi.fn(),requireSelectedOrganizationPermission:vi.fn()}));
vi.mock("@/server/auth/portal/portal-guards",()=>({requirePortalPageAccess:vi.fn()}));
vi.mock("@/server/commands/contract-handoff-portal",()=>({getPortalContractHandoffs:vi.fn(),getPortalContractHandoffHistory:vi.fn()}));
vi.mock("@/server/commands/intake-read",()=>({getIntakesPage:vi.fn()}));
vi.mock("@/server/commands/rfp-portal",()=>({getVendorRfps:vi.fn()}));
vi.mock("next/navigation",()=>({forbidden:()=>{throw new Error("FORBIDDEN");},notFound:()=>{throw new Error("NOT_FOUND");}}));
vi.mock("./contract-selection-form",()=>({ContractSelectionForm:()=><p>Customer selection control</p>,ContractSelectionDecision:()=><p>Selection decision control</p>}));
vi.mock("./contract-handoff-form",()=>({ContractHandoffForm:({introduction}:{introduction:boolean})=><p>{introduction?"Staff introduction control":"Staff status control"}</p>}));
const id="11111111-1111-4111-8111-111111111111",other="22222222-2222-4222-8222-222222222222",supabase={} as never;
const scope={authorization:{scope:{kind:"organization",organizationId:id},supabase}};
const pending={selectionId:id,intakeId:id,recipientId:id,proposalVersionId:id,comparisonId:null,vendorName:"Synthetic vendor",quoteReference:"Synthetic original",
  selectionReasons:["<script>untrusted reason</script>"],remainingRisks:["Private customer risk"],state:"pending",revision:1,selectedAt:"2026-01-01T00:00:00Z",decidedAt:null,
  decisionReason:null,current:true,canApprove:false,canReject:false,canWithdraw:false,handoffId:null,status:null,handoffRevision:null,introducedAt:null,introductionReference:null,
  signedAt:null,contractReference:null,canIntroduce:false,canUpdate:false,events:[],hasMoreHistory:false};
const approved={...pending,state:"approved",revision:2,decidedAt:"2026-01-01T01:00:00Z",handoffId:other,status:"introduction_pending",handoffRevision:1};
beforeEach(()=>{
  vi.mocked(requirePagePermission).mockReset().mockResolvedValue({} as never);vi.mocked(requireSelectedOrganizationPermission).mockReset().mockResolvedValue(scope as never);
  vi.mocked(requirePortalPageAccess).mockReset().mockResolvedValue(scope as never);
  vi.mocked(getPortalContractHandoffs).mockReset().mockResolvedValue({organizationId:id,correlationId:id,items:[pending],choices:[],canSelect:false,nextCursor:null} as never);
  vi.mocked(getPortalContractHandoffHistory).mockReset().mockResolvedValue({organizationId:id,correlationId:id,handoffId:other,events:[],nextRevision:null});
  vi.mocked(getIntakesPage).mockReset().mockResolvedValue({intakes:[],nextCursor:null} as never);
  vi.mocked(getVendorRfps).mockReset().mockResolvedValue({organizationId:id,correlationId:id,items:[],nextCursor:null});
});
afterEach(cleanup);
test("uses customer portal authority and escapes selection text",async()=>{
  const view=render(await ContractWorkspace({view:"customer",searchParams:Promise.resolve({intake:id})}));
  expect(requirePortalPageAccess).toHaveBeenCalledWith("customer");expect(requirePagePermission).not.toHaveBeenCalled();
  expect(getPortalContractHandoffs).toHaveBeenCalledWith(expect.objectContaining({view:"customer",organizationId:id,intakeId:id}),{supabase});
  expect(screen.getByText("<script>untrusted reason</script>")).toBeInTheDocument();expect(view.container.querySelector("script")).toBeNull();expect(screen.queryByText("Staff status control")).not.toBeInTheDocument();
});
test("only offers customer selection when the database marks it available",async()=>{
  vi.mocked(getPortalContractHandoffs).mockResolvedValue({organizationId:id,correlationId:id,items:[],choices:[],canSelect:true,nextCursor:null});
  render(await ContractWorkspace({view:"customer",searchParams:Promise.resolve({intake:id})}));expect(screen.getByText("Customer selection control")).toBeInTheDocument();
});
test("requires platform access and current customer staff authority",async()=>{
  vi.mocked(getPortalContractHandoffs).mockResolvedValue({organizationId:id,correlationId:id,items:[{...approved,canIntroduce:true,canUpdate:true}],choices:[],canSelect:false,nextCursor:null} as never);
  render(await ContractWorkspace({view:"staff",searchParams:Promise.resolve({intake:id})}));expect(requirePagePermission).toHaveBeenCalledWith("admin.access",{kind:"platform"});
  expect(requireSelectedOrganizationPermission).toHaveBeenCalledWith("rfp.approve");expect(screen.getByText("Staff introduction control")).toBeInTheDocument();expect(screen.getByText("Staff status control")).toBeInTheDocument();
});
test("keeps customer reasons and risks outside the vendor surface",async()=>{
  vi.mocked(getPortalContractHandoffs).mockResolvedValue({organizationId:id,correlationId:id,items:[{...approved,selectionReasons:[],remainingRisks:[]}],choices:[],canSelect:false,nextCursor:null} as never);
  render(await ContractWorkspace({view:"vendor",searchParams:Promise.resolve({recipient:id})}));expect(requirePortalPageAccess).toHaveBeenCalledWith("vendor");
  expect(screen.queryByText("Remaining risks")).not.toBeInTheDocument();expect(screen.queryByText("Selection reasons")).not.toBeInTheDocument();expect(screen.queryByText("Customer selection control")).not.toBeInTheDocument();
  expect(screen.getByRole("link",{name:"Read contract status history"})).toHaveAttribute("href",`/vendor/contracts?recipient=${id}&history=${other}`);
});
test("retains terminal outcomes without offering status controls",async()=>{
  vi.mocked(getPortalContractHandoffs).mockResolvedValue({organizationId:id,correlationId:id,items:[{...approved,status:"signed",handoffRevision:4,introducedAt:"2026-01-01T02:00:00Z",
    introductionReference:"Synthetic introduction",signedAt:"2026-01-02T12:00:00Z",contractReference:"Synthetic signed contract"}],choices:[],canSelect:false,nextCursor:null} as never);
  render(await ContractWorkspace({view:"staff",searchParams:Promise.resolve({intake:id})}));expect(screen.getByText("Contract status: signed")).toBeInTheDocument();expect(screen.queryByText("Staff status control")).not.toBeInTheDocument();
});
test("converts foreign scopes to a private not-found response",async()=>{
  vi.mocked(getPortalContractHandoffs).mockRejectedValueOnce(new AuthorizationError());await expect(ContractWorkspace({view:"vendor",searchParams:Promise.resolve({recipient:id})})).rejects.toThrow("NOT_FOUND");
  vi.mocked(getPortalContractHandoffHistory).mockRejectedValueOnce(new AuthorizationError());await expect(ContractWorkspace({view:"customer",searchParams:Promise.resolve({intake:id,history:other})})).rejects.toThrow("NOT_FOUND");
});
test("keeps unexpected failures available to the error boundary",async()=>{
  vi.mocked(getPortalContractHandoffs).mockRejectedValueOnce(new Error("Synthetic read failure"));await expect(ContractWorkspace({view:"customer",searchParams:Promise.resolve({intake:id})})).rejects.toThrow("Synthetic read failure");
});
test("rejects malformed or mixed page scopes before database reads",async()=>{
  for(const [view,params] of [["customer",{recipient:id}],["vendor",{intake:id}],["staff",{intake:id,after:"bad"}],["customer",{history:other}],
    ["customer",{intake:id,beforeRevision:"2"}],["vendor",{recipient:id,history:other,after:id}],["customer",{intake:id,choicesAfter:other}],["customer",{intake:id,organizationId:other}]] as const){
    await expect(ContractWorkspace({view,searchParams:Promise.resolve(params)})).rejects.toThrow("NOT_FOUND");
  }expect(getPortalContractHandoffs).not.toHaveBeenCalled();expect(getPortalContractHandoffHistory).not.toHaveBeenCalled();
});
test("loads intake and vendor request choices through paged scoped reads",async()=>{
  vi.mocked(getIntakesPage).mockResolvedValue({intakes:[{intakeId:id,status:"submitted",createdAt:pending.selectedAt}],nextCursor:other} as never);
  render(await ContractWorkspace({view:"customer",searchParams:Promise.resolve({})}));expect(screen.getByRole("link",{name:/Intake · submitted/})).toHaveAttribute("href",`/customer/contracts?intake=${id}`);
  cleanup();vi.mocked(getVendorRfps).mockResolvedValue({organizationId:id,correlationId:id,items:[{recipientId:id,title:"Synthetic delivered request"}],nextCursor:other} as never);
  render(await ContractWorkspace({view:"vendor",searchParams:Promise.resolve({})}));expect(screen.getByRole("link",{name:"Synthetic delivered request"})).toHaveAttribute("href",`/vendor/contracts?recipient=${id}`);expect(getPortalContractHandoffs).not.toHaveBeenCalled();
});
test("keeps history pagination within its intake and handoff",async()=>{
  vi.mocked(getPortalContractHandoffHistory).mockResolvedValue({organizationId:id,correlationId:id,handoffId:other,events:[{eventId:id,revision:30,fromStatus:"negotiating",toStatus:"stalled",reason:"Contract status updated.",occurredAt:pending.selectedAt}],nextRevision:6});
  render(await ContractWorkspace({view:"customer",searchParams:Promise.resolve({intake:id,history:other,beforeRevision:"31"})}));
  expect(getPortalContractHandoffHistory).toHaveBeenCalledWith(expect.objectContaining({intakeId:id,handoffId:other,beforeRevision:31}),{supabase});
  expect(screen.getByRole("link",{name:"Older contract status changes"})).toHaveAttribute("href",`/customer/contracts?intake=${id}&history=${other}&beforeRevision=6`);expect(getPortalContractHandoffs).not.toHaveBeenCalled();
});
test("provides generic loading and recoverable error states",()=>{
  const reset=vi.fn();render(<ContractError reset={reset}/>);fireEvent.click(screen.getByRole("button",{name:"Retry saved contract records"}));expect(reset).toHaveBeenCalledOnce();
  cleanup();render(<ContractLoading/>);expect(screen.getByRole("status")).toHaveTextContent("Loading saved vendor selections and contract records");
});
