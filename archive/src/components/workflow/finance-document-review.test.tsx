import { QueryClient,QueryClientProvider } from "@tanstack/react-query";
import { cleanup,fireEvent,render,screen } from "@testing-library/react";
import { afterEach,beforeEach,expect,test,vi } from "vitest";
import { FinanceDocumentReview } from "./finance-document-review";
import { financeOrg,financeRow,financeAccess } from "./finance-document-test-fixtures";
const {decide,refresh}=vi.hoisted(()=>({decide:vi.fn(),refresh:vi.fn()}));
vi.mock("@/lib/trpc/client",()=>({useTRPC:()=>({financeDocuments:{decide:{mutationOptions:(options:object)=>({mutationFn:decide,...options})}}})}));
vi.mock("next/navigation",()=>({useRouter:()=>({refresh})}));
vi.mock("./finance-document-download",()=>({FinanceDocumentDownload:({onAccessReady}:{onAccessReady:(id:string)=>void})=><button type="button"
  onClick={()=>onAccessReady(financeAccess)}>Open exact finance file</button>}));
beforeEach(()=>{refresh.mockReset();decide.mockReset().mockImplementation(async input=>({organizationId:input.organizationId,documentId:input.documentId,
  versionId:input.versionId,action:input.action,state:input.action==="begin_review"?"needs_review":input.action==="approve"?"approved":"rejected",
  revision:input.expectedRevision+1,correlationId:input.correlationId,outcomeCode:"recorded"}));});
afterEach(cleanup);
function view(starting=false,canReview=true){return render(<QueryClientProvider client={new QueryClient()}><FinanceDocumentReview
  page={{organizationId:financeOrg,correlationId:financeAccess,document:{...financeRow,state:starting?"ready":"needs_review",revision:starting?4:5},canReview}}/></QueryClientProvider>);}
function fill(starting=false){fireEvent.change(screen.getByLabelText("Private review reason"),{target:{value:"Original terms checked"}});
  fireEvent.change(screen.getByLabelText("Review record reference"),{target:{value:"review:synthetic"}});
  if(!starting){fireEvent.click(screen.getByRole("button",{name:"Open exact finance file"}));fireEvent.click(screen.getByRole("checkbox"));}
  fireEvent.submit(screen.getByLabelText("Private review reason").closest("form")!);}
test("starts independent review without granting access or approval",async()=>{view(true);expect(screen.queryByRole("button",{name:"Open exact finance file"})).not.toBeInTheDocument();
  fill(true);await screen.findByText(/decision is recorded/);expect(decide.mock.calls[0][0]).toMatchObject({action:"begin_review",expectedRevision:4});
  expect(decide.mock.calls[0][0]).not.toHaveProperty("contentsReviewed");expect(decide.mock.calls[0][0]).not.toHaveProperty("reviewedAccessId");});
test("requires exact file access and content acknowledgement before a decision",async()=>{view();expect(screen.getByRole("button",{name:"Record decision"})).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Private review reason"),{target:{value:"Checked"}});fireEvent.change(screen.getByLabelText("Review record reference"),{target:{value:"review:synthetic"}});
  fireEvent.submit(screen.getByLabelText("Private review reason").closest("form")!);await screen.findByRole("alert");expect(decide).not.toHaveBeenCalled();fill();
  await screen.findByText(/decision is recorded/);expect(decide.mock.calls[0][0]).toMatchObject({action:"approve",reviewedAccessId:financeAccess,contentsReviewed:true,expectedRevision:5});});
test("retries an unknown decision with its original access grant and immutable command IDs",async()=>{decide.mockRejectedValueOnce(new Error("private error"));view();fill();
  expect(await screen.findByRole("alert")).not.toHaveTextContent("private error");fireEvent.click(screen.getByRole("button",{name:"Retry unchanged request"}));
  await screen.findByText(/decision is recorded/);expect(decide.mock.calls[1][0]).toEqual(decide.mock.calls[0][0]);});
test.each(["CONFLICT","FORBIDDEN","NOT_FOUND"])("requires reload for a known %s decision",async code=>{decide.mockRejectedValue({data:{code}});view();fill();
  await screen.findByRole("alert");expect(screen.queryByRole("button",{name:"Retry unchanged request"})).not.toBeInTheDocument();expect(screen.getByRole("button",{name:"Reload page"})).toBeEnabled();});
test("allows corrected rejected fields with new command identifiers",async()=>{decide.mockRejectedValueOnce({data:{code:"BAD_REQUEST"}});view();fill();await screen.findByRole("alert");
  expect(screen.getByLabelText("Private review reason")).toBeEnabled();fireEvent.submit(screen.getByLabelText("Private review reason").closest("form")!);
  await screen.findByText(/decision is recorded/);expect(decide.mock.calls[1][0].idempotencyKey).not.toBe(decide.mock.calls[0][0].idempotencyKey);});
test("does not claim a foreign action result or contradicting state as saved",async()=>{const original=decide.getMockImplementation()!;
  decide.mockImplementation(async input=>({...await original(input),state:"rejected"}));view();fill();await screen.findByRole("alert");expect(screen.queryByText(/decision is recorded/)).not.toBeInTheDocument();});
test("keeps denied reviewers outside the form",()=>{view(false,false);expect(screen.getByRole("status")).toHaveTextContent("cannot record a new decision");
  expect(screen.queryByRole("button",{name:"Record decision"})).not.toBeInTheDocument();});
test("keeps a saved decision after refresh fails",async()=>{refresh.mockImplementation(()=>{throw new Error("refresh failed");});view();fill();
  await screen.findByText("The page could not refresh. The recorded decision remains saved.");expect(screen.queryByRole("button",{name:"Retry unchanged request"})).not.toBeInTheDocument();});
