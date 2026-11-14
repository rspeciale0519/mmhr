import { cleanup,render,screen } from "@testing-library/react";
import { afterEach,beforeEach,expect,test,vi } from "vitest";
import { AuthorizationError } from "@/server/auth/authorization";
import { FinanceDocumentWorkspace } from "./finance-document-workspace";
import { financeOrg,financeRow,financeSources,financeDoc,financeVersion,financeVendor } from "./finance-document-test-fixtures";
const {selected,authority,sources,list,versions,history,review,recovery,forbidden,notFound}=vi.hoisted(()=>({selected:vi.fn(),authority:vi.fn(),sources:vi.fn(),list:vi.fn(),recovery:vi.fn(),
  versions:vi.fn(),history:vi.fn(),review:vi.fn(),forbidden:vi.fn(()=>{throw new Error("Forbidden boundary");}),notFound:vi.fn(()=>{throw new Error("Not found boundary");})}));
vi.mock("@/server/auth/page-guards",()=>({requireSelectedOrganizationPermission:selected}));
vi.mock("@/server/commands/finance-document-upload",()=>({requireFinanceDocumentAuthority:authority}));
vi.mock("@/server/commands/finance-document-sources",()=>({getFinanceDocumentSources:sources}));
vi.mock("@/server/commands/finance-documents",()=>({getFinanceDocuments:list,getFinanceDocumentVersions:versions,getFinanceDocumentHistory:history}));
vi.mock("@/server/commands/finance-document-review",()=>({getFinanceDocumentReview:review}));
vi.mock("@/server/commands/finance-document-recovery",()=>({getFinanceDocumentRecovery:recovery}));
vi.mock("next/navigation",()=>({forbidden,notFound}));
vi.mock("./finance-document-view",()=>({FinanceDocumentRowView:({row}:{row:{fileName:string}})=><p>{row.fileName}</p>}));
vi.mock("./finance-document-upload",()=>({FinanceDocumentUpload:({replacement}:{replacement?:{expectedVersion:number}})=><p>{replacement?`Replacement at version ${replacement.expectedVersion}`:"Labeled finance upload"}</p>}));
vi.mock("./finance-document-review",()=>({FinanceDocumentReview:()=> <p>Independent finance decision</p>}));
vi.mock("./finance-document-recovery",()=>({FinanceDocumentRecovery:()=> <p>Recover the exact unfinished upload</p>}));
beforeEach(()=>{
  for(const mock of [selected,authority,sources,list,versions,history,review,recovery,forbidden,notFound])mock.mockClear();
  selected.mockReset().mockResolvedValue({authorization:{scope:{kind:"organization",organizationId:financeOrg},assurance:"aal2",supabase:{}}});
  authority.mockReset().mockResolvedValue({});sources.mockReset().mockImplementation(async input=>({...financeSources,correlationId:input.correlationId,
    documentBinding:input.documentId?{documentId:input.documentId,vendorLabel:"Recorded vendor",dealLabel:null,source:financeSources.choices[0].source}:null}));
  list.mockReset().mockResolvedValue({...financeSources,items:[financeRow],canUpload:true,nextCursor:null});
  versions.mockReset().mockResolvedValue({organizationId:financeOrg,documentId:financeDoc,currentVersion:1,canUpload:true,items:[{...financeRow,state:"approved"}],nextVersion:null});
  history.mockReset().mockResolvedValue({items:[{revision:1,action:"reserve",occurredAt:"2026-10-01T00:00:00Z"}],nextRevision:null});
  review.mockReset().mockResolvedValue({organizationId:financeOrg,document:financeRow,canReview:true});
  recovery.mockReset().mockResolvedValue({organizationId:financeOrg,document:{...financeRow,state:"received",revision:1}});
});
afterEach(cleanup);
async function view(query:Record<string,string|undefined>={},isReview=false){render(await FinanceDocumentWorkspace({searchParams:Promise.resolve(query),review:isReview}));}
test("loads the selected scoped finance workspace through current AAL2 authority",async()=>{await view();
  expect(selected).toHaveBeenCalledWith("finance.manage");expect(authority).toHaveBeenCalledWith(financeOrg,expect.any(String),{supabase:{}});
  expect(screen.getByRole("heading",{name:"Finance documents"})).toBeInTheDocument();expect(screen.getByText("Labeled finance upload")).toBeInTheDocument();
  expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();expect(screen.queryByRole("textbox")).not.toBeInTheDocument();});
test.each(["aal1","platform"])("denies %s before finance records load",async failure=>{selected.mockResolvedValue({authorization:{scope:failure==="platform"?{kind:"platform"}:{kind:"organization",organizationId:financeOrg},assurance:failure==="aal1"?"aal1":"aal2"}});
  await expect(view()).rejects.toThrow("Forbidden boundary");expect(sources).not.toHaveBeenCalled();expect(list).not.toHaveBeenCalled();});
test("denies a current finance permission failure without loading documents",async()=>{authority.mockRejectedValue(new AuthorizationError());
  await expect(view()).rejects.toThrow("Not found boundary");expect(sources).not.toHaveBeenCalled();expect(list).not.toHaveBeenCalled();});
test.each([{searchQuery:"private text"},{actorIdentityId:financeVendor},{version:financeVersion},{document:financeDoc,after:financeVendor}])("rejects invalid or private URL fields",async query=>{
  await expect(view(query)).rejects.toThrow("Not found boundary");expect(list).not.toHaveBeenCalled();expect(sources).not.toHaveBeenCalled();});
test("renders readable immutable source labels and a compatible replacement",async()=>{await view({document:financeDoc});
  expect(screen.getByRole("region",{name:"Recorded finance source"})).toHaveTextContent("Recorded vendor");
  expect(screen.getByText("Replacement at version 1")).toBeInTheDocument();expect(versions.mock.calls[0][0]).toMatchObject({organizationId:financeOrg,documentId:financeDoc,afterVersion:0});});
test("renders readable version history and uses only identifier links",async()=>{await view({document:financeDoc,version:financeVersion});
  expect(screen.getByText("Change 1: Upload recorded")).toBeInTheDocument();expect(screen.getByRole("link",{name:"Back to finance versions"})).toHaveAttribute("href",`/admin/finance/documents?document=${financeDoc}`);
  expect(history.mock.calls[0][0]).toMatchObject({documentId:financeDoc,versionId:financeVersion,afterRevision:0});});
test("uses the distinct independent review boundary",async()=>{await view({document:financeDoc,version:financeVersion},true);
  expect(screen.getByText("Independent finance decision")).toBeInTheDocument();expect(review.mock.calls[0][0]).toMatchObject({organizationId:financeOrg,documentId:financeDoc,versionId:financeVersion});});
test("shows empty and source pagination states without private query text",async()=>{list.mockResolvedValue({items:[],canUpload:false,nextCursor:null});sources.mockResolvedValue({...financeSources,nextCursor:financeVendor});
  await view();expect(screen.getByRole("status")).toHaveTextContent("No finance documents are recorded");
  expect(screen.getByRole("link",{name:"More recorded sources"})).toHaveAttribute("href",`/admin/finance/documents?sourceAfter=${financeVendor}`);});
test("routes a denied record to the generic boundary and preserves other failures",async()=>{list.mockRejectedValueOnce(new AuthorizationError());await expect(view()).rejects.toThrow("Not found boundary");
  list.mockRejectedValueOnce(new Error("Unavailable dependency"));await expect(view()).rejects.toThrow("Unavailable dependency");});
test("loads exact recovery for the current received version and offers no replacement before abandonment",async()=>{
  versions.mockResolvedValue({organizationId:financeOrg,documentId:financeDoc,currentVersion:1,canUpload:true,items:[{...financeRow,state:"received",revision:1}],nextVersion:null});
  await view({document:financeDoc});expect(screen.getByText("Recover the exact unfinished upload")).toBeInTheDocument();
  expect(recovery.mock.calls[0][0]).toMatchObject({organizationId:financeOrg,documentId:financeDoc,versionId:financeVersion});
  expect(screen.queryByText("Replacement at version 1")).not.toBeInTheDocument();
});
test("does not load recovery for a processing or historical version",async()=>{
  versions.mockResolvedValue({organizationId:financeOrg,documentId:financeDoc,currentVersion:2,canUpload:true,
    items:[{...financeRow,versionId:financeVendor,isCurrent:false,state:"received",revision:1},{...financeRow,version:2,state:"scanning"}],nextVersion:null});
  await view({document:financeDoc});expect(recovery).not.toHaveBeenCalled();
});
test("renders abandonment as unfinished upload recovery, separate from document review rejection",async()=>{
  history.mockResolvedValue({items:[{revision:2,action:"abandon",occurredAt:"2026-10-03T10:00:00Z"}],nextRevision:null});
  await view({document:financeDoc,version:financeVersion});expect(screen.getByText("Change 2: Unfinished upload stopped")).toBeInTheDocument();
});
