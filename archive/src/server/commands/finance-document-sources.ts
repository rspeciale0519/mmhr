import { checkFinanceDocumentRpcError } from "./finance-document-errors";
import "server-only";
import { financeDocumentSourcesSchema,financeDocumentSourcesPageSchema } from "@/lib/finance-document-sources";
import { type AuthorizationOptions } from "@/server/auth/authorization";
import { requireFinanceDocumentAuthority } from "./finance-document-upload";
export async function getFinanceDocumentSources(value:unknown,options:AuthorizationOptions={}){
  const input=financeDocumentSourcesSchema.parse(value),{correlationId,...payload}=input;
  const context=await requireFinanceDocumentAuthority(input.organizationId,correlationId,options);
  const response=await Promise.resolve(context.supabase.rpc("mmhr_get_finance_document_sources",{payload,correlation_id:correlationId}))
    .catch(()=>{throw new Error("Finance source request failed");});
  checkFinanceDocumentRpcError(response.error,"Finance source request failed");
  const page=financeDocumentSourcesPageSchema.parse(response.data);
  if(page.organizationId!==input.organizationId||page.correlationId!==correlationId
    ||(input.documentId?page.documentBinding?.documentId!==input.documentId:page.documentBinding!==null))throw new Error("Invalid finance source page");
  let previous=input.afterId;
  for(const choice of page.choices){if(previous&&choice.choiceId<=previous)throw new Error("Invalid finance source order");previous=choice.choiceId;}
  if(page.nextCursor&&(page.choices.length!==25||page.nextCursor!==previous))throw new Error("Invalid finance source cursor");
  return page;
}
