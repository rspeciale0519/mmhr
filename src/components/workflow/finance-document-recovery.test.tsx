import { QueryClient,QueryClientProvider } from "@tanstack/react-query";
import { cleanup,fireEvent,render,screen } from "@testing-library/react";
import { afterEach,beforeEach,expect,test,vi } from "vitest";
import { createWorkspaceDocumentFileManifest } from "@/lib/workspace-document-upload";
import type { FinanceDocumentRecoveryPage } from "@/lib/finance-document-recovery";
import { FinanceDocumentRecovery } from "./finance-document-recovery";
import { financeOrg,financeDoc,financeVersion,financeAccess,financeVendor,financeRow } from "./finance-document-test-fixtures";
const {complete,abandon,upload,from,refresh}=vi.hoisted(()=>({complete:vi.fn(),abandon:vi.fn(),upload:vi.fn(),from:vi.fn(),refresh:vi.fn()}));
vi.mock("@/lib/trpc/client",()=>({useTRPC:()=>({financeDocuments:{completeUpload:{mutationOptions:(options:object)=>({mutationFn:complete,...options})},
  abandonUpload:{mutationOptions:(options:object)=>({mutationFn:abandon,...options})}}})}));
vi.mock("@/lib/supabase/client",()=>({createClient:()=>({storage:{from}})}));
vi.mock("next/navigation",()=>({useRouter:()=>({refresh})}));
vi.mock("@/lib/workspace-document-upload",async original=>({...await original<object>(),createWorkspaceDocumentFileManifest:vi.fn()}));
function page():FinanceDocumentRecoveryPage{
  const createdAt=new Date(Date.now()-60_000).toISOString();return {organizationId:financeOrg,correlationId:financeVendor,
    reservationCorrelationId:financeAccess,sha256:"a".repeat(64),reservationExpiresAt:new Date(Date.parse(createdAt)+600_000).toISOString(),
    canResume:true,canAbandon:true,document:{...financeRow,state:"received",isCurrent:true,revision:1,failureCode:null,createdAt,updatedAt:createdAt}};
}
beforeEach(()=>{
  complete.mockReset().mockImplementation(async input=>({organizationId:input.organizationId,documentId:input.documentId,versionId:input.versionId,
    state:"quarantined",revision:2,correlationId:input.correlationId,outcomeCode:"recorded"}));
  abandon.mockReset().mockImplementation(async input=>({organizationId:input.organizationId,documentId:input.documentId,versionId:input.versionId,
    action:"abandon_upload",state:"rejected",revision:2,correlationId:input.correlationId,outcomeCode:"recorded"}));
  refresh.mockReset();from.mockReset().mockReturnValue({upload});upload.mockReset().mockImplementation(async path=>({data:{path,fullPath:`mmhr-document-quarantine/${path}`},error:null}));
  vi.mocked(createWorkspaceDocumentFileManifest).mockReset().mockResolvedValue({fileName:financeRow.fileName,declaredMimeType:financeRow.contentType,byteSize:financeRow.byteSize,sha256:"a".repeat(64)});
});
afterEach(()=>{cleanup();vi.useRealTimers();vi.restoreAllMocks();});
function view(changes:Partial<FinanceDocumentRecoveryPage>={}){return render(<QueryClientProvider client={new QueryClient()}><FinanceDocumentRecovery page={{...page(),...changes}}/></QueryClientProvider>);}
function resume(){const field=screen.getByLabelText(`Exact original file: ${financeRow.fileName}`);
  fireEvent.change(field,{target:{files:[new File(["PDF"],financeRow.fileName)]}});fireEvent.submit(field.closest("form")!);}
function stop(){const field=screen.getByLabelText("Reason to stop this upload");fireEvent.change(field,{target:{value:"The original upload cannot finish"}});
  fireEvent.click(screen.getByRole("checkbox"));fireEvent.submit(field.closest("form")!);}
test("resumes only the exact existing version, manifest and original reservation correlation",async()=>{
  view();resume();await screen.findByText(/upload is recorded/);expect(upload).toHaveBeenCalledWith(`${financeOrg}/${financeDoc}/${financeVersion}`,expect.any(File),
    {contentType:financeRow.contentType,cacheControl:"0",upsert:false});
  expect(complete.mock.calls[0][0]).toMatchObject({organizationId:financeOrg,documentId:financeDoc,versionId:financeVersion,expectedRevision:1,correlationId:financeAccess});
  expect(abandon).not.toHaveBeenCalled();
});
test.each(["fileName","declaredMimeType","byteSize","sha256"])("rejects changed original %s before Storage or completion",async field=>{
  const original=vi.mocked(createWorkspaceDocumentFileManifest).getMockImplementation()!;
  vi.mocked(createWorkspaceDocumentFileManifest).mockImplementation(async file=>({...await original(file),[field]:field==="byteSize"?13:"changed"}));
  view();resume();await screen.findByRole("alert");expect(upload).not.toHaveBeenCalled();expect(complete).not.toHaveBeenCalled();
  expect(screen.getByRole("button",{name:"Resume this exact upload"})).toBeEnabled();
});
test("checks a preexisting immutable Storage object through completion after409",async()=>{
  upload.mockResolvedValue({data:null,error:{statusCode:"409"}});view();resume();await screen.findByText(/upload is recorded/);
  expect(complete).toHaveBeenCalledOnce();expect(upload.mock.calls[0][2].upsert).toBe(false);
});
test("retains the exact original completion key after an unknown reply without resending bytes",async()=>{
  complete.mockRejectedValueOnce(new Error("lost completion"));view();resume();fireEvent.click(await screen.findByRole("button",{name:"Retry unchanged request"}));
  await screen.findByText(/upload is recorded/);expect(complete.mock.calls[1][0]).toEqual(complete.mock.calls[0][0]);expect(upload).toHaveBeenCalledOnce();
});
test("retains the exact selected bytes after unknown Storage and uses409 to check completion",async()=>{
  upload.mockRejectedValueOnce(new Error("lost Storage")).mockResolvedValueOnce({data:null,error:{statusCode:"409"}});view();resume();
  fireEvent.click(await screen.findByRole("button",{name:"Retry unchanged request"}));await screen.findByText(/upload is recorded/);
  expect(upload.mock.calls[1]).toEqual(upload.mock.calls[0]);expect(complete).toHaveBeenCalledOnce();
});
test("shows staff-only and expired recovery without a resume control",async()=>{
  const {unmount}=view({canResume:false});expect(screen.queryByRole("button",{name:"Resume this exact upload"})).not.toBeInTheDocument();
  expect(screen.getByRole("button",{name:"Stop this unfinished upload"})).toBeEnabled();unmount();
  const expired=page();expired.document.createdAt=new Date(Date.now()-700_000).toISOString();expired.reservationExpiresAt=new Date(Date.now()-100_000).toISOString();
  view(expired);await screen.findByText(/reservation expired/);expect(screen.queryByRole("button",{name:"Resume this exact upload"})).not.toBeInTheDocument();
});
test("blocks a new resume after the reservation expires while the page stays open",async()=>{
  const current=page();current.reservationExpiresAt=new Date(Date.now()+1000).toISOString();view(current);
  const spy=vi.spyOn(Date,"now").mockReturnValue(Date.parse(current.reservationExpiresAt));resume();await screen.findByRole("alert");
  expect(upload).not.toHaveBeenCalled();expect(complete).not.toHaveBeenCalled();spy.mockRestore();
});
test("requires a safe reason and explicit confirmation before abandonment",async()=>{
  view();const field=screen.getByLabelText("Reason to stop this upload");fireEvent.change(field,{target:{value:"https://private.example"}});
  fireEvent.submit(field.closest("form")!);await screen.findByRole("alert");expect(abandon).not.toHaveBeenCalled();
  fireEvent.change(field,{target:{value:"The original upload cannot finish"}});fireEvent.submit(field.closest("form")!);expect(abandon).not.toHaveBeenCalled();
});
test("records received-only abandonment with current revision and separate IDs without deleting files",async()=>{
  view();stop();await screen.findByText(/unfinished version is rejected/);expect(abandon.mock.calls[0][0]).toMatchObject({organizationId:financeOrg,
    documentId:financeDoc,versionId:financeVersion,expectedRevision:1,reason:"The original upload cannot finish"});
  expect(abandon.mock.calls[0][0].correlationId).not.toBe(financeAccess);expect(upload).not.toHaveBeenCalled();expect(complete).not.toHaveBeenCalled();
});
test("retains exact abandonment payload after unknown response and locks the competing resume",async()=>{
  abandon.mockRejectedValueOnce(new Error("lost response"));view();stop();const retry=await screen.findByRole("button",{name:"Retry unchanged request"});
  expect(screen.getByRole("button",{name:"Resume this exact upload"})).toBeDisabled();fireEvent.click(retry);await screen.findByText(/unfinished version is rejected/);
  expect(abandon.mock.calls[1][0]).toEqual(abandon.mock.calls[0][0]);
});
test.each(["CONFLICT","FORBIDDEN","NOT_FOUND"])("offers reload without unchanged abandonment retry for %s",async code=>{
  abandon.mockRejectedValue({data:{code}});view();stop();await screen.findByRole("alert");
  expect(screen.queryByRole("button",{name:"Retry unchanged request"})).not.toBeInTheDocument();expect(screen.getByRole("button",{name:"Reload page"})).toBeEnabled();
});
test("allows corrected known BAD_REQUEST abandonment with new command IDs",async()=>{
  abandon.mockRejectedValueOnce({data:{code:"BAD_REQUEST"}});view();stop();await screen.findByRole("alert");
  const field=screen.getByLabelText("Reason to stop this upload");expect(field).toBeEnabled();fireEvent.submit(field.closest("form")!);
  await screen.findByText(/unfinished version is rejected/);expect(abandon.mock.calls[1][0].idempotencyKey).not.toBe(abandon.mock.calls[0][0].idempotencyKey);
});
test("rejects a foreign abandonment reply, preserves IDs and shows no saved decision",async()=>{
  const original=abandon.getMockImplementation()!;abandon.mockImplementationOnce(async input=>({...await original(input),versionId:financeVendor}));
  view();stop();await screen.findByRole("alert");expect(screen.queryByText(/unfinished version is rejected/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button",{name:"Retry unchanged request"}));await screen.findByText(/unfinished version is rejected/);
  expect(abandon.mock.calls[1][0]).toEqual(abandon.mock.calls[0][0]);
});
test("preserves saved abandonment after page refresh failure and wraps long names",async()=>{
  refresh.mockImplementation(()=>{throw new Error("refresh failed");});view();stop();await screen.findByText("The page could not refresh. The recorded result remains saved.");
  expect(screen.getByRole("region",{name:"Recover an unfinished finance upload"})).toHaveClass("[overflow-wrap:anywhere]");
  expect(screen.queryByRole("button",{name:"Retry unchanged request"})).not.toBeInTheDocument();
});
