"use client";
import { useId,useRef,useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useTRPC } from "@/lib/trpc/client";
import { financeDocumentReviewSchema,financeDocumentReviewResultSchema,type FinanceDocumentReviewPage } from "@/lib/finance-document-review";
import { FinanceDocumentDownload } from "./finance-document-download";
import { financeFailure,FinanceDocumentFeedback,type FinanceFailure } from "./finance-document-feedback";
export function FinanceDocumentReview({page}:{page:FinanceDocumentReviewPage}){
  const trpc=useTRPC(),router=useRouter(),prefix=useId(),decide=useMutation(trpc.financeDocuments.decide.mutationOptions({retry:false}));
  const attempt=useRef<ReturnType<typeof financeDocumentReviewSchema.parse>|null>(null),busy=useRef(false);
  const [pending,setPending]=useState(false),[saved,setSaved]=useState(false),[failure,setFailure]=useState<FinanceFailure|null>(null);
  const [accessId,setAccessId]=useState<string|null>(null),[refreshFailed,setRefreshFailed]=useState(false);
  const [hasAttempt,setHasAttempt]=useState(false);
  const document=page.document,starting=document.state==="ready",locked=pending||saved||hasAttempt;
  async function send(input:ReturnType<typeof financeDocumentReviewSchema.parse>){
    if(busy.current)return;busy.current=true;setPending(true);setFailure(null);
    try{
      const result=financeDocumentReviewResultSchema.parse(await decide.mutateAsync(input));
      if(result.organizationId!==input.organizationId||result.documentId!==input.documentId||result.versionId!==input.versionId
        ||result.action!==input.action||result.revision!==input.expectedRevision+1||result.correlationId!==input.correlationId
        ||result.state!==(input.action==="begin_review"?"needs_review":input.action==="approve"?"approved":"rejected"))throw new Error("Invalid finance decision response");
      setSaved(true);try{router.refresh();}catch{setRefreshFailed(true);}
    }catch(error){const next=financeFailure(error);if(next==="invalid"){attempt.current=null;setHasAttempt(false);}setFailure(next);}
    finally{busy.current=false;setPending(false);}
  }
  if(!page.canReview)return <p role="status" className="text-sm">This account cannot record a new decision for this version.</p>;
  return <section className="space-y-5 rounded-lg border p-5" aria-label="Independent finance document review">
    <h2 className="text-xl font-semibold">{starting?"Start finance document review":"Record the finance document decision"}</h2>
    <p className="text-sm leading-7">Review the exact scanned file. The uploader cannot approve their own file.</p>
    {!starting&&!locked&&<FinanceDocumentDownload key={`${document.versionId}/${document.revision}`} organizationId={page.organizationId}
      document={document} purpose="finance_review" onAccessReady={setAccessId}/>}
    <form className="space-y-5" onSubmit={event=>{
      event.preventDefault();if(attempt.current||busy.current)return;const form=new FormData(event.currentTarget);
      const parsed=financeDocumentReviewSchema.safeParse({organizationId:page.organizationId,documentId:document.documentId,versionId:document.versionId,
        expectedRevision:document.revision,action:starting?"begin_review":String(form.get("decision")),reason:String(form.get("reason")??""),
        reviewReference:String(form.get("reviewReference")??""),correlationId:crypto.randomUUID(),idempotencyKey:crypto.randomUUID(),
        ...(!starting?{reviewedAccessId:accessId,contentsReviewed:form.get("contentsReviewed")==="on"}:{})});
      if(!parsed.success){setFailure("invalid");return;}attempt.current=parsed.data;setHasAttempt(true);void send(parsed.data);
    }}><fieldset className="space-y-5" disabled={locked}>
      {!starting&&<label className="block space-y-2 text-sm" htmlFor={`${prefix}-decision`}><span>Decision</span>
        <select name="decision" id={`${prefix}-decision`} className="min-h-11 w-full rounded-md border p-3"><option value="approve">Approve this version</option><option value="reject">Reject this version</option></select></label>}
      <label className="block space-y-2 text-sm" htmlFor={`${prefix}-reason`}><span>Private review reason</span>
        <textarea required name="reason" id={`${prefix}-reason`} maxLength={2000} aria-describedby={`${prefix}-reason-help`} className="min-h-24 w-full rounded-md border p-3"/></label>
      <p id={`${prefix}-reason-help`} className="text-xs leading-6">Use a review reason without links or credentials.</p>
      <label className="block space-y-2 text-sm" htmlFor={`${prefix}-reference`}><span>Review record reference</span>
        <input required name="reviewReference" id={`${prefix}-reference`} maxLength={500} className="min-h-11 w-full rounded-md border p-3"/></label>
      {!starting&&<label className="flex min-h-11 items-start gap-3 text-sm leading-7"><input type="checkbox" name="contentsReviewed" required className="mt-2 size-4 shrink-0"/>
        <span>I opened this version and reviewed its contents.</span></label>}
      <Button type="submit" className="min-h-11" disabled={!starting&&!accessId}>{starting?"Start review":"Record decision"}</Button>
    </fieldset></form>
    {pending&&<p role="status" className="text-sm">Recording the decision.</p>}
    {saved&&<p role="status" className="text-sm">The decision is recorded. Reload this page to read the current status.</p>}
    {refreshFailed&&<p role="status" className="text-sm">The page could not refresh. The recorded decision remains saved.</p>}
    <FinanceDocumentFeedback failure={failure} pending={pending} retry={()=>{if(attempt.current)void send(attempt.current);}}/>
  </section>;
}
