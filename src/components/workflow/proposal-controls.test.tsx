import { QueryClient,QueryClientProvider } from "@tanstack/react-query";
import { cleanup,fireEvent,render,screen,waitFor } from "@testing-library/react";
import { afterEach,beforeEach,expect,test,vi } from "vitest";
import { ProposalQuoteForm } from "./proposal-quote-form";
import { ProposalComparisonForm,ProposalDecisionForm } from "./proposal-decisions";
const {mutations,options,refresh}=vi.hoisted(()=>{
  const names=["submit","review","approve","requestRevision","withdraw","prepareComparison","approveComparison","rejectComparison"];
  return{mutations:Object.fromEntries(names.map((name)=>[name,vi.fn()])),options:Object.fromEntries(names.map((name)=>[name,vi.fn()])),refresh:vi.fn()};
});
vi.mock("@/lib/trpc/client",()=>({useTRPC:()=>({proposals:Object.fromEntries(Object.entries(options).map(([name,mutationOptions])=>[name,{mutationOptions}]))})}));
vi.mock("next/navigation",()=>({useRouter:()=>({refresh})}));
const id="11111111-1111-4111-8111-111111111111",other="22222222-2222-4222-8222-222222222222";
function view(node:React.ReactNode){return render(<QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>);}
function fill(label:string,value:string){fireEvent.change(screen.getByLabelText(label),{target:{value}});}
function fillQuote(){fill("Quote reference","Synthetic quote");fill("Original scope and quote text","Synthetic original quote text");}
beforeEach(()=>{
  refresh.mockReset();for(const name of Object.keys(mutations)){mutations[name]!.mockReset().mockResolvedValue({});options[name]!.mockReset().mockImplementation((config:object)=>({mutationFn:mutations[name],...config}));}
});
afterEach(cleanup);
test("saves exact written currency values while preserving unknown and zero",async()=>{
  view(<ProposalQuoteForm organizationId={id} recipientId={id} expectedVersion={2}/>);fillQuote();fill("Implementation cost","1000.01");fill("Discount","0");
  fireEvent.submit(screen.getByLabelText("Quote reference").closest("form")!);await screen.findByText(/Your action is saved/);
  expect(mutations.submit!.mock.calls[0]![0]).toMatchObject({action:"submit",organizationId:id,recipientId:id,expectedVersion:2,quote:{pricing:{
    currency:"USD",implementationCostMinorUnits:100001,recurringCostMinorUnits:null,recurringPeriod:null,discountMinorUnits:0}}});
  expect(screen.getByLabelText("Quote reference")).toBeDisabled();expect(refresh).toHaveBeenCalledOnce();
});
test("rejects excessive decimals before it writes a quote",()=>{
  view(<ProposalQuoteForm organizationId={id} recipientId={id} expectedVersion={0}/>);fillQuote();fill("Implementation cost","0.001");
  fireEvent.submit(screen.getByLabelText("Quote reference").closest("form")!);expect(screen.getByRole("alert")).toHaveTextContent("exact decimal places");expect(mutations.submit).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Quote reference")).not.toBeDisabled();
});
test("requires recurring price basis and optional cost descriptions",()=>{
  view(<ProposalQuoteForm organizationId={id} recipientId={id} expectedVersion={0}/>);fillQuote();fill("Recurring cost","123.45");
  fireEvent.submit(screen.getByLabelText("Quote reference").closest("form")!);expect(mutations.submit).not.toHaveBeenCalled();
  fill("Recurring price basis, such as employee count","50 employees");fill("Optional cost","10");
  fireEvent.submit(screen.getByLabelText("Quote reference").closest("form")!);expect(screen.getByRole("alert")).toHaveTextContent("Describe quoted optional costs");expect(mutations.submit).not.toHaveBeenCalled();
});
test("locks an uncertain submission and retries its unchanged input and identifiers",async()=>{
  mutations.submit!.mockRejectedValueOnce(new Error("Unknown transport outcome"));
  view(<ProposalQuoteForm organizationId={id} recipientId={id} expectedVersion={0}/>);fillQuote();
  fireEvent.submit(screen.getByLabelText("Quote reference").closest("form")!);await screen.findByText(/We could not confirm/);
  const first=mutations.submit!.mock.calls[0]![0];expect(screen.getByLabelText("Original scope and quote text")).toBeDisabled();
  fireEvent.submit(screen.getByLabelText("Quote reference").closest("form")!);expect(mutations.submit).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button",{name:"Retry unchanged request"}));await screen.findByText(/Your action is saved/);expect(mutations.submit!.mock.calls[1]![0]).toEqual(first);
});
test("blocks duplicate writes while a request is pending",async()=>{
  let finish:((value:object)=>void)|undefined;mutations.submit!.mockImplementation(()=>new Promise((resolve)=>{finish=resolve;}));
  view(<ProposalQuoteForm organizationId={id} recipientId={id} expectedVersion={0}/>);fillQuote();
  const form=screen.getByLabelText("Quote reference").closest("form")!;fireEvent.submit(form);fireEvent.submit(form);
  await waitFor(()=>expect(mutations.submit).toHaveBeenCalledOnce());finish!({});await screen.findByText(/Your action is saved/);
});
test("preserves a successful result if refresh fails",async()=>{
  refresh.mockImplementation(()=>{throw new Error("Refresh failed");});view(<ProposalQuoteForm organizationId={id} recipientId={id} expectedVersion={0}/>);fillQuote();
  fireEvent.submit(screen.getByLabelText("Quote reference").closest("form")!);await screen.findByText("Your action is saved. Reload the page to read the current records.");
  expect(screen.getByRole("status")).toBeInTheDocument();expect(screen.queryByRole("button",{name:"Retry unchanged request"})).not.toBeInTheDocument();expect(mutations.submit).toHaveBeenCalledOnce();
});
test("sends staff approval with the exact source revision and an explicit reference",async()=>{
  view(<ProposalDecisionForm organizationId={id} decision={{kind:"quote",proposalVersionId:id,expectedRevision:2,actions:["approve","request_revision"]}}/>);
  fill("Decision reason","Reviewed original source");fireEvent.submit(screen.getByLabelText("Decision reason").closest("form")!);expect(mutations.approve).not.toHaveBeenCalled();
  fill("Approval reference (required for approval)","approval:synthetic");fireEvent.submit(screen.getByLabelText("Decision reason").closest("form")!);await screen.findByText(/Your action is saved/);
  expect(mutations.approve!.mock.calls[0]![0]).toMatchObject({action:"approve",proposalVersionId:id,expectedRevision:2,approvalReference:"approval:synthetic"});
});
test("uses the comparison digest and its own decision procedure",async()=>{
  view(<ProposalDecisionForm organizationId={id} decision={{kind:"comparison",comparisonId:id,expectedDigest:"a".repeat(64),actions:["reject"]}}/>);
  fill("Decision reason","A source quote changed");fireEvent.submit(screen.getByLabelText("Decision reason").closest("form")!);await screen.findByText(/Your action is saved/);
  expect(mutations.rejectComparison!.mock.calls[0]![0]).toMatchObject({action:"reject",comparisonId:id,expectedRevision:1,expectedDigest:"a".repeat(64)});expect(mutations.approve).not.toHaveBeenCalled();
});
test("prepares only selected distinct source versions",async()=>{
  view(<ProposalComparisonForm organizationId={id} intakeId={id} choices={[{proposalVersionId:id,vendorName:"Left vendor",versionNumber:1},{proposalVersionId:other,vendorName:"Right vendor",versionNumber:2}]}/>);
  fill("Comparison reason","Check original prices");fireEvent.click(screen.getByLabelText("Left vendor · Quote version 1"));
  fireEvent.submit(screen.getByLabelText("Comparison reason").closest("form")!);expect(mutations.prepareComparison).not.toHaveBeenCalled();
  fireEvent.click(screen.getByLabelText("Right vendor · Quote version 2"));fireEvent.submit(screen.getByLabelText("Comparison reason").closest("form")!);await screen.findByText(/Your action is saved/);
  expect(mutations.prepareComparison!.mock.calls[0]![0]).toMatchObject({action:"prepare",intakeId:id,proposalVersionIds:[id,other]});
});
