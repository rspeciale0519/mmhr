"use client";
import Link from "next/link";
import { useId,useRef,useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import { createClient } from "@/lib/supabase/client";
import { createWorkspaceDocumentFileManifest,workspaceDocumentQuarantineBucket } from "@/lib/workspace-document-upload";
import { financeDocumentUploadPreparationSchema,financeDocumentReservationResultSchema,financeDocumentCompletionResultSchema } from "@/lib/finance-document-upload";
import type { FinanceDocumentSourcesPage,FinanceDocumentBinding } from "@/lib/finance-document-sources";
import { Button } from "@/components/ui/button";
import { financeFailure,FinanceDocumentFeedback,type FinanceFailure } from "./finance-document-feedback";
type Phase="idle"|"reading"|"reservation"|"upload"|"completion"|"success"|"failed";
type Attempt={file:File;input:ReturnType<typeof financeDocumentUploadPreparationSchema.parse>;completionKey:string;stage:"reservation"|"storage"|"completion"};
export function FinanceDocumentUpload({sources,replacement}:{sources:FinanceDocumentSourcesPage;
  replacement?:{documentId:string;expectedVersion:number;binding:FinanceDocumentBinding}}){
  const trpc=useTRPC(),router=useRouter(),prefix=useId();
  const prepare=useMutation(trpc.financeDocuments.prepareUpload.mutationOptions({retry:false})),complete=useMutation(trpc.financeDocuments.completeUpload.mutationOptions({retry:false}));
  const field=useRef<HTMLInputElement>(null),attempt=useRef<Attempt|null>(null),busy=useRef(false);
  const [phase,setPhase]=useState<Phase>("idle"),[failure,setFailure]=useState<FinanceFailure|null>(null),[refreshFailed,setRefreshFailed]=useState(false);
  const [recordedDocumentId,setRecordedDocumentId]=useState<string|null>(null);
  const [hasAttempt,setHasAttempt]=useState(false),[attemptStage,setAttemptStage]=useState<Attempt["stage"]|null>(null);
  const pending=["reading","reservation","upload","completion"].includes(phase),locked=pending||hasAttempt;
  async function confirm(current:Attempt){
    current.stage="completion";setAttemptStage("completion");setPhase("completion");
    try{
      const input=current.input,result=financeDocumentCompletionResultSchema.parse(await complete.mutateAsync({organizationId:input.organizationId,
        documentId:input.documentId,versionId:input.versionId,expectedRevision:1,correlationId:input.correlationId,idempotencyKey:current.completionKey}));
      if(result.organizationId!==input.organizationId||result.documentId!==input.documentId||result.versionId!==input.versionId
        ||result.correlationId!==input.correlationId)throw new Error("Invalid finance upload completion");
      setPhase("success");try{router.refresh();}catch{setRefreshFailed(true);}
    }catch(error){setPhase("failed");setFailure(financeFailure(error));}
  }
  async function reserveAndUpload(current:Attempt){
    setPhase("reservation");
    try{
      const input=current.input,result=financeDocumentReservationResultSchema.parse(await prepare.mutateAsync(input));
      if(result.organizationId!==input.organizationId||result.documentId!==input.documentId||result.versionId!==input.versionId
        ||result.version!==input.expectedVersion+1||result.correlationId!==input.correlationId)throw new Error("Invalid finance upload reservation");
    }catch(error){
      const next=financeFailure(error);if(next==="invalid"){attempt.current=null;setHasAttempt(false);setAttemptStage(null);setRecordedDocumentId(null);}setFailure(next);setPhase("failed");return;
    }
    setRecordedDocumentId(current.input.documentId);await uploadReserved(current);
  }
  async function uploadReserved(current:Attempt){
    current.stage="storage";setAttemptStage("storage");setPhase("upload");
    try{
      const input=current.input,path=`${input.organizationId}/${input.documentId}/${input.versionId}`;
      const response=await createClient().storage.from(workspaceDocumentQuarantineBucket).upload(path,current.file,
        {contentType:input.declaredMimeType,cacheControl:"0",upsert:false});
      if(response.error||response.data?.path!==path||response.data.fullPath!==`${workspaceDocumentQuarantineBucket}/${path}`){
        const status=response.error&&"statusCode" in response.error?String(response.error.statusCode):null;
        if(status==="409"){await confirm(current);return;}
        setFailure(status==="403"||status==="401"?"denied":status==="400"||status==="413"?"invalid":"unknown");setPhase("failed");return;
      }
    }catch{setFailure("unknown");setPhase("failed");return;}
    await confirm(current);
  }
  async function retry(){
    if(busy.current||!attempt.current||failure!=="unknown")return;busy.current=true;setFailure(null);
    try{if(attempt.current.stage==="reservation")await reserveAndUpload(attempt.current);
      else if(attempt.current.stage==="storage")await uploadReserved(attempt.current);else await confirm(attempt.current);}
    finally{busy.current=false;}
  }
  async function begin(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();if(busy.current||attempt.current)return;
    const file=field.current?.files?.[0],choiceId=new FormData(event.currentTarget).get("source"),choice=sources.choices.find(row=>row.choiceId===choiceId);
    const source=replacement?.binding.source??choice?.source;
    if(!file||!source){setFailure("invalid");return;}busy.current=true;setFailure(null);setPhase("reading");
    try{
      const manifest=await createWorkspaceDocumentFileManifest(file);
      const input=financeDocumentUploadPreparationSchema.parse({...manifest,source,organizationId:sources.organizationId,
        documentId:replacement?.documentId??crypto.randomUUID(),expectedVersion:replacement?.expectedVersion??0,
        versionId:crypto.randomUUID(),correlationId:crypto.randomUUID(),idempotencyKey:crypto.randomUUID()});
      const current:Attempt={file,input,completionKey:crypto.randomUUID(),stage:"reservation"};attempt.current=current;setHasAttempt(true);setAttemptStage("reservation");
      await reserveAndUpload(current);
    }catch{setFailure("invalid");setPhase("failed");}
    finally{busy.current=false;}
  }
  const messages:Partial<Record<Phase,string>>={reading:"Reading the selected file.",reservation:"Reserving the finance document.",
    upload:"Uploading the private file.",completion:"Checking the upload.",success:"The private upload is recorded. Safety checks and independent review must finish before use."};
  return <section className="space-y-5 rounded-lg border p-5 [overflow-wrap:anywhere]" aria-label={replacement?"Replace a finance document":"Upload a finance document"}>
    <h2 className="text-xl font-semibold">{replacement?"Upload a replacement version":"Upload a finance original"}</h2>
    <p className="text-sm leading-7">Use a PDF, Word, PNG, or JPEG file up to 25 MB. Finance files require a safety check and independent review.</p>
    <form className="space-y-4" onSubmit={begin}><fieldset disabled={locked} className="space-y-4">
      {replacement?<div className="space-y-2 text-sm"><p className="font-medium">Original source</p><p>{replacement.binding.vendorLabel}{replacement.binding.dealLabel&&` · ${replacement.binding.dealLabel}`}</p>
        <p>The replacement keeps the original source binding.</p></div>
        :<label className="block space-y-2 text-sm" htmlFor={`${prefix}-source`}><span>{sources.workspaceType==="internal"?"Agreement vendor":"Signed customer contract"}</span>
          <select required defaultValue="" name="source" id={`${prefix}-source`} className="min-h-11 w-full max-w-full rounded-md border p-3">
            <option value="" disabled>Choose a recorded source</option>{sources.choices.map(choice=><option key={choice.choiceId} value={choice.choiceId}>
              {choice.vendorLabel}{choice.dealLabel&&` · ${choice.dealLabel}`}</option>)}</select></label>}
      <label className="block space-y-2 text-sm" htmlFor={`${prefix}-file`}><span>Finance document file</span>
        <input ref={field} id={`${prefix}-file`} type="file" required accept=".pdf,.docx,.png,.jpg,.jpeg" className="block min-h-11 w-full max-w-full rounded-md border p-3"/></label>
      <Button type="submit" className="min-h-11" disabled={!replacement&&sources.choices.length===0}>Upload privately</Button>
    </fieldset></form>
    {!replacement&&sources.choices.length===0&&<p role="status" className="text-sm">No eligible recorded sources are available on this page.</p>}
    {messages[phase]&&<p role="status" className="text-sm leading-7">{messages[phase]}</p>}
    <FinanceDocumentFeedback failure={failure} pending={pending} retry={()=>void retry()}/>
    {failure==="unknown"&&attemptStage==="completion"&&<p className="text-sm">Retry checks the stored upload. It keeps the original file and command identifiers.</p>}
    {failure==="unknown"&&attemptStage==="storage"&&<p className="text-sm">Retry sends the same file to its reserved location. Existing files cannot be overwritten.</p>}
    {refreshFailed&&<p role="status" className="text-sm">The page could not refresh. The recorded upload remains saved.</p>}
    {recordedDocumentId&&<Link className="inline-flex min-h-11 items-center text-sm underline" href={`/admin/finance/documents?document=${recordedDocumentId}`}>Check recorded finance versions</Link>}
    {phase==="success"&&!replacement&&<Button type="button" variant="outline" className="min-h-11" onClick={()=>{
      attempt.current=null;setHasAttempt(false);setAttemptStage(null);setRecordedDocumentId(null);setPhase("idle");setFailure(null);setRefreshFailed(false);if(field.current)field.current.value="";
    }}>Upload another file</Button>}
  </section>;
}
