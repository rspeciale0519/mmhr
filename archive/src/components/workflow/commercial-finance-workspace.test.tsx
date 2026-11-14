import { QueryClient,QueryClientProvider } from "@tanstack/react-query";
import { cleanup,fireEvent,render,screen,waitFor } from "@testing-library/react";
import { afterEach,beforeEach,expect,test,vi } from "vitest";
import { CommercialFinanceWorkspace,CommercialFinanceList,type CommercialFinanceClient } from "./commercial-finance-workspace";
import { CommercialNewAgreement,CommercialApprovedOriginalChoices } from "./commercial-finance-original-choices";
import { CommercialCalculationDetails } from "./commercial-finance-display";
import { managedFinancePageSchema } from "@/lib/managed-finance-reads";
import { commercialAgreement,commercialCalculation,commercialChoices,commercialResult,commercialOrg,commercialId,commercialCorrelation } from "./commercial-finance-test-fixtures";
const {execute,refresh,download}=vi.hoisted(()=>({execute:vi.fn(),refresh:vi.fn(),download:vi.fn()}));
vi.mock("next/navigation",()=>({useRouter:()=>({refresh})}));
vi.mock("./finance-document-download",()=>({FinanceDocumentDownload:(props:unknown)=>{download(props);return <p>Exact finance download</p>;}}));
beforeEach(()=>{refresh.mockReset();download.mockReset();execute.mockReset().mockImplementation(async input=>commercialResult(input));});afterEach(cleanup);
test("opens invoice readiness from the stored approved commission event",()=>{
  const calculation={...commercialCalculation().calculation,state:"approved" as const};
  render(<CommercialCalculationDetails organizationId={commercialOrg} calculation={calculation}/>);
  expect(screen.getByRole("link",{name:"Invoice readiness"})).toHaveAttribute("href",`/admin/finance/invoices?commissionEventId=${calculation.commissionEventId}`);
});
test("does not offer invoice preparation for a pending calculation",()=>{
  render(<CommercialCalculationDetails organizationId={commercialOrg} calculation={commercialCalculation().calculation}/>);
  expect(screen.queryByRole("link",{name:"Invoice readiness"})).not.toBeInTheDocument();
});
const request={organizationId:commercialOrg,correlationId:commercialCorrelation,view:"agreements" as const};
function provider(element:React.ReactNode){return render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false,staleTime:Infinity}}})}>{element}</QueryClientProvider>);}
function sources(input:{organizationId:string;correlationId:string}){return {organizationId:input.organizationId,correlationId:input.correlationId,workspaceType:"internal",choices:[{choiceId:commercialId(4),vendorLabel:"Synthetic vendor",dealLabel:null,source:commercialChoices().source}],nextCursor:null,documentBinding:null};}
function api():CommercialFinanceClient{return {list:vi.fn(async input=>({...input,items:[commercialAgreement().agreement],nextCursor:null})),
  detail:vi.fn(async input=>({...commercialAgreement(),correlationId:input.correlationId})),originals:vi.fn(async input=>({...commercialChoices(),correlationId:input.correlationId})),
  sources:vi.fn(async input=>sources(input)),execute};}
test("shows actual vendor labels and status without rendering identifiers",()=>{const page=managedFinancePageSchema.parse({...request,items:[commercialAgreement().agreement],nextCursor:null});
  const {container}=render(<CommercialFinanceList page={page}/>);expect(screen.getByRole("link",{name:"Synthetic vendor"})).toHaveAttribute("href",`/admin/finance/commercial?view=agreement&entityId=${commercialId(3)}`);
  expect(container.textContent).not.toContain(commercialId(3));expect(container.querySelector("li")).toHaveClass("[overflow-wrap:anywhere]");});
test("provides a bounded list page with an empty state",()=>{render(<CommercialFinanceList page={managedFinancePageSchema.parse({...request,items:[],nextCursor:null})}/>);
  expect(screen.getByRole("status")).toHaveTextContent("No finance records");expect(screen.queryByRole("link",{name:"Next record page"})).not.toBeInTheDocument();});
test("uses returned record cursor in navigation",()=>{const items=Array.from({length:25},(_,index)=>({...commercialAgreement().agreement,agreementId:commercialId(index+40)}));
  render(<CommercialFinanceList page={managedFinancePageSchema.parse({...request,items,nextCursor:commercialId(64)})}/>);
  expect(screen.getByRole("link",{name:"Next record page"})).toHaveAttribute("href",`/admin/finance/commercial?view=agreements&afterId=${commercialId(64)}`);});
test("keeps unknown contract total distinct from known zero commission and enforces workspace switch for agreement original",()=>{const calculation=commercialCalculation().calculation;
  render(<CommercialCalculationDetails organizationId={commercialOrg} calculation={calculation}/>);expect(screen.getByText("$0.00")).toBeInTheDocument();
  expect(screen.getByText("Commission currency").nextElementSibling).toHaveTextContent("USD");
  expect(screen.getAllByText("Unknown").length).toBe(2);expect(screen.getByRole("link",{name:"Select the original's finance workspace"})).toHaveAttribute("href","/workspaces");
  expect(download).toHaveBeenCalledTimes(1);expect(download.mock.calls[0][0]).toMatchObject({organizationId:commercialOrg,document:calculation.contractOriginal.document,purpose:"finance_original"});});
test("loads stored records and current source choices with their separate exact scopes",async()=>{const methods=api();provider(<CommercialFinanceWorkspace workspaceLabel="Synthetic internal workspace" workspaceType="internal" request={request} api={methods}/>);
  await screen.findByRole("link",{name:"Synthetic vendor"});expect(methods.list).toHaveBeenCalledWith(request);await screen.findByLabelText("Eligible vendor");
  expect(methods.sources).toHaveBeenCalledWith(expect.objectContaining({organizationId:commercialOrg}));expect(methods.originals).not.toHaveBeenCalled();});
test("shows loading without enabling mutation controls",()=>{const methods=api();methods.list=vi.fn(()=>new Promise(()=>{}));provider(<CommercialFinanceWorkspace workspaceLabel="Synthetic workspace" workspaceType="internal" request={request} api={methods}/>);
  expect(screen.getByRole("status")).toHaveTextContent("Loading the current finance");expect(screen.queryByRole("button",{name:"Record proposed terms"})).not.toBeInTheDocument();});
test("rejects a foreign page response before rendering source rows or mutation controls",async()=>{const methods=api();methods.list=vi.fn(async input=>({...input,organizationId:commercialId(99),items:[commercialAgreement().agreement],nextCursor:null}));
  provider(<CommercialFinanceWorkspace workspaceLabel="Synthetic workspace" workspaceType="internal" request={request} api={methods}/>);await screen.findByRole("alert");
  expect(screen.queryByRole("link",{name:"Synthetic vendor"})).not.toBeInTheDocument();expect(methods.sources).not.toHaveBeenCalled();});
test("does not request an agreement view from a customer workspace",()=>{const methods=api();provider(<CommercialFinanceWorkspace workspaceLabel="Synthetic customer" workspaceType="customer" request={request} api={methods}/>);
  expect(screen.getByRole("alert")).toHaveTextContent("Select the required finance workspace");expect(methods.list).not.toHaveBeenCalled();});
test("loads a chosen stored vendor's approved originals without a manual identifier field",async()=>{const methods=api();provider(<CommercialNewAgreement organizationId={commercialOrg} readSources={methods.sources} readOriginals={methods.originals} execute={execute}/>);
  fireEvent.change(await screen.findByLabelText("Eligible vendor"),{target:{value:commercialId(4)}});await screen.findByLabelText("Approved source original");
  expect(methods.originals).toHaveBeenCalledWith(expect.objectContaining({organizationId:commercialOrg,source:commercialChoices().source}));
  expect(screen.queryByLabelText(/identifier|uuid/i)).not.toBeInTheDocument();});
test("rejects mismatched original source response before enabling preparation",async()=>{const choices=commercialChoices();const read=vi.fn(async input=>({...choices,correlationId:input.correlationId,source:{...choices.source,vendorOrganizationId:commercialId(99)}}));
  provider(<CommercialApprovedOriginalChoices organizationId={commercialOrg} source={choices.source} read={read} execute={execute}/>);await screen.findByRole("alert");
  expect(screen.queryByLabelText("Approved source original")).not.toBeInTheDocument();});
test("clears selected vendor and preparation when changing source pages",async()=>{const readSources=vi.fn(async input=>input.afterId?{...sources(input),choices:[],nextCursor:null}:{...sources(input),
  choices:Array.from({length:25},(_,index)=>({choiceId:commercialId(index+40),vendorLabel:`Synthetic vendor ${index}`,dealLabel:null,source:{sourceClass:"agreement",vendorOrganizationId:commercialId(index+40)}})),nextCursor:commercialId(64)});
  const readOriginals=vi.fn(async input=>({...commercialChoices(),source:input.source,correlationId:input.correlationId}));
  provider(<CommercialNewAgreement organizationId={commercialOrg} readSources={readSources} readOriginals={readOriginals} execute={execute}/>);
  fireEvent.change(await screen.findByLabelText("Eligible vendor"),{target:{value:commercialId(40)}});await screen.findByLabelText("Approved source original");
  fireEvent.click(screen.getByRole("button",{name:"Next vendor page"}));await screen.findByText("No eligible vendors are available on this page.");expect(screen.getByLabelText("Eligible vendor")).toHaveValue("");
  expect(screen.queryByLabelText("Approved source original")).not.toBeInTheDocument();expect(readSources.mock.calls[1][0]).toMatchObject({afterId:commercialId(64)});});
test("provides known denied read states without private provider errors or write retries",async()=>{const methods=api();methods.list=vi.fn(async()=>{throw {data:{code:"NOT_FOUND"},message:"private provider detail"};});
  provider(<CommercialFinanceWorkspace workspaceLabel="Synthetic workspace" workspaceType="internal" request={request} api={methods}/>);expect(await screen.findByRole("alert")).toHaveTextContent("current account");
  expect(screen.queryByText(/private provider detail/)).not.toBeInTheDocument();expect(screen.queryByRole("button",{name:"Retry unchanged request"})).not.toBeInTheDocument();});
test("renders latest source versions with a stored decision and labeled original",async()=>{const methods=api(),detail=commercialAgreement(),detailRequest={...request,view:"agreement" as const,entityId:detail.entityId};
  provider(<CommercialFinanceWorkspace workspaceLabel="Synthetic workspace" workspaceType="internal" request={detailRequest} api={methods}/>);await screen.findByRole("heading",{name:"Stored source versions"});
  expect(screen.getByText(/Prepared by: Synthetic preparer/)).toBeInTheDocument();await waitFor(()=>expect(methods.originals).toHaveBeenCalledWith(expect.objectContaining({source:commercialChoices().source})));});
