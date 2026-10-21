import { beforeEach,expect,test,vi } from "vitest";
import { AuthorizationError,requirePermission } from "@/server/auth/authorization";
import { prepareFinanceDocumentUpload,completeFinanceDocumentUpload } from "./finance-document-upload";
import { getFinanceDocumentReview,recordFinanceDocumentReview,issueFinanceDocumentAccess,resolveFinanceDocumentAccess } from "./finance-document-review";
import { getFinanceDocuments,getFinanceDocumentVersions,getFinanceDocumentHistory } from "./finance-documents";
import { getFinanceDocumentSources } from "./finance-document-sources";
import { FinanceDocumentInputError,FinanceDocumentConflictError } from "./finance-document-errors";
import { financeDocumentRequestError } from "@/server/trpc/routers/finance-documents";
vi.mock("@/server/auth/authorization",()=>({AuthorizationError:class extends Error{},requirePermission:vi.fn()}));
vi.mock("@/server/trpc/trpc",()=>({router:(value:unknown)=>value,permissionProcedure:()=>({query:()=>null,mutation:()=>null})}));
const organizationId="11111111-1111-4111-8111-111111111111",documentId="22222222-2222-4222-8222-222222222222",
  versionId="33333333-3333-4333-8333-333333333333",correlationId="44444444-4444-4444-8444-444444444444",
  idempotencyKey="55555555-5555-4555-8555-555555555555",identityId="66666666-6666-4666-8666-666666666666";
const scope={organizationId,documentId,versionId,correlationId},rpc=vi.fn();
const cases:[string,()=>Promise<unknown>][]=[
  ["reserve",()=>prepareFinanceDocumentUpload({...scope,idempotencyKey,expectedVersion:0,fileName:"synthetic.pdf",declaredMimeType:"application/pdf",
    byteSize:12,sha256:"a".repeat(64),source:{sourceClass:"agreement",vendorOrganizationId:identityId}})],
  ["complete",()=>completeFinanceDocumentUpload({...scope,idempotencyKey,expectedRevision:1})],
  ["review metadata",()=>getFinanceDocumentReview(scope)],
  ["review decision",()=>recordFinanceDocumentReview({...scope,idempotencyKey,expectedRevision:4,action:"begin_review",reason:"Synthetic review",reviewReference:"synthetic:review"})],
  ["issue access",()=>issueFinanceDocumentAccess({...scope,idempotencyKey,expectedRevision:5,purpose:"finance_review"})],
  ["resolve access",()=>resolveFinanceDocumentAccess({organizationId,correlationId,accessId:documentId,accessToken:"a".repeat(64)})],
  ["document list",()=>getFinanceDocuments({organizationId,correlationId})],
  ["version list",()=>getFinanceDocumentVersions({organizationId,correlationId,documentId})],
  ["history",()=>getFinanceDocumentHistory(scope)],
  ["source choices",()=>getFinanceDocumentSources({organizationId,correlationId})],
];
beforeEach(()=>{rpc.mockReset();vi.mocked(requirePermission).mockReset().mockImplementation(async(_permission,requestedScope,options)=>({scope:requestedScope,
  identityId,correlationId:options!.correlationId!,assurance:"aal2",supabase:{rpc} as never}));});
async function rejected(operation:()=>Promise<unknown>):Promise<Error>{
  try{await operation();}catch(error){if(error instanceof Error)return error;throw new Error("The command returned an invalid failure");}
  throw new Error("The command did not reject the request");
}
for(const [code,ErrorType,trpcCode] of [["40001",FinanceDocumentConflictError,"CONFLICT"],["22023",FinanceDocumentInputError,"BAD_REQUEST"],["42501",AuthorizationError,"NOT_FOUND"]] as const){
  test.each(cases)(`classifies SQL ${code} from %s after current authority`,async(_name,operation)=>{
    rpc.mockResolvedValue({data:null,error:{code,message:"Private SQL details"}});
    const error=await rejected(operation);expect(error).toBeInstanceOf(ErrorType);expect(error.message).not.toContain("Private SQL details");
    expect(financeDocumentRequestError(error)).toMatchObject({code:trpcCode,message:"Finance document request failed"});
    expect(vi.mocked(requirePermission).mock.calls.map(([permission])=>permission)).toEqual(["workspace.access","finance.manage","admin.access"]);
    expect(rpc).toHaveBeenCalledOnce();
  });
}
test.each(cases)("keeps unknown SQL results from %s unknown",async(_name,operation)=>{
  rpc.mockResolvedValue({data:null,error:{code:"XX000",message:"Private provider details"}});
  const error=await rejected(operation);expect(error).toBeInstanceOf(Error);expect(error).not.toBeInstanceOf(FinanceDocumentInputError);
  expect(error).not.toBeInstanceOf(FinanceDocumentConflictError);expect(financeDocumentRequestError(error).code).toBe("INTERNAL_SERVER_ERROR");expect(error.message).not.toContain("Private provider details");
});
test.each(cases)("keeps transport failure from %s unknown",async(_name,operation)=>{
  rpc.mockRejectedValue(new Error("Private transport details"));const error=await rejected(operation);
  expect(financeDocumentRequestError(error).code).toBe("INTERNAL_SERVER_ERROR");expect(error.message).not.toContain("Private transport details");
});
