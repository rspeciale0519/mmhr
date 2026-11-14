import { FinanceDocumentInputError, FinanceDocumentConflictError } from "@/server/commands/finance-document-errors";
import { TRPCError } from "@trpc/server";
import { financeDocumentSourcesSchema } from "@/lib/finance-document-sources";
import { financeDocumentRecoveryReadSchema, financeDocumentAbandonSchema } from "@/lib/finance-document-recovery";
import { getFinanceDocumentRecovery, abandonFinanceDocumentUpload } from "@/server/commands/finance-document-recovery";
import { getFinanceDocumentSources } from "@/server/commands/finance-document-sources";
import { financeDocumentHistorySchema, financeDocumentListSchema, financeDocumentVersionsSchema } from "@/lib/finance-documents";
import { financeDocumentUploadPreparationSchema, financeDocumentUploadCompletionSchema } from "@/lib/finance-document-upload";
import { financeDocumentReviewSchema, financeDocumentReviewReadSchema, financeDocumentAccessSchema } from "@/lib/finance-document-review";
import { getFinanceDocuments, getFinanceDocumentVersions, getFinanceDocumentHistory } from "@/server/commands/finance-documents";
import { prepareFinanceDocumentUpload, completeFinanceDocumentUpload } from "@/server/commands/finance-document-upload";
import { getFinanceDocumentReview, recordFinanceDocumentReview, issueFinanceDocumentAccess } from "@/server/commands/finance-document-review";
import { AuthorizationError } from "@/server/auth/authorization";
import { readSelectedOrganizationId } from "@/server/auth/page-guards";
import { permissionProcedure, router } from "../trpc";
const resolveScope=(input:{organizationId:string})=>({kind:"organization" as const,organizationId:input.organizationId});
async function resolve<T>(organizationId:string, operation:()=>Promise<T>){
  try{if(await readSelectedOrganizationId()!==organizationId)throw new AuthorizationError();return await operation();}
  catch(error){throw financeDocumentRequestError(error);}
}
export function financeDocumentRequestError(error:unknown){
  return new TRPCError({code:error instanceof AuthorizationError?"NOT_FOUND":error instanceof FinanceDocumentInputError?"BAD_REQUEST"
    :error instanceof FinanceDocumentConflictError?"CONFLICT":"INTERNAL_SERVER_ERROR",message:"Finance document request failed"});
}
export const financeDocumentsRouter=router({
  recovery:permissionProcedure({permission:"finance.manage",input:financeDocumentRecoveryReadSchema,resolveScope})
    .query(({ctx,input})=>resolve(input.organizationId,()=>getFinanceDocumentRecovery(input,{supabase:ctx.supabase}))),
  abandonUpload:permissionProcedure({permission:"finance.manage",input:financeDocumentAbandonSchema,resolveScope})
    .mutation(({ctx,input})=>resolve(input.organizationId,()=>abandonFinanceDocumentUpload(input,{supabase:ctx.supabase}))),
  sources:permissionProcedure({permission:"finance.manage",input:financeDocumentSourcesSchema,resolveScope})
    .query(({ctx,input})=>resolve(input.organizationId,()=>getFinanceDocumentSources(input,{supabase:ctx.supabase}))),
  prepareUpload:permissionProcedure({permission:"finance.manage",input:financeDocumentUploadPreparationSchema,resolveScope})
    .mutation(({ctx,input})=>resolve(input.organizationId,()=>prepareFinanceDocumentUpload(input,{supabase:ctx.supabase}))),
  completeUpload:permissionProcedure({permission:"finance.manage",input:financeDocumentUploadCompletionSchema,resolveScope})
    .mutation(({ctx,input})=>resolve(input.organizationId,()=>completeFinanceDocumentUpload(input,{supabase:ctx.supabase}))),
  review:permissionProcedure({permission:"finance.manage",input:financeDocumentReviewReadSchema,resolveScope})
    .query(({ctx,input})=>resolve(input.organizationId,()=>getFinanceDocumentReview(input,{supabase:ctx.supabase}))),
  decide:permissionProcedure({permission:"finance.manage",input:financeDocumentReviewSchema,resolveScope})
    .mutation(({ctx,input})=>resolve(input.organizationId,()=>recordFinanceDocumentReview(input,{supabase:ctx.supabase}))),
  issueAccess:permissionProcedure({permission:"finance.manage",input:financeDocumentAccessSchema,resolveScope})
    .mutation(({ctx,input})=>resolve(input.organizationId,()=>issueFinanceDocumentAccess(input,{supabase:ctx.supabase}))),
  list:permissionProcedure({permission:"finance.manage",input:financeDocumentListSchema,resolveScope})
    .query(({ctx,input})=>resolve(input.organizationId,()=>getFinanceDocuments(input,{supabase:ctx.supabase}))),
  versions:permissionProcedure({permission:"finance.manage",input:financeDocumentVersionsSchema,resolveScope})
    .query(({ctx,input})=>resolve(input.organizationId,()=>getFinanceDocumentVersions(input,{supabase:ctx.supabase}))),
  history:permissionProcedure({permission:"finance.manage",input:financeDocumentHistorySchema,resolveScope})
    .query(({ctx,input})=>resolve(input.organizationId,()=>getFinanceDocumentHistory(input,{supabase:ctx.supabase}))),
});
