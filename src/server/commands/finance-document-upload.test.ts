import { randomUUID } from "node:crypto";
import { beforeEach, expect, test, vi } from "vitest";
import { AuthorizationError, requirePermission } from "@/server/auth/authorization";
import { prepareFinanceDocumentUpload, reserveFinanceDocument, completeFinanceDocumentUpload } from "./finance-document-upload";
vi.mock("@/server/auth/authorization",()=>({AuthorizationError:class extends Error{},requirePermission:vi.fn()}));
const organizationId=randomUUID(),documentId=randomUUID(),versionId=randomUUID(),identityId=randomUUID(),correlationId=randomUUID(),idempotencyKey=randomUUID();
const source={sourceClass:"agreement" as const,vendorOrganizationId:randomUUID()},rpc=vi.fn();
const input={organizationId,documentId,versionId,source,expectedVersion:0,fileName:"synthetic.pdf",declaredMimeType:"application/pdf",
  byteSize:18,sha256:"a".repeat(64),correlationId,idempotencyKey};
const result={organizationId,documentId,versionId,version:1,state:"received",revision:1,correlationId,outcomeCode:"recorded"};
beforeEach(()=>{
  rpc.mockReset().mockResolvedValue({data:result,error:null});
  vi.mocked(requirePermission).mockReset().mockImplementation(async(_permission,scope,options)=>({scope,identityId,
    correlationId:options!.correlationId!,assurance:"aal2",supabase:{rpc} as never}));
});
test("requires the same current internal scoped AAL2 identity before reservation",async()=>{
  expect(await prepareFinanceDocumentUpload(input)).toEqual(result);
  expect(vi.mocked(requirePermission).mock.calls.map(([permission])=>permission)).toEqual(["workspace.access","finance.manage","admin.access"]);
  const {correlationId:correlation,idempotencyKey:key,declaredMimeType,...manifest}=input;
  expect(rpc).toHaveBeenCalledWith("mmhr_reserve_finance_document",{payload:{...manifest,contentType:declaredMimeType},correlation_id:correlation,idempotency_key:key});
});
test.each(["scope","actor","assurance","correlation"])("rejects altered finance authorization %s",async change=>{
  vi.mocked(requirePermission).mockImplementation(async(permission,scope,options)=>({
    scope:permission==="finance.manage"&&change==="scope"?{kind:"organization",organizationId:randomUUID()}:scope,
    identityId:permission==="finance.manage"&&change==="actor"?randomUUID():identityId,
    assurance:permission==="finance.manage"&&change==="assurance"?"aal1":"aal2",
    correlationId:permission==="finance.manage"&&change==="correlation"?randomUUID():options!.correlationId!,supabase:{rpc} as never}));
  await expect(prepareFinanceDocumentUpload(input)).rejects.toBeInstanceOf(AuthorizationError);expect(rpc).not.toHaveBeenCalled();
});
test.each(["organizationId","documentId","versionId","correlationId"])("binds reservation receipt %s",async field=>{
  rpc.mockResolvedValue({data:{...result,[field]:randomUUID()},error:null});await expect(prepareFinanceDocumentUpload(input)).rejects.toThrow();
});
test.each([{version:2},{revision:2},{state:"approved"},{approvedAt:new Date().toISOString()}])("rejects changed original outcomes",async change=>{
  rpc.mockResolvedValue({data:{...result,...change},error:null});await expect(prepareFinanceDocumentUpload(input)).rejects.toThrow();
});
test("inspects actual input bytes before deriving its reservation manifest",async()=>{
  const {byteSize:_size,sha256:_hash,...request}=input;void[_size,_hash];
  const bytes=new Uint8Array(Buffer.from("%PDF-1.7\nSynthetic original\n%%EOF"));
  expect(await reserveFinanceDocument(request,bytes)).toEqual(result);
  expect(rpc.mock.calls[0]![1].payload.byteSize).toBe(bytes.length);expect(rpc.mock.calls[0]![1].payload.sha256).not.toBe(input.sha256);
  rpc.mockClear();await expect(reserveFinanceDocument(request,new Uint8Array([0,1,2]))).rejects.toThrow("Finance document validation failed");
  expect(rpc).not.toHaveBeenCalled();
});
test("binds completion and its original replay without asserting scan or approval",async()=>{
  const completion={organizationId,documentId,versionId,expectedRevision:1,correlationId,idempotencyKey};
  for(const outcomeCode of ["recorded","replayed"]){rpc.mockResolvedValue({data:{organizationId,documentId,versionId,state:"quarantined",revision:2,correlationId,outcomeCode},error:null});
    expect(await completeFinanceDocumentUpload(completion)).toMatchObject({state:"quarantined",revision:2,outcomeCode});}
});
test("redacts provider failure and preserves current authority denial",async()=>{
  rpc.mockResolvedValue({error:{code:"XX000",message:"Private object metadata"}});
  await expect(prepareFinanceDocumentUpload(input)).rejects.toThrow("Finance document request failed");
  rpc.mockResolvedValue({error:{code:"42501",message:"Private finance detail"}});
  await expect(prepareFinanceDocumentUpload(input)).rejects.toBeInstanceOf(AuthorizationError);
  rpc.mockRejectedValue(new Error("Private transport details"));
  await expect(prepareFinanceDocumentUpload(input)).rejects.toThrow("Finance document request failed");
});
