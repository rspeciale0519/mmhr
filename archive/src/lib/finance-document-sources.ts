import { z } from "zod";
import { financeDocumentSourceSchema } from "./finance-document-upload";
const uuid=z.uuid().transform(value=>value.toLowerCase());
const label=z.string().min(1).max(500).refine(value=>!/[\x00-\x1f\x7f]/.test(value));
export const financeDocumentSourcesSchema=z.strictObject({organizationId:uuid,correlationId:uuid,afterId:uuid.optional(),documentId:uuid.optional()});
export const financeDocumentSourceChoiceSchema=z.strictObject({choiceId:uuid,vendorLabel:label,dealLabel:label.nullable(),source:financeDocumentSourceSchema})
  .superRefine((choice,ctx)=>{
    const source=choice.source;
    if(choice.choiceId!==(source.sourceClass==="agreement"?source.vendorOrganizationId:source.handoffId)
      || (source.sourceClass==="agreement")!==(choice.dealLabel===null))ctx.addIssue({code:"custom",message:"Invalid finance source choice"});
  });
export const financeDocumentBindingSchema=z.strictObject({documentId:uuid,vendorLabel:label,dealLabel:label.nullable(),source:financeDocumentSourceSchema})
  .superRefine((binding,ctx)=>{if((binding.source.sourceClass==="agreement")!==(binding.dealLabel===null))ctx.addIssue({code:"custom",message:"Invalid finance source binding"});});
export const financeDocumentSourcesPageSchema=z.strictObject({organizationId:uuid,correlationId:uuid,workspaceType:z.enum(["internal","customer"]),
  choices:z.array(financeDocumentSourceChoiceSchema).max(25),nextCursor:uuid.nullable(),documentBinding:financeDocumentBindingSchema.nullable()})
  .superRefine((page,ctx)=>{
    const expected=page.workspaceType==="internal"?"agreement":"signed_contract";
    if(page.choices.some(choice=>choice.source.sourceClass!==expected)||page.documentBinding&&page.documentBinding.source.sourceClass!==expected
      ||new Set(page.choices.map(choice=>choice.choiceId)).size!==page.choices.length)ctx.addIssue({code:"custom",message:"Invalid finance workspace sources"});
  });
export type FinanceDocumentSourcesPage=z.output<typeof financeDocumentSourcesPageSchema>;
export type FinanceDocumentBinding=z.output<typeof financeDocumentBindingSchema>;
