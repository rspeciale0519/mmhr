import { QueryClient,QueryClientProvider } from "@tanstack/react-query";
import { cleanup,fireEvent,render,screen } from "@testing-library/react";
import { afterEach,beforeEach,expect,test,vi } from "vitest";
import { createWorkspaceDocumentFileManifest } from "@/lib/workspace-document-upload";
import { FinanceDocumentUpload } from "./finance-document-upload";
import { financeSources,financeOrg,financeDoc,financeVendor } from "./finance-document-test-fixtures";
const {prepare,complete,upload,from,refresh}=vi.hoisted(()=>({prepare:vi.fn(),complete:vi.fn(),upload:vi.fn(),from:vi.fn(),refresh:vi.fn()}));
vi.mock("@/lib/trpc/client",()=>({useTRPC:()=>({financeDocuments:{prepareUpload:{mutationOptions:(options:object)=>({mutationFn:prepare,...options})},
  completeUpload:{mutationOptions:(options:object)=>({mutationFn:complete,...options})}}})}));
vi.mock("@/lib/supabase/client",()=>({createClient:()=>({storage:{from}})}));
vi.mock("next/navigation",()=>({useRouter:()=>({refresh})}));
vi.mock("@/lib/workspace-document-upload",async original=>({...await original<object>(),createWorkspaceDocumentFileManifest:vi.fn()}));
beforeEach(()=>{
  prepare.mockReset().mockImplementation(async input=>({organizationId:input.organizationId,documentId:input.documentId,versionId:input.versionId,
    version:input.expectedVersion+1,state:"received",revision:1,correlationId:input.correlationId,outcomeCode:"recorded"}));
  complete.mockReset().mockImplementation(async input=>({organizationId:input.organizationId,documentId:input.documentId,versionId:input.versionId,
    state:"quarantined",revision:2,correlationId:input.correlationId,outcomeCode:"recorded"}));
  refresh.mockReset();from.mockReset().mockReturnValue({upload});upload.mockReset().mockImplementation(async path=>({data:{path,fullPath:`mmhr-document-quarantine/${path}`},error:null}));
  vi.mocked(createWorkspaceDocumentFileManifest).mockReset().mockResolvedValue({fileName:"synthetic.pdf",declaredMimeType:"application/pdf",byteSize:12,sha256:"a".repeat(64)});
});
afterEach(cleanup);
function view(replacement=false){return render(<QueryClientProvider client={new QueryClient()}><FinanceDocumentUpload sources={financeSources}
  replacement={replacement?{documentId:financeDoc,expectedVersion:2,binding:{documentId:financeDoc,vendorLabel:"Historical vendor",dealLabel:null,
    source:{sourceClass:"agreement",vendorOrganizationId:financeVendor}}}:undefined}/></QueryClientProvider>);}
function submit(replacement=false){if(!replacement)fireEvent.change(screen.getByLabelText("Agreement vendor"),{target:{value:financeVendor}});
  const field=screen.getByLabelText("Finance document file");fireEvent.change(field,{target:{files:[new File(["%PDF-1.7"],"synthetic.pdf",{type:"application/pdf"})]}});fireEvent.submit(field.closest("form")!);}
test("uses an actual labeled source and exact private reservation identifiers",async()=>{
  view();expect(screen.getByRole("option",{name:"Verified vendor"})).toBeInTheDocument();expect(screen.queryByRole("textbox")).not.toBeInTheDocument();submit();
  await screen.findByText(/private upload is recorded/);const input=prepare.mock.calls[0][0];expect(input.source).toEqual(financeSources.choices[0].source);
  expect(upload).toHaveBeenCalledWith(`${financeOrg}/${input.documentId}/${input.versionId}`,expect.any(File),{contentType:"application/pdf",cacheControl:"0",upsert:false});
  expect(complete.mock.calls[0][0]).toMatchObject({organizationId:financeOrg,documentId:input.documentId,versionId:input.versionId,expectedRevision:1,correlationId:input.correlationId});
  expect(screen.getByRole("link",{name:"Check recorded finance versions"})).toHaveAttribute("href",`/admin/finance/documents?document=${input.documentId}`);
});
test("does not send an unselected or forged source",async()=>{view();const field=screen.getByLabelText("Finance document file");
  fireEvent.change(field,{target:{files:[new File(["PDF"],"synthetic.pdf")]}});fireEvent.submit(field.closest("form")!);await screen.findByRole("alert");expect(prepare).not.toHaveBeenCalled();});
test("rejects invalid files before reservation or Storage",async()=>{vi.mocked(createWorkspaceDocumentFileManifest).mockRejectedValue(new Error("private parse detail"));
  view();submit();expect(await screen.findByRole("alert")).not.toHaveTextContent("private parse detail");expect(prepare).not.toHaveBeenCalled();expect(upload).not.toHaveBeenCalled();});
test("retries unknown reservations with identical manifest, source and command IDs",async()=>{prepare.mockRejectedValueOnce(new Error("lost response"));view();submit();
  fireEvent.click(await screen.findByRole("button",{name:"Retry unchanged request"}));await screen.findByText(/private upload is recorded/);
  expect(prepare.mock.calls[1][0]).toEqual(prepare.mock.calls[0][0]);expect(upload).toHaveBeenCalledOnce();});
test.each(["CONFLICT","FORBIDDEN","NOT_FOUND"])("offers reload without an unchanged mutation for %s",async code=>{
  prepare.mockRejectedValue({data:{code}});view();submit();await screen.findByRole("alert");expect(screen.queryByRole("button",{name:"Retry unchanged request"})).not.toBeInTheDocument();
  expect(screen.getByRole("button",{name:"Reload page"})).toBeEnabled();expect(upload).not.toHaveBeenCalled();});
test("allows corrected BAD_REQUEST fields with fresh request IDs",async()=>{prepare.mockRejectedValueOnce({data:{code:"BAD_REQUEST"}});view();submit();await screen.findByRole("alert");
  expect(screen.getByLabelText("Agreement vendor")).toBeEnabled();submit();await screen.findByText(/private upload is recorded/);
  expect(prepare.mock.calls[1][0].idempotencyKey).not.toBe(prepare.mock.calls[0][0].idempotencyKey);});
test("retries the same reserved bytes after a lost Storage reply and checks a duplicate safely",async()=>{
  upload.mockRejectedValueOnce(new Error("lost upload")).mockResolvedValueOnce({error:{statusCode:"409"},data:null});view();submit();
  fireEvent.click(await screen.findByRole("button",{name:"Retry unchanged request"}));await screen.findByText(/private upload is recorded/);
  expect(prepare).toHaveBeenCalledOnce();expect(upload.mock.calls[1]).toEqual(upload.mock.calls[0]);expect(complete).toHaveBeenCalledOnce();});
test("retries completion with its original command and never resends known stored bytes",async()=>{complete.mockRejectedValueOnce(new Error("lost completion"));view();submit();
  fireEvent.click(await screen.findByRole("button",{name:"Retry unchanged request"}));await screen.findByText(/private upload is recorded/);
  expect(complete.mock.calls[1][0]).toEqual(complete.mock.calls[0][0]);expect(upload).toHaveBeenCalledOnce();});
test("does not write bytes after a foreign reservation response",async()=>{const original=prepare.getMockImplementation()!;
  prepare.mockImplementation(async input=>({...await original(input),documentId:financeVendor}));view();submit();await screen.findByRole("alert");expect(upload).not.toHaveBeenCalled();});
test("blocks duplicate requests and preserves recorded success after refresh failure",async()=>{
  let finish!:(value:unknown)=>void;const original=prepare.getMockImplementation()!;prepare.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
  refresh.mockImplementation(()=>{throw new Error("refresh failed");});view();submit();await screen.findByText("Reserving the finance document.");
  fireEvent.submit(screen.getByLabelText("Finance document file").closest("form")!);expect(prepare).toHaveBeenCalledOnce();
  finish(await original(prepare.mock.calls[0][0]));await screen.findByText("The page could not refresh. The recorded upload remains saved.");
  expect(screen.queryByRole("button",{name:"Retry unchanged request"})).not.toBeInTheDocument();});
test("keeps a replacement on its immutable recorded source",async()=>{view(true);expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  expect(screen.getByText("Historical vendor")).toBeInTheDocument();submit(true);await screen.findByText(/private upload is recorded/);
  expect(prepare.mock.calls[0][0]).toMatchObject({documentId:financeDoc,expectedVersion:2,source:financeSources.choices[0].source});
  expect(screen.queryByRole("button",{name:"Upload another file"})).not.toBeInTheDocument();});
test("shows an empty source state and retains narrow label wrapping",()=>{
  render(<QueryClientProvider client={new QueryClient()}><FinanceDocumentUpload sources={{...financeSources,choices:[]}}/></QueryClientProvider>);
  expect(screen.getByRole("button",{name:"Upload privately"})).toBeDisabled();expect(screen.getByRole("status")).toHaveTextContent("No eligible recorded sources");
  expect(screen.getByRole("region",{name:"Upload a finance document"})).toHaveClass("[overflow-wrap:anywhere]");});
test("uses the exact stored signed customer contract choice without asking for source IDs",async()=>{
  const source={sourceClass:"signed_contract" as const,vendorOrganizationId:financeVendor,contractId:financeDoc,
    handoffId:financeVendor,dealId:financeOrg};
  render(<QueryClientProvider client={new QueryClient()}><FinanceDocumentUpload sources={{...financeSources,workspaceType:"customer",
    choices:[{choiceId:financeVendor,vendorLabel:"Verified vendor",dealLabel:"Customer payroll contract",source}]}}/></QueryClientProvider>);
  fireEvent.change(screen.getByLabelText("Signed customer contract"),{target:{value:financeVendor}});
  const field=screen.getByLabelText("Finance document file");fireEvent.change(field,{target:{files:[new File(["PDF"],"synthetic.pdf")]}});
  fireEvent.submit(field.closest("form")!);await screen.findByText(/private upload is recorded/);
  expect(prepare.mock.calls[0][0].source).toEqual(source);expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
});
test.each(["401","403","400","413"])("stops after a known Storage rejection %s",async statusCode=>{
  upload.mockResolvedValue({error:{statusCode},data:null});view();submit();await screen.findByRole("alert");
  expect(complete).not.toHaveBeenCalled();expect(screen.queryByRole("button",{name:"Retry unchanged request"})).not.toBeInTheDocument();
  expect(screen.getByRole("button",{name:"Reload page"})).toBeEnabled();
});
test("retains the original completion retry after a foreign response without claiming success",async()=>{
  const original=complete.getMockImplementation()!;complete.mockImplementationOnce(async input=>({...await original(input),organizationId:financeVendor}));
  view();submit();await screen.findByRole("alert");expect(screen.queryByText(/private upload is recorded/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button",{name:"Retry unchanged request"}));await screen.findByText(/private upload is recorded/);
  expect(complete.mock.calls[1][0]).toEqual(complete.mock.calls[0][0]);expect(upload).toHaveBeenCalledOnce();
});
