import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ContractSelectionDecision, ContractSelectionForm } from "./contract-selection-form";
import { ContractHandoffForm } from "./contract-handoff-form";
import { portalHandoffItemSchema } from "@/lib/contract-handoff-portal";
import type { ProposalQuote } from "@/lib/proposal-quote";
const { mutations, options, refresh } = vi.hoisted(() => {
  const names = ["select", "withdraw", "approve", "reject", "introduce", "transition", "recordSigned"];
  return { mutations: Object.fromEntries(names.map(name => [name, vi.fn()])), options: Object.fromEntries(names.map(name => [name, vi.fn()])), refresh: vi.fn() };
});
vi.mock("@/lib/trpc/client", () => ({ useTRPC: () => ({ contracts: Object.fromEntries(Object.entries(options).map(([name, mutationOptions]) => [name, { mutationOptions }])) }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const id="11111111-1111-4111-8111-111111111111",other="22222222-2222-4222-8222-222222222222";
const quote:ProposalQuote={quoteReference:"Synthetic approved original",quoteDate:null,quoteSummary:"Synthetic scope",pricing:{currency:"USD",implementationCostMinorUnits:100001,recurringCostMinorUnits:null,
  recurringPeriod:null,recurringCostBasis:null,optionalCostMinorUnits:null,optionalCostDescription:null,discountMinorUnits:null,discountDescription:null,termMonths:null,termsAndAssumptions:[],customerRequestedChanges:[]}};
const choice={comparisonId:null,proposalVersionId:id,quoteRevision:3,versionNumber:1,vendorName:"Synthetic vendor",quote};
const pending=portalHandoffItemSchema.parse({selectionId:id,intakeId:id,recipientId:id,proposalVersionId:id,comparisonId:null,vendorName:"Synthetic vendor",quoteReference:quote.quoteReference,
  selectionReasons:["Synthetic fit"],remainingRisks:[],state:"pending",revision:1,selectedAt:"2026-01-01T00:00:00Z",decidedAt:null,decisionReason:null,current:true,
  canApprove:true,canReject:true,canWithdraw:false,handoffId:null,status:null,handoffRevision:null,introducedAt:null,introductionReference:null,signedAt:null,contractReference:null,
  canIntroduce:false,canUpdate:false,events:[],hasMoreHistory:false});
const approved={...pending,state:"approved" as const,revision:2,decidedAt:"2026-01-01T01:00:00Z",canApprove:false,canReject:false,handoffId:other,status:"introduction_pending" as const,handoffRevision:1,canIntroduce:true,canUpdate:true};
function view(node:React.ReactNode){return render(<QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>);}
function fill(label:string,value:string){fireEvent.change(screen.getByLabelText(label,{exact:false}),{target:{value}});}
function submit(label:string){fireEvent.submit(screen.getByLabelText(label,{exact:false}).closest("form")!);}
beforeEach(()=>{refresh.mockReset();for(const name of Object.keys(mutations)){mutations[name]!.mockReset().mockResolvedValue({});options[name]!.mockReset().mockImplementation((config:object)=>({mutationFn:mutations[name],...config}));}});
afterEach(cleanup);
test("selects one immutable quote with separate reasons and risks",async()=>{
  view(<ContractSelectionForm organizationId={id} intakeId={id} choices={[choice]}/>);fill("Selection reasons","Scope fits\nSupport fits");fill("Remaining risks","Confirm implementation date");submit("Selection reasons");
  await screen.findByText("Your contract action is saved.");expect(mutations.select!.mock.calls[0]![0]).toMatchObject({action:"select",intakeId:id,comparisonId:null,proposalVersionId:id,expectedQuoteRevision:3,
    selectionReasons:["Scope fits","Support fits"],remainingRisks:["Confirm implementation date"]});expect(screen.getByLabelText("Selection reasons",{exact:false})).toBeDisabled();
});
test("rejects blank or excessive reasons before a write",()=>{
  view(<ContractSelectionForm organizationId={id} intakeId={id} choices={[choice]}/>);fill("Selection reasons"," ");submit("Selection reasons");expect(mutations.select).not.toHaveBeenCalled();
  fill("Selection reasons",Array(11).fill("reason").join("\n"));submit("Selection reasons");expect(mutations.select).not.toHaveBeenCalled();expect(screen.getByRole("alert")).toBeInTheDocument();
});
test("locks uncertain outcomes and retries the exact original request",async()=>{
  mutations.select!.mockRejectedValueOnce(new Error("Transport outcome unknown"));view(<ContractSelectionForm organizationId={id} intakeId={id} choices={[choice]}/>);
  fill("Selection reasons","Synthetic fit");submit("Selection reasons");await screen.findByText(/We could not confirm/);const first=mutations.select!.mock.calls[0]![0];
  submit("Selection reasons");expect(mutations.select).toHaveBeenCalledOnce();fireEvent.click(screen.getByRole("button",{name:"Retry unchanged request"}));await screen.findByText("Your contract action is saved.");
  expect(mutations.select!.mock.calls[1]![0]).toEqual(first);
});
test("blocks duplicate writes while a request is pending",async()=>{
  let finish:((value:object)=>void)|undefined;mutations.select!.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
  view(<ContractSelectionForm organizationId={id} intakeId={id} choices={[choice]}/>);fill("Selection reasons","Synthetic fit");submit("Selection reasons");submit("Selection reasons");
  await waitFor(()=>expect(mutations.select).toHaveBeenCalledOnce());finish!({});await screen.findByText("Your contract action is saved.");
});
test("keeps a saved outcome when page refresh fails",async()=>{
  refresh.mockImplementation(()=>{throw new Error("Refresh failed");});view(<ContractSelectionForm organizationId={id} intakeId={id} choices={[choice]}/>);fill("Selection reasons","Synthetic fit");submit("Selection reasons");
  await screen.findByText("Your contract action is saved. Reload the page to read the current records.");expect(screen.queryByRole("button",{name:"Retry unchanged request"})).not.toBeInTheDocument();
});
test("requires a staff approval reference and uses the selected decision revision",async()=>{
  view(<ContractSelectionDecision organizationId={id} item={pending}/>);fill("Decision reason","Reviewed customer scope");submit("Decision reason");expect(mutations.approve).not.toHaveBeenCalled();
  fill("Staff approval reference","Synthetic staff decision");submit("Decision reason");await screen.findByText("Your contract action is saved.");
  expect(mutations.approve!.mock.calls[0]![0]).toMatchObject({action:"approve_selection",selectionId:id,expectedRevision:1,approvalReference:"Synthetic staff decision"});
});
test("withdraws a customer decision without staff approval fields",async()=>{
  view(<ContractSelectionDecision organizationId={id} item={{...pending,canApprove:false,canReject:false,canWithdraw:true}}/>);fill("Decision reason","Customer reconsidered");submit("Decision reason");
  await screen.findByText("Your contract action is saved.");expect(mutations.withdraw!.mock.calls[0]![0]).toMatchObject({action:"withdraw_selection",selectionId:id,expectedRevision:1});
  expect(mutations.withdraw!.mock.calls[0]![0]).not.toHaveProperty("approvalReference");
});
test("converts an explicit introduction time zone and includes its record reference",async()=>{
  view(<ContractHandoffForm organizationId={id} item={approved} introduction/>);fill("Staff record reason","Both parties received the introduction");fill("Record time zone","America/New_York");
  expect(screen.getByLabelText("Introduction date and time",{exact:false})).toHaveAttribute("step","1");
  fill("Introduction date and time","2026-01-02T12:00:44");fill("Introduction record reference","Synthetic message receipt");submit("Staff record reason");await screen.findByText("Your contract action is saved.");
  expect(mutations.introduce!.mock.calls[0]![0]).toMatchObject({action:"introduce",handoffId:other,expectedRevision:1,introducedAt:"2026-01-02T17:00:44.000Z",introductionReference:"Synthetic message receipt"});
});
test("rejects ambiguous daylight saving times before recording an introduction",()=>{
  view(<ContractHandoffForm organizationId={id} item={approved} introduction/>);fill("Staff record reason","Synthetic introduction");fill("Record time zone","America/New_York");
  fill("Introduction date and time","2026-11-01T01:30");fill("Introduction record reference","Synthetic receipt");submit("Staff record reason");expect(mutations.introduce).not.toHaveBeenCalled();expect(screen.getByRole("alert")).toBeInTheDocument();
});
test("records a signed reference through its separate procedure",async()=>{
  view(<ContractHandoffForm organizationId={id} item={{...approved,status:"negotiating",handoffRevision:3,introducedAt:"2026-01-01T02:00:00Z",introductionReference:"Synthetic introduction",canIntroduce:false}}/>);
  fill("Next status","signed");fill("Staff record reason","Both parties report signing");fill("Contract signing date and time","2026-01-02T12:00");fill("Signed contract reference","Synthetic signed contract");submit("Staff record reason");
  await screen.findByText("Your contract action is saved.");expect(mutations.recordSigned!.mock.calls[0]![0]).toMatchObject({action:"record_signed",expectedRevision:3,signedAt:"2026-01-02T12:00:00.000Z",contractReference:"Synthetic signed contract"});expect(mutations.transition).not.toHaveBeenCalled();
});
test("does not offer negotiation or signing before the introduction",()=>{
  view(<ContractHandoffForm organizationId={id} item={approved}/>);expect(screen.queryByRole("option",{name:"negotiating"})).not.toBeInTheDocument();expect(screen.queryByRole("option",{name:"signed"})).not.toBeInTheDocument();
});
