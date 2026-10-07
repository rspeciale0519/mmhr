import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { proposalComparisonCommandSchema, proposalComparisonReadSchema, proposalQuoteCommandSchema, proposalQuoteReadSchema } from "@/lib/proposal-quote";
import { AuthorizationError } from "@/server/auth/authorization";
import { getProposalComparisons, getProposalQuotes, recordProposalComparison, recordProposalQuote } from "@/server/commands/proposal-quotes";
import { permissionProcedure, router } from "../trpc";

const resolveScope=(input:{organizationId:string})=>({kind:"organization" as const,organizationId:input.organizationId});
async function resolve<T>(operation:()=>Promise<T>){
  try{return await operation();}catch(error){throw new TRPCError({code:error instanceof AuthorizationError?"NOT_FOUND":"INTERNAL_SERVER_ERROR",message:"Proposal request failed"});}
}
export const proposalsRouter=router({
  vendor:permissionProcedure({permission:"portal.vendor.access",input:proposalQuoteReadSchema.options[0],resolveScope})
    .query(({ctx,input})=>resolve(()=>getProposalQuotes(input,{supabase:ctx.supabase}))),
  staff:permissionProcedure({permission:"rfp.approve",input:proposalQuoteReadSchema.options[1],resolveScope})
    .query(({ctx,input})=>resolve(()=>getProposalQuotes(input,{supabase:ctx.supabase}))),
  customer:permissionProcedure({permission:"portal.customer.access",input:proposalQuoteReadSchema.options[2],resolveScope})
    .query(({ctx,input})=>resolve(()=>getProposalQuotes(input,{supabase:ctx.supabase}))),
  staffComparisons:permissionProcedure({permission:"rfp.approve",input:proposalComparisonReadSchema.extend({view:z.literal("staff")}),resolveScope})
    .query(({ctx,input})=>resolve(()=>getProposalComparisons(input,{supabase:ctx.supabase}))),
  customerComparisons:permissionProcedure({permission:"portal.customer.access",input:proposalComparisonReadSchema.extend({view:z.literal("customer")}),resolveScope})
    .query(({ctx,input})=>resolve(()=>getProposalComparisons(input,{supabase:ctx.supabase}))),
  submit:permissionProcedure({permission:"portal.vendor.access",input:proposalQuoteCommandSchema.options[0],resolveScope})
    .mutation(({ctx,input})=>resolve(()=>recordProposalQuote(input,{supabase:ctx.supabase}))),
  review:permissionProcedure({permission:"rfp.approve",input:proposalQuoteCommandSchema.options[1],resolveScope})
    .mutation(({ctx,input})=>resolve(()=>recordProposalQuote(input,{supabase:ctx.supabase}))),
  approve:permissionProcedure({permission:"rfp.approve",input:proposalQuoteCommandSchema.options[2],resolveScope})
    .mutation(({ctx,input})=>resolve(()=>recordProposalQuote(input,{supabase:ctx.supabase}))),
  requestRevision:permissionProcedure({permission:"rfp.approve",input:proposalQuoteCommandSchema.options[3],resolveScope})
    .mutation(({ctx,input})=>resolve(()=>recordProposalQuote(input,{supabase:ctx.supabase}))),
  withdraw:permissionProcedure({permission:"portal.vendor.access",input:proposalQuoteCommandSchema.options[4],resolveScope})
    .mutation(({ctx,input})=>resolve(()=>recordProposalQuote(input,{supabase:ctx.supabase}))),
  prepareComparison:permissionProcedure({permission:"rfp.approve",input:proposalComparisonCommandSchema.options[0],resolveScope})
    .mutation(({ctx,input})=>resolve(()=>recordProposalComparison(input,{supabase:ctx.supabase}))),
  approveComparison:permissionProcedure({permission:"rfp.approve",input:proposalComparisonCommandSchema.options[1],resolveScope})
    .mutation(({ctx,input})=>resolve(()=>recordProposalComparison(input,{supabase:ctx.supabase}))),
  rejectComparison:permissionProcedure({permission:"rfp.approve",input:proposalComparisonCommandSchema.options[2],resolveScope})
    .mutation(({ctx,input})=>resolve(()=>recordProposalComparison(input,{supabase:ctx.supabase}))),
});
