import { QueryClient,QueryClientProvider } from "@tanstack/react-query";
import { cleanup,fireEvent,render,screen } from "@testing-library/react";
import { afterEach,beforeEach,expect,test,vi } from "vitest";
import { FinanceDocumentDownload } from "./finance-document-download";
import { financeOrg,financeRow,financeAccess } from "./finance-document-test-fixtures";
const {issue}=vi.hoisted(()=>({issue:vi.fn()}));
vi.mock("@/lib/trpc/client",()=>({useTRPC:()=>({financeDocuments:{issueAccess:{mutationOptions:(options:object)=>({mutationFn:issue,...options})}}})}));
const fetchFile=vi.fn(),ready=vi.fn(),createUrl=vi.fn(),revokeUrl=vi.fn();
beforeEach(()=>{
  issue.mockReset().mockImplementation(async input=>{const issuedAt=new Date().toISOString();return {organizationId:input.organizationId,documentId:input.documentId,
    versionId:input.versionId,revision:input.expectedRevision,purpose:input.purpose,correlationId:input.correlationId,accessId:financeAccess,accessToken:"a".repeat(64),
    issuedAt,expiresAt:new Date(Date.parse(issuedAt)+60_000).toISOString(),outcomeCode:"recorded"};});
  fetchFile.mockReset().mockResolvedValue({ok:true,headers:new Headers({"content-type":"application/octet-stream","content-length":"12"}),blob:async()=>new Blob([new Uint8Array(12)])});
  ready.mockReset();createUrl.mockReset().mockReturnValue("blob:https://mmhr.example.invalid/private");revokeUrl.mockReset();
  Object.defineProperty(URL,"createObjectURL",{configurable:true,value:createUrl});Object.defineProperty(URL,"revokeObjectURL",{configurable:true,value:revokeUrl});
  vi.stubGlobal("fetch",fetchFile);vi.spyOn(HTMLAnchorElement.prototype,"click").mockImplementation(()=>{});
});
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();});
function view(){return render(<QueryClientProvider client={new QueryClient()}><FinanceDocumentDownload organizationId={financeOrg} document={financeRow}
  purpose="finance_review" onAccessReady={ready}/></QueryClientProvider>);}
function start(){fireEvent.click(screen.getByRole("button",{name:"Download this exact version"}));}
test("posts the exact session grant without a token URL or ordinary document endpoint",async()=>{
  view();start();await screen.findByText(/Download started/);expect(issue.mock.calls[0][0]).toMatchObject({organizationId:financeOrg,
    documentId:financeRow.documentId,versionId:financeRow.versionId,expectedRevision:5,purpose:"finance_review"});
  expect(fetchFile.mock.calls[0][0]).toBe("/api/finance/documents/access");const request=fetchFile.mock.calls[0][1];
  expect(request).toMatchObject({method:"POST",credentials:"same-origin",cache:"no-store",redirect:"error"});
  expect(JSON.parse(request.body)).toMatchObject({accessId:financeAccess,accessToken:"a".repeat(64)});expect(ready).toHaveBeenCalledWith(financeAccess);
});
test("keeps unknown issue retries unchanged",async()=>{issue.mockRejectedValueOnce(new Error("private provider error"));view();start();
  expect(await screen.findByRole("alert")).not.toHaveTextContent("private provider error");fireEvent.click(screen.getByRole("button",{name:"Retry unchanged request"}));
  await screen.findByText(/Download started/);expect(issue.mock.calls[1][0]).toEqual(issue.mock.calls[0][0]);});
test.each(["BAD_REQUEST","CONFLICT","NOT_FOUND","FORBIDDEN"])("does not offer uncertain retries for %s",async code=>{
  issue.mockRejectedValue({data:{code}});view();start();await screen.findByRole("alert");expect(screen.queryByRole("button",{name:"Retry unchanged request"})).not.toBeInTheDocument();
  expect(screen.getByRole("button",{name:"Reload page"})).toBeEnabled();expect(fetchFile).not.toHaveBeenCalled();});
test("rejects a foreign exact-version grant before file access",async()=>{const original=issue.getMockImplementation()!;
  issue.mockImplementation(async input=>({...await original(input),versionId:financeAccess}));view();start();await screen.findByRole("alert");expect(fetchFile).not.toHaveBeenCalled();expect(ready).not.toHaveBeenCalled();});
test.each(["type","length","bytes","transport"])("does not open a failed %s response",async failure=>{
  if(failure==="transport")fetchFile.mockRejectedValue(new Error("private transport"));else fetchFile.mockResolvedValue({ok:true,
    headers:new Headers({"content-type":failure==="type"?"text/html":"application/octet-stream","content-length":failure==="length"?"13":"12"}),
    blob:async()=>new Blob([new Uint8Array(failure==="bytes"?13:12)])});view();start();await screen.findByRole("alert");expect(ready).not.toHaveBeenCalled();expect(createUrl).not.toHaveBeenCalled();});
test("keeps a failed read on the known grant and uses new command IDs only for fresh access",async()=>{
  fetchFile.mockRejectedValueOnce(new Error("lost read"));view();start();await screen.findByRole("alert");fireEvent.click(screen.getByRole("button",{name:"Retry this download"}));
  await screen.findByText(/Download started/);expect(issue).toHaveBeenCalledOnce();start();await vi.waitFor(()=>expect(issue).toHaveBeenCalledTimes(2));
  expect(issue.mock.calls[1][0].idempotencyKey).not.toBe(issue.mock.calls[0][0].idempotencyKey);});
test("treats a denied HTTP read as known and removes the object URL after successful use",async()=>{
  fetchFile.mockResolvedValueOnce({ok:false,status:404});const rendered=view();start();await screen.findByRole("alert");expect(screen.queryByRole("button",{name:"Request fresh access"})).not.toBeInTheDocument();
  rendered.unmount();view();start();await screen.findByText(/Download started/);cleanup();expect(revokeUrl).toHaveBeenCalledOnce();});
