import { cleanup,fireEvent,render,screen } from "@testing-library/react";
import { afterEach,beforeEach,expect,test,vi } from "vitest";
import { ProposalWorkspace } from "./proposal-workspace";
import ProposalError from "./proposal-error";
import ProposalLoading from "./proposal-loading";
import { requirePagePermission,requireSelectedOrganizationPermission } from "@/server/auth/page-guards";
import { requirePortalPageAccess } from "@/server/auth/portal/portal-guards";
import { getProposalComparisons,getProposalQuotes } from "@/server/commands/proposal-quotes";
import { getIntakesPage } from "@/server/commands/intake-read";
import { getVendorRfps } from "@/server/commands/rfp-portal";
import type { ProposalQuote } from "@/lib/proposal-quote";
import { AuthorizationError } from "@/server/auth/authorization";
vi.mock("@/server/auth/page-guards",()=>({requirePagePermission:vi.fn(),requireSelectedOrganizationPermission:vi.fn()}));
vi.mock("@/server/auth/portal/portal-guards",()=>({requirePortalPageAccess:vi.fn()}));
vi.mock("@/server/commands/proposal-quotes",()=>({getProposalComparisons:vi.fn(),getProposalQuotes:vi.fn()}));
vi.mock("@/server/commands/intake-read",()=>({getIntakesPage:vi.fn()}));
vi.mock("@/server/commands/rfp-portal",()=>({getVendorRfps:vi.fn()}));
vi.mock("next/navigation",()=>({forbidden:()=>{throw new Error("FORBIDDEN");},notFound:()=>{throw new Error("NOT_FOUND");}}));
vi.mock("./proposal-quote-form",()=>({ProposalQuoteForm:({expectedVersion}:{expectedVersion:number})=><p>Vendor submit after version {expectedVersion}</p>}));
vi.mock("./proposal-decisions",()=>({ProposalComparisonForm:()=><p>Staff comparison control</p>,ProposalDecisionForm:({decision}:{decision:{actions:string[]}})=><p>Decision control: {decision.actions.join(", ")}</p>}));
const id="11111111-1111-4111-8111-111111111111",other="22222222-2222-4222-8222-222222222222",supabase={} as never;
const scope={authorization:{scope:{kind:"organization",organizationId:id},supabase}};
const quote:ProposalQuote={quoteReference:"Synthetic original",quoteDate:null,quoteSummary:"<script>untrusted</script>",pricing:{currency:"USD",implementationCostMinorUnits:0,recurringCostMinorUnits:null,
  recurringPeriod:null,recurringCostBasis:null,optionalCostMinorUnits:null,optionalCostDescription:null,discountMinorUnits:null,discountDescription:null,termMonths:null,termsAndAssumptions:[],customerRequestedChanges:[]}};
const row={proposalVersionId:id,recipientId:id,intakeId:id,versionNumber:1,revision:3,state:"approved_for_comparison",quote,receivedAt:"2026-01-01T00:00:00Z",
  reviewedAt:"2026-01-01T01:00:00Z",approvedAt:"2026-01-01T02:00:00Z",vendorName:"Synthetic vendor",current:true,latest:true,reason:null,canSubmit:false,canReview:false,canApprove:false};
beforeEach(()=>{
  vi.mocked(requirePagePermission).mockReset().mockResolvedValue({} as never);vi.mocked(requireSelectedOrganizationPermission).mockReset().mockResolvedValue(scope as never);
  vi.mocked(requirePortalPageAccess).mockReset().mockResolvedValue(scope as never);
  vi.mocked(getProposalQuotes).mockReset().mockResolvedValue({organizationId:id,correlationId:id,items:[row],nextCursor:null,submission:null} as never);
  vi.mocked(getProposalComparisons).mockReset().mockResolvedValue({organizationId:id,correlationId:id,items:[],nextCursor:null});
  vi.mocked(getIntakesPage).mockReset().mockResolvedValue({intakes:[],nextCursor:null} as never);
  vi.mocked(getVendorRfps).mockReset().mockResolvedValue({organizationId:id,correlationId:id,items:[],nextCursor:null});
});
afterEach(cleanup);
test("does not expose foreign quote or comparison scope failures",async()=>{
  vi.mocked(getProposalQuotes).mockRejectedValueOnce(new AuthorizationError());
  await expect(ProposalWorkspace({view:"vendor",searchParams:Promise.resolve({recipient:id})})).rejects.toThrow("NOT_FOUND");
  vi.mocked(getProposalComparisons).mockRejectedValueOnce(new AuthorizationError());
  await expect(ProposalWorkspace({view:"customer",searchParams:Promise.resolve({intake:id})})).rejects.toThrow("NOT_FOUND");
});
test("preserves unexpected read failures for the recoverable error boundary",async()=>{
  vi.mocked(getProposalQuotes).mockRejectedValueOnce(new Error("Synthetic read failure"));
  await expect(ProposalWorkspace({view:"vendor",searchParams:Promise.resolve({recipient:id})})).rejects.toThrow("Synthetic read failure");
});
test("customer uses its portal guard, approved reads, and escaped quote text",async()=>{
  const view=render(await ProposalWorkspace({view:"customer",searchParams:Promise.resolve({intake:id})}));
  expect(requirePortalPageAccess).toHaveBeenCalledWith("customer");expect(requirePagePermission).not.toHaveBeenCalled();
  expect(getProposalQuotes).toHaveBeenCalledWith(expect.objectContaining({view:"customer",organizationId:id,intakeId:id}),{supabase});
  expect(screen.getByText("$0.00")).toBeInTheDocument();expect(screen.getAllByText("Unknown").length).toBeGreaterThan(0);
  expect(screen.getByText("<script>untrusted</script>")).toBeInTheDocument();expect(view.container.querySelector("script")).toBeNull();
  expect(screen.queryByText("Staff comparison control")).not.toBeInTheDocument();expect(screen.queryByText(/Decision control/)).not.toBeInTheDocument();
});
test("staff requires platform access and the selected customer authority",async()=>{
  vi.mocked(getProposalQuotes).mockResolvedValue({organizationId:id,correlationId:id,items:[{...row,state:"under_review",approvedAt:null,canApprove:true}],nextCursor:null,submission:null} as never);
  render(await ProposalWorkspace({view:"staff",searchParams:Promise.resolve({intake:id})}));
  expect(requirePagePermission).toHaveBeenCalledWith("admin.access",{kind:"platform"});expect(requireSelectedOrganizationPermission).toHaveBeenCalledWith("rfp.approve");
  expect(screen.getByText("Staff comparison control")).toBeInTheDocument();expect(screen.getByText("Decision control: approve, request_revision")).toBeInTheDocument();
});
test("vendor needs explicit submission eligibility and receives no customer comparisons",async()=>{
  vi.mocked(getProposalQuotes).mockResolvedValue({organizationId:id,correlationId:id,items:[],nextCursor:null,submission:{eligible:true,expectedVersion:0}});
  render(await ProposalWorkspace({view:"vendor",searchParams:Promise.resolve({recipient:id})}));
  expect(screen.getByText("Vendor submit after version 0")).toBeInTheDocument();expect(getProposalComparisons).not.toHaveBeenCalled();
  expect(screen.queryByText("Staff comparison control")).not.toBeInTheDocument();
});
test("vendor viewers see preserved quotes without a write control",async()=>{
  vi.mocked(getProposalQuotes).mockResolvedValue({organizationId:id,correlationId:id,items:[row],nextCursor:null,submission:{eligible:false,expectedVersion:1}} as never);
  render(await ProposalWorkspace({view:"vendor",searchParams:Promise.resolve({recipient:id})}));
  expect(screen.getByText(/Quote submission is unavailable/)).toBeInTheDocument();expect(screen.queryByText(/Vendor submit after version/)).not.toBeInTheDocument();
});
test("does not offer the comparison preparer a decision",async()=>{
  const sources=[{proposalVersionId:id,versionNumber:1,vendorName:"Left vendor",quote,receivedAt:row.receivedAt,approvedAt:row.approvedAt},
    {proposalVersionId:other,versionNumber:1,vendorName:"Right vendor",quote,receivedAt:row.receivedAt,approvedAt:row.approvedAt}];
  vi.mocked(getProposalComparisons).mockResolvedValue({organizationId:id,correlationId:id,items:[{comparisonId:id,intakeId:id,state:"draft",revision:1,createdAt:row.receivedAt,decidedAt:null,
    sourceDigest:"a".repeat(64),current:true,canApprove:false,canReject:false,reason:"Synthetic comparison",sources}],nextCursor:null});
  render(await ProposalWorkspace({view:"staff",searchParams:Promise.resolve({intake:id})}));
  expect(screen.queryByText(/Decision control/)).not.toBeInTheDocument();expect(screen.getByRole("link",{name:"Read Left vendor quote version 1"}).getAttribute("href")).toContain("source");
});
test("rejects malformed and cross-role scope parameters before loading data",async()=>{
  for(const [view,params] of [["customer",{recipient:id}],["vendor",{intake:id}],["customer",{intake:id,after:"bad"}],["staff",{after:id}],
    ["customer",{intake:id,choicesAfter:other}],["vendor",{recipient:id,organizationId:other}]] as const){
    await expect(ProposalWorkspace({view,searchParams:Promise.resolve(params)})).rejects.toThrow("NOT_FOUND");
  }
  expect(getProposalQuotes).not.toHaveBeenCalled();expect(getVendorRfps).not.toHaveBeenCalled();expect(getIntakesPage).not.toHaveBeenCalled();
});
test("chooses intakes and vendor requests from request-scoped paged reads",async()=>{
  vi.mocked(getIntakesPage).mockResolvedValue({intakes:[{intakeId:id,status:"submitted",createdAt:row.receivedAt}],nextCursor:other} as never);
  render(await ProposalWorkspace({view:"customer",searchParams:Promise.resolve({})}));expect(screen.getByRole("link",{name:/Intake · submitted/})).toHaveAttribute("href",`/customer/proposals?intake=${id}`);
  cleanup();vi.mocked(getVendorRfps).mockResolvedValue({organizationId:id,correlationId:id,items:[{recipientId:id,title:"Synthetic request"}],nextCursor:other} as never);
  render(await ProposalWorkspace({view:"vendor",searchParams:Promise.resolve({})}));expect(screen.getByRole("link",{name:"Synthetic request"})).toHaveAttribute("href",`/vendor/proposals?recipient=${id}`);
  expect(getProposalQuotes).not.toHaveBeenCalled();
});
test("has generic recoverable loading and error states",()=>{
  const reset=vi.fn();render(<ProposalError reset={reset}/>);fireEvent.click(screen.getByRole("button",{name:"Retry saved proposals"}));expect(reset).toHaveBeenCalledOnce();
  cleanup();render(<ProposalLoading/>);expect(screen.getByRole("status")).toHaveTextContent("Loading saved quotes and comparisons");
});
