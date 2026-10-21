import "server-only";
import { proposalComparisonCommandSchema, proposalComparisonPageSchema, proposalComparisonReadSchema, proposalComparisonResultSchema,
  proposalQuoteCommandSchema, proposalQuotePageSchema, proposalQuotePermission, proposalQuoteReadSchema, proposalQuoteResultSchema } from "@/lib/proposal-quote";
import { AuthorizationError, requirePermission, type AuthorizationOptions } from "@/server/auth/authorization";

async function invoke(name:string,organizationId:string,correlationId:string,actionOrView:string,
  payload:unknown,idempotencyKey:string|undefined,options:AuthorizationOptions){
  const context=await requirePermission(proposalQuotePermission(actionOrView),{kind:"organization",organizationId},{...options,correlationId});
  if(context.scope.kind!=="organization"||context.scope.organizationId!==organizationId||context.correlationId!==correlationId)throw new AuthorizationError();
  const response=await context.supabase.rpc(name,{payload,correlation_id:correlationId,...(idempotencyKey?{idempotency_key:idempotencyKey}:{})});
  if(response.error?.code==="42501")throw new AuthorizationError();
  if(response.error)throw new Error("Proposal request failed");
  return response.data as unknown;
}

export async function recordProposalQuote(value:unknown,options:AuthorizationOptions={}){
  const input=proposalQuoteCommandSchema.parse(value);
  const {correlationId,idempotencyKey,...payload}=input;
  const result=proposalQuoteResultSchema.parse(await invoke("mmhr_record_proposal_quote",input.organizationId,correlationId,input.action,payload,idempotencyKey,options));
  const expectedState=input.action==="submit"?"received":input.action==="review"?"under_review":input.action==="approve"?"approved_for_comparison"
    :input.action==="request_revision"?"revision_requested":"withdrawn";
  if(result.organizationId!==input.organizationId||result.correlationId!==correlationId
    ||(input.action!=="submit"&&result.proposalVersionId!==input.proposalVersionId)
    ||(result.outcomeCode==="recorded"&&(result.state!==expectedState||result.revision!==(input.action==="submit"?1:input.expectedRevision+1)))){
    throw new Error("Invalid proposal quote result");
  }
  return result;
}

export async function getProposalQuotes(value:unknown,options:AuthorizationOptions={}){
  const input=proposalQuoteReadSchema.parse(value);
  const {correlationId,...payload}=input;
  const page=proposalQuotePageSchema.parse(await invoke("mmhr_get_proposal_quotes",input.organizationId,correlationId,input.view,payload,undefined,options));
  if(page.organizationId!==input.organizationId||page.correlationId!==correlationId
    ||(input.view==="vendor"?page.submission===null:page.submission!==null)
    ||(page.submission?.eligible&&(page.submission.expectedVersion===null||page.submission.expectedVersion>9999)))throw new Error("Invalid proposal quote page");
  let previous=input.afterId;
  for(const row of page.items){
    if((previous&&row.proposalVersionId<=previous)
      ||(input.view==="vendor"?row.recipientId!==input.recipientId:row.intakeId!==input.intakeId)
      ||(input.view==="customer"&&(row.approvedAt===null||row.reason!==null||row.canReview||row.canApprove||row.canSubmit))
      ||(input.view!=="staff"&&(row.canReview||row.canApprove))||(input.view!=="vendor"&&row.canSubmit)
      ||(row.current&&(row.state!=="approved_for_comparison"||row.approvedAt===null))
      ||(row.state==="approved_for_comparison"&&(row.approvedAt===null||row.reviewedAt===null)))throw new Error("Invalid proposal quote page");
    previous=row.proposalVersionId;
  }
  if(page.nextCursor&&(page.items.length!==25||page.nextCursor!==previous))throw new Error("Invalid proposal quote cursor");
  return page;
}

export async function recordProposalComparison(value:unknown,options:AuthorizationOptions={}){
  const input=proposalComparisonCommandSchema.parse(value);
  const {correlationId,idempotencyKey,...payload}=input;
  // Comparison decisions always require assigned staff authority.
  const result=proposalComparisonResultSchema.parse(await invoke("mmhr_record_proposal_quote_comparison",input.organizationId,correlationId,"staff",payload,idempotencyKey,options));
  if(result.organizationId!==input.organizationId||result.correlationId!==correlationId
    ||(input.action!=="prepare"&&result.comparisonId!==input.comparisonId)
    ||(result.outcomeCode==="recorded"&&(result.state!==(input.action==="prepare"?"draft":input.action==="approve"?"approved":"rejected")
      ||result.revision!==(input.action==="prepare"?1:2)))
    ||(input.action!=="prepare"&&result.sourceDigest!==input.expectedDigest))throw new Error("Invalid proposal comparison result");
  return result;
}

export async function getProposalComparisons(value:unknown,options:AuthorizationOptions={}){
  const input=proposalComparisonReadSchema.parse(value);
  const {correlationId,...payload}=input;
  const page=proposalComparisonPageSchema.parse(await invoke("mmhr_get_proposal_quote_comparisons",input.organizationId,correlationId,input.view,payload,undefined,options));
  if(page.organizationId!==input.organizationId||page.correlationId!==correlationId)throw new Error("Invalid proposal comparison page");
  let previous=input.afterId;
  for(const row of page.items){
    if((previous&&row.comparisonId<=previous)||row.intakeId!==input.intakeId
      ||(row.state==="draft"?(row.revision!==1||row.decidedAt!==null):(row.revision!==2||row.decidedAt===null))
      ||(row.canApprove&&(row.state!=="draft"||!row.current))
      ||(row.canReject&&row.state!=="draft")
      ||(input.view==="customer"&&(row.state!=="approved"||row.canApprove||row.canReject||row.reason!==null||row.sourceDigest!==null)))throw new Error("Invalid proposal comparison page");
    let previousSource:string|undefined;
    for(const source of row.sources){
      if(previousSource&&source.proposalVersionId<=previousSource)throw new Error("Invalid comparison sources");
      previousSource=source.proposalVersionId;
    }
    if(new Set(row.sources.map((source)=>source.quote.pricing.currency).filter((currency)=>currency!==null)).size>1)throw new Error("Invalid comparison currencies");
    previous=row.comparisonId;
  }
  if(page.nextCursor&&(page.items.length!==5||page.nextCursor!==previous))throw new Error("Invalid proposal comparison cursor");
  return page;
}
