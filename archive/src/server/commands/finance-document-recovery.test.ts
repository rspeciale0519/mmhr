import { beforeEach,expect,test,vi } from "vitest";
import { AuthorizationError } from "@/server/auth/authorization";
import { FinanceDocumentInputError,FinanceDocumentConflictError } from "./finance-document-errors";
import { getFinanceDocumentRecovery,abandonFinanceDocumentUpload } from "./finance-document-recovery";
import { financeDocumentRecoveryPageSchema,financeDocumentAbandonSchema } from "@/lib/finance-document-recovery";
import { financeDocumentHistoryPageSchema } from "@/lib/finance-documents";
import { workspaceDocumentHistoryPageSchema } from "@/lib/workspace-documents";
const {authority,rpc}=vi.hoisted(()=>({authority:vi.fn(),rpc:vi.fn()}));
vi.mock("./finance-document-upload",()=>({requireFinanceDocumentAuthority:authority}));
const org="11111111-1111-4111-8111-111111111111",doc="22222222-2222-4222-8222-222222222222",
  version="33333333-3333-4333-8333-333333333333",correlation="44444444-4444-4444-8444-444444444444",key="55555555-5555-4555-8555-555555555555";
const read={organizationId:org,documentId:doc,versionId:version,correlationId:correlation};
const input={...read,expectedRevision:1,idempotencyKey:key,reason:"The original upload cannot finish"};
const page=()=>({organizationId:org,correlationId:correlation,reservationCorrelationId:key,sha256:"a".repeat(64),
  reservationExpiresAt:"2026-10-03T10:10:00Z",canResume:true,canAbandon:true,
  document:{documentId:doc,versionId:version,version:1,isCurrent:true,state:"received",revision:1,failureCode:null,
    fileName:"original.pdf",contentType:"application/pdf",byteSize:12,createdAt:"2026-10-03T10:00:00Z",updatedAt:"2026-10-03T10:00:00Z"}});
const result=()=>({...read,action:"abandon_upload",state:"rejected",revision:2,outcomeCode:"recorded"});
beforeEach(()=>{authority.mockReset().mockResolvedValue({supabase:{rpc}});rpc.mockReset().mockImplementation(async name=>({
  data:name==="mmhr_get_finance_document_recovery"?page():result(),error:null}));});
test("reads recovery through current finance authority and exact scoped IDs",async()=>{
  expect(await getFinanceDocumentRecovery(read)).toEqual(page());expect(authority).toHaveBeenCalledWith(org,correlation,{});
  expect(rpc).toHaveBeenCalledWith("mmhr_get_finance_document_recovery",{payload:{organizationId:org,documentId:doc,versionId:version},correlation_id:correlation});
});
test("records abandonment with expected revision, reason and separate command IDs",async()=>{
  expect(await abandonFinanceDocumentUpload(input)).toEqual(result());
  expect(rpc).toHaveBeenCalledWith("mmhr_abandon_finance_document_upload",{payload:{organizationId:org,documentId:doc,versionId:version,
    expectedRevision:1,reason:input.reason},correlation_id:correlation,idempotency_key:key});
});
test.each([getFinanceDocumentRecovery,abandonFinanceDocumentUpload])("requires current authority before the RPC",async operation=>{
  authority.mockRejectedValue(new AuthorizationError());await expect(operation(operation===getFinanceDocumentRecovery?read:input)).rejects.toBeInstanceOf(AuthorizationError);
  expect(rpc).not.toHaveBeenCalled();
});
test.each(["actorIdentityId","source","sha256","accessToken"])("rejects authority or manifest override %s before writing",async field=>{
  await expect(abandonFinanceDocumentUpload({...input,[field]:"forged"})).rejects.toThrow();expect(rpc).not.toHaveBeenCalled();
});
test("rejects private read fields, noninitial revisions and unsafe reasons",async()=>{
  await expect(getFinanceDocumentRecovery({...read,searchQuery:"private"})).rejects.toThrow();
  expect(financeDocumentAbandonSchema.safeParse({...input,expectedRevision:2}).success).toBe(false);
  expect(financeDocumentAbandonSchema.safeParse({...input,reason:"https://private.example"}).success).toBe(false);expect(rpc).not.toHaveBeenCalled();
});
test.each(["organizationId","correlationId","documentId","versionId"])("rejects a foreign abandonment %s response",async field=>{
  rpc.mockResolvedValue({data:{...result(),[field]:key},error:null});await expect(abandonFinanceDocumentUpload(input)).rejects.toThrow("Invalid finance upload abandonment");
});
test("rejects a foreign recovery record without accepting a new source",async()=>{
  rpc.mockResolvedValue({data:{...page(),document:{...page().document,versionId:key}},error:null});await expect(getFinanceDocumentRecovery(read)).rejects.toThrow("Invalid finance upload recovery");
});
test("accepts expired or staff-only abandonment metadata without inventing resume permission",()=>{
  expect(financeDocumentRecoveryPageSchema.parse({...page(),canResume:false}).canAbandon).toBe(true);
  for(const changes of [{reservationExpiresAt:"2026-10-03T10:10:01Z"},{sha256:"A".repeat(64)},{canAbandon:false},
    {document:{...page().document,state:"quarantined"}},{document:{...page().document,revision:2}},{document:{...page().document,isCurrent:false}},{privateUrl:"https://private.example"}]){
    expect(financeDocumentRecoveryPageSchema.safeParse({...page(),...changes}).success).toBe(false);
  }
});
test.each([getFinanceDocumentRecovery,abandonFinanceDocumentUpload])("preserves known denial, invalid input, conflict and unknown transport classes",async operation=>{
  const value=operation===getFinanceDocumentRecovery?read:input;
  for(const [code,error] of [["42501",AuthorizationError],["22023",FinanceDocumentInputError],["40001",FinanceDocumentConflictError]] as const){
    rpc.mockResolvedValue({data:null,error:{code,message:"private provider detail"}});await expect(operation(value)).rejects.toBeInstanceOf(error);
  }
  rpc.mockRejectedValue(new Error("private provider detail"));await expect(operation(value)).rejects.toThrow(operation===getFinanceDocumentRecovery?
    "Finance upload recovery unavailable":"Finance upload abandonment unavailable");
});
test("accepts exact original abandonment replay without deriving a new transition",async()=>{
  rpc.mockResolvedValue({data:{...result(),outcomeCode:"replayed"},error:null});expect((await abandonFinanceDocumentUpload(input)).revision).toBe(2);
  expect((await abandonFinanceDocumentUpload(input)).outcomeCode).toBe("replayed");expect(rpc.mock.calls[1]).toEqual(rpc.mock.calls[0]);
});
test("keeps abandonment distinct from review in finance history and ordinary history unchanged",()=>{
  const history={organizationId:org,correlationId:correlation,documentId:doc,versionId:version,
    items:[{revision:2,action:"abandon",occurredAt:"2026-10-03T10:11:00Z"}],nextRevision:null};
  expect(financeDocumentHistoryPageSchema.parse(history).items[0].action).toBe("abandon");
  expect(workspaceDocumentHistoryPageSchema.safeParse(history).success).toBe(false);
});
