import "server-only";
import { financeDocumentRecoveryReadSchema,financeDocumentRecoveryPageSchema,financeDocumentAbandonSchema,
  financeDocumentAbandonResultSchema } from "@/lib/finance-document-recovery";
import type { AuthorizationOptions } from "@/server/auth/authorization";
import { requireFinanceDocumentAuthority } from "./finance-document-upload";
import { checkFinanceDocumentRpcError } from "./finance-document-errors";
export async function getFinanceDocumentRecovery(value:unknown,options:AuthorizationOptions={}){
  const input=financeDocumentRecoveryReadSchema.parse(value);
  const context=await requireFinanceDocumentAuthority(input.organizationId,input.correlationId,options);
  const {correlationId,...payload}=input;
  const response=await Promise.resolve(context.supabase.rpc("mmhr_get_finance_document_recovery",{payload,correlation_id:correlationId}))
    .catch(()=>{throw new Error("Finance upload recovery unavailable");});
  checkFinanceDocumentRpcError(response.error,"Finance upload recovery unavailable");
  const page=financeDocumentRecoveryPageSchema.parse(response.data);
  if(page.organizationId!==input.organizationId||page.correlationId!==input.correlationId||page.document.documentId!==input.documentId
    ||page.document.versionId!==input.versionId)throw new Error("Invalid finance upload recovery");
  return page;
}
export async function abandonFinanceDocumentUpload(value:unknown,options:AuthorizationOptions={}){
  const input=financeDocumentAbandonSchema.parse(value);
  const context=await requireFinanceDocumentAuthority(input.organizationId,input.correlationId,options);
  const {correlationId,idempotencyKey,...payload}=input;
  const response=await Promise.resolve(context.supabase.rpc("mmhr_abandon_finance_document_upload",{
    payload,correlation_id:correlationId,idempotency_key:idempotencyKey})).catch(()=>{throw new Error("Finance upload abandonment unavailable");});
  checkFinanceDocumentRpcError(response.error,"Finance upload abandonment unavailable");
  const result=financeDocumentAbandonResultSchema.parse(response.data);
  if(result.organizationId!==input.organizationId||result.correlationId!==input.correlationId||result.documentId!==input.documentId
    ||result.versionId!==input.versionId)throw new Error("Invalid finance upload abandonment");
  return result;
}
