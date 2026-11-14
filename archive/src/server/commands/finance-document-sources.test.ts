import { beforeEach,expect,test,vi } from "vitest";
import { AuthorizationError } from "@/server/auth/authorization";
import { getFinanceDocumentSources } from "./finance-document-sources";
import { financeDocumentSourcesPageSchema } from "@/lib/finance-document-sources";
const {authority,rpc}=vi.hoisted(()=>({authority:vi.fn(),rpc:vi.fn()}));
vi.mock("./finance-document-upload",()=>({requireFinanceDocumentAuthority:authority}));
const org="11111111-1111-4111-8111-111111111111",vendor="22222222-2222-4222-8222-222222222222",doc="33333333-3333-4333-8333-333333333333",correlation="44444444-4444-4444-8444-444444444444";
const choice={choiceId:vendor,vendorLabel:"Recorded vendor",dealLabel:null,source:{sourceClass:"agreement",vendorOrganizationId:vendor}};
const page=()=>({organizationId:org,correlationId:correlation,workspaceType:"internal",choices:[choice],nextCursor:null,documentBinding:null});
beforeEach(()=>{authority.mockReset().mockResolvedValue({supabase:{rpc}});rpc.mockReset().mockResolvedValue({data:page(),error:null});});
test("uses the finance boundary and sends no actor or correlation in its payload",async()=>{
  expect(await getFinanceDocumentSources({organizationId:org,correlationId:correlation})).toEqual(page());
  expect(authority).toHaveBeenCalledWith(org,correlation,{});expect(rpc).toHaveBeenCalledWith("mmhr_get_finance_document_sources",{
    payload:{organizationId:org},correlation_id:correlation});
});
test("requires authority before any source read",async()=>{authority.mockRejectedValue(new AuthorizationError());
  await expect(getFinanceDocumentSources({organizationId:org,correlationId:correlation})).rejects.toBeInstanceOf(AuthorizationError);expect(rpc).not.toHaveBeenCalled();});
test.each(["actorIdentityId","searchQuery","currency","amount"])("rejects unauthorized %s input",async field=>{
  await expect(getFinanceDocumentSources({organizationId:org,correlationId:correlation,[field]:"private"})).rejects.toThrow();expect(rpc).not.toHaveBeenCalled();});
test.each(["organizationId","correlationId"])("rejects a foreign %s result",async field=>{
  rpc.mockResolvedValue({data:{...page(),[field]:doc},error:null});await expect(getFinanceDocumentSources({organizationId:org,correlationId:correlation})).rejects.toThrow("Invalid finance source page");});
test("accepts the exact historical binding without offering it as a current choice",async()=>{
  const binding={documentId:doc,vendorLabel:choice.vendorLabel,dealLabel:null,source:choice.source};
  rpc.mockResolvedValue({data:{...page(),choices:[],documentBinding:binding},error:null});
  expect((await getFinanceDocumentSources({organizationId:org,correlationId:correlation,documentId:doc})).documentBinding).toEqual(binding);
});
test.each([null,{documentId:vendor,vendorLabel:choice.vendorLabel,dealLabel:null,source:choice.source}])("rejects a missing or foreign binding",async binding=>{
  rpc.mockResolvedValue({data:{...page(),documentBinding:binding},error:null});await expect(getFinanceDocumentSources({organizationId:org,correlationId:correlation,documentId:doc})).rejects.toThrow();});
test("rejects an unsolicited private binding",async()=>{rpc.mockResolvedValue({data:{...page(),documentBinding:{documentId:doc,...choice}},error:null});
  await expect(getFinanceDocumentSources({organizationId:org,correlationId:correlation})).rejects.toThrow();});
test("rejects repeated and backward source choices",async()=>{
  rpc.mockResolvedValue({data:{...page(),choices:[choice,choice]},error:null});await expect(getFinanceDocumentSources({organizationId:org,correlationId:correlation})).rejects.toThrow();
  rpc.mockResolvedValue({data:page(),error:null});
  await expect(getFinanceDocumentSources({organizationId:org,correlationId:correlation,afterId:vendor})).rejects.toThrow("Invalid finance source order");
});
test("accepts a full ordered page and binds its cursor to the last visible choice",async()=>{
  const choices=Array.from({length:25},(_,index)=>{const id=`${String(index+1).padStart(8,"0")}-0000-4000-8000-000000000000`;
    return {...choice,choiceId:id,source:{sourceClass:"agreement",vendorOrganizationId:id}};});
  rpc.mockResolvedValue({data:{...page(),choices,nextCursor:choices[24]!.choiceId},error:null});
  expect((await getFinanceDocumentSources({organizationId:org,correlationId:correlation})).choices).toHaveLength(25);
  rpc.mockResolvedValue({data:{...page(),choices,nextCursor:choices[23]!.choiceId},error:null});
  await expect(getFinanceDocumentSources({organizationId:org,correlationId:correlation})).rejects.toThrow("Invalid finance source cursor");
});
test("rejects a partial-page cursor and a mismatched source key",async()=>{
  rpc.mockResolvedValue({data:{...page(),nextCursor:vendor},error:null});await expect(getFinanceDocumentSources({organizationId:org,correlationId:correlation})).rejects.toThrow("Invalid finance source cursor");
  expect(financeDocumentSourcesPageSchema.safeParse({...page(),choices:[{...choice,choiceId:doc}]}).success).toBe(false);
});
test("rejects customer/internal class changes and private response fields",()=>{
  expect(financeDocumentSourcesPageSchema.safeParse({...page(),workspaceType:"customer"}).success).toBe(false);
  expect(financeDocumentSourcesPageSchema.safeParse({...page(),choices:[{...choice,dealLabel:"Unknown deal"}]}).success).toBe(false);
  expect(financeDocumentSourcesPageSchema.safeParse({...page(),privateText:"Original contents"}).success).toBe(false);
});
test.each(["42501","transport","XX000"])("handles %s without exposing provider errors",async code=>{
  if(code==="transport")rpc.mockRejectedValue(new Error("secret provider detail"));else rpc.mockResolvedValue({data:null,error:{code,message:"secret provider detail"}});
  await expect(getFinanceDocumentSources({organizationId:org,correlationId:correlation})).rejects.toThrow(code==="42501"?AuthorizationError:"Finance source request failed");
});
