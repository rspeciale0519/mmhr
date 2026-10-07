"use client";
import { useEffect,useId,useRef,useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import { createClient } from "@/lib/supabase/client";
import { createWorkspaceDocumentFileManifest,workspaceDocumentQuarantineBucket } from "@/lib/workspace-document-upload";
import { financeDocumentCompletionResultSchema } from "@/lib/finance-document-upload";
import { financeDocumentAbandonSchema,financeDocumentAbandonResultSchema,type FinanceDocumentAbandon,
  type FinanceDocumentRecoveryPage } from "@/lib/finance-document-recovery";
import { Button } from "@/components/ui/button";
import { documentTime } from "./workspace-document-view";
import { financeFailure,FinanceDocumentFeedback,type FinanceFailure } from "./finance-document-feedback";
type Completion={organizationId:string;documentId:string;versionId:string;expectedRevision:1;correlationId:string;idempotencyKey:string};
type Attempt={kind:"resume";file:File;input:Completion;stage:"storage"|"completion"}|{kind:"abandon";input:FinanceDocumentAbandon};
export function FinanceDocumentRecovery({page}:{page:FinanceDocumentRecoveryPage}){
  const trpc=useTRPC(),router=useRouter(),prefix=useId(),fileField=useRef<HTMLInputElement>(null),busy=useRef(false),attempt=useRef<Attempt|null>(null);
  const complete=useMutation(trpc.financeDocuments.completeUpload.mutationOptions({retry:false}));
  const abandon=useMutation(trpc.financeDocuments.abandonUpload.mutationOptions({retry:false}));
  const [pending,setPending]=useState(false),[hasAttempt,setHasAttempt]=useState(false),[failure,setFailure]=useState<FinanceFailure|null>(null);
  const [saved,setSaved]=useState<"resume"|"abandon"|null>(null),[refreshFailed,setRefreshFailed]=useState(false),[now,setNow]=useState(()=>Date.parse(page.document.createdAt));
  useEffect(()=>{const first=window.setTimeout(()=>setNow(Date.now()),0),timer=window.setInterval(()=>setNow(Date.now()),1000);
    return()=>{window.clearTimeout(first);window.clearInterval(timer);};},[]);
  const expired=now>=Date.parse(page.reservationExpiresAt),locked=pending||hasAttempt||saved!==null;
  function markSaved(kind:"resume"|"abandon"){
    setSaved(kind);try{router.refresh();}catch{setRefreshFailed(true);}
  }
  async function confirm(current:Extract<Attempt,{kind:"resume"}>){
    current.stage="completion";
    const result=financeDocumentCompletionResultSchema.parse(await complete.mutateAsync(current.input));
    if(result.organizationId!==current.input.organizationId||result.documentId!==current.input.documentId||result.versionId!==current.input.versionId
      ||result.correlationId!==current.input.correlationId)throw new Error("Invalid finance recovery completion");
    markSaved("resume");
  }
  async function run(current:Attempt){
    if(busy.current)return;busy.current=true;setPending(true);setFailure(null);
    try{
      if(current.kind==="abandon"){
        const result=financeDocumentAbandonResultSchema.parse(await abandon.mutateAsync(current.input));
        if(result.organizationId!==current.input.organizationId||result.documentId!==current.input.documentId||result.versionId!==current.input.versionId
          ||result.correlationId!==current.input.correlationId)throw new Error("Invalid finance abandonment response");
        markSaved("abandon");return;
      }
      if(current.stage==="storage"){
        const input=current.input,path=`${input.organizationId}/${input.documentId}/${input.versionId}`;
        const response=await createClient().storage.from(workspaceDocumentQuarantineBucket).upload(path,current.file,
          {contentType:page.document.contentType,cacheControl:"0",upsert:false});
        if(response.error||response.data?.path!==path||response.data.fullPath!==`${workspaceDocumentQuarantineBucket}/${path}`){
          const status=response.error&&"statusCode" in response.error?String(response.error.statusCode):null;
          if(status!=="409"){
            setFailure(["401","403"].includes(String(status))?"denied":["400","413"].includes(String(status))?"invalid":"unknown");return;
          }
        }
      }
      await confirm(current);
    }catch(error){
      const next=financeFailure(error);
      if(next==="invalid"&&current.kind==="abandon"){attempt.current=null;setHasAttempt(false);}
      setFailure(next);
    }finally{busy.current=false;setPending(false);}
  }
  async function resume(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();if(busy.current||attempt.current||saved||!page.canResume)return;
    if(Date.now()>=Date.parse(page.reservationExpiresAt)){setFailure("denied");setNow(Date.now());return;}
    const file=fileField.current?.files?.[0];if(!file){setFailure("invalid");return;}busy.current=true;setPending(true);setFailure(null);
    let current:Extract<Attempt,{kind:"resume"}>;
    try{
      const manifest=await createWorkspaceDocumentFileManifest(file),document=page.document;
      if(manifest.fileName!==document.fileName||manifest.declaredMimeType!==document.contentType||manifest.byteSize!==document.byteSize
        ||manifest.sha256!==page.sha256)throw new Error("Original finance file required");
      current={kind:"resume",file,stage:"storage",input:{organizationId:page.organizationId,documentId:document.documentId,
        versionId:document.versionId,expectedRevision:1,correlationId:page.reservationCorrelationId,idempotencyKey:crypto.randomUUID()}};
      attempt.current=current;setHasAttempt(true);
    }catch{busy.current=false;setPending(false);setFailure("invalid");return;}
    busy.current=false;await run(current);
  }
  return <section className="space-y-5 rounded-lg border p-5 [overflow-wrap:anywhere]" aria-label="Recover an unfinished finance upload">
    <h2 className="text-xl font-semibold">Recover an unfinished upload</h2>
    <p className="text-sm leading-7">This version has no processing job. Resume with the exact original file, or stop this upload.</p>
    <p className="text-sm">Reservation ends: {documentTime(page.reservationExpiresAt)}.</p>
    {page.canResume&&!expired?<form onSubmit={resume} className="space-y-4"><fieldset disabled={locked} className="space-y-4">
      <label className="block space-y-2 text-sm" htmlFor={`${prefix}-file`}><span>Exact original file: {page.document.fileName}</span>
        <input ref={fileField} id={`${prefix}-file`} required type="file" accept=".pdf,.docx,.png,.jpg,.jpeg" className="block min-h-11 w-full max-w-full rounded-md border p-3"/></label>
      <p className="text-sm leading-7">The name, file type, size, and contents must match. Existing files cannot be overwritten.</p>
      <Button type="submit" className="min-h-11">Resume this exact upload</Button>
    </fieldset></form>:<p role="status" className="text-sm">{expired?"The reservation expired. Stop this upload before creating a replacement.":"Only the current eligible uploader can resume this version."}</p>}
    {page.canAbandon&&<form className="space-y-4" onSubmit={event=>{
      event.preventDefault();if(busy.current||attempt.current||saved)return;const fields=new FormData(event.currentTarget);
      const parsed=financeDocumentAbandonSchema.safeParse({organizationId:page.organizationId,documentId:page.document.documentId,
        versionId:page.document.versionId,expectedRevision:1,reason:String(fields.get("reason")??""),correlationId:crypto.randomUUID(),idempotencyKey:crypto.randomUUID()});
      if(!parsed.success||fields.get("confirmed")!=="on"){setFailure("invalid");return;}
      const current:Attempt={kind:"abandon",input:parsed.data};attempt.current=current;setHasAttempt(true);void run(current);
    }}><fieldset disabled={locked} className="space-y-4">
      <label className="block space-y-2 text-sm" htmlFor={`${prefix}-reason`}><span>Reason to stop this upload</span>
        <textarea name="reason" id={`${prefix}-reason`} required maxLength={500} className="min-h-24 w-full rounded-md border p-3"/></label>
      <label className="flex min-h-11 items-start gap-3 text-sm leading-7"><input type="checkbox" name="confirmed" required className="mt-2 size-4 shrink-0"/>
        <span>Stop this unfinished version. Keep its stored file and history. A replacement requires a new upload and independent review.</span></label>
      <Button type="submit" variant="outline" className="min-h-11">Stop this unfinished upload</Button>
    </fieldset></form>}
    {pending&&<p role="status" className="text-sm">Recording upload recovery.</p>}
    {saved&&<p role="status" className="text-sm">{saved==="resume"?"The upload is recorded. Safety checks and independent review must finish before use."
      :"The unfinished version is rejected. Its file and history remain stored. Reload to upload a replacement."}</p>}
    {refreshFailed&&<p role="status" className="text-sm">The page could not refresh. The recorded result remains saved.</p>}
    <FinanceDocumentFeedback failure={failure} pending={pending} retry={()=>{if(failure==="unknown"&&attempt.current)void run(attempt.current);}}/>
  </section>;
}
