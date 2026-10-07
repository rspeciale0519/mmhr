"use client";
import { useEffect,useRef,useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { financeDocumentAccessResultSchema,type FinanceDocumentAccessResult } from "@/lib/finance-document-review";
import type { WorkspaceDocumentRow } from "@/lib/workspace-documents";
import { financeFailure,FinanceDocumentFeedback,type FinanceFailure } from "./finance-document-feedback";
type Input={organizationId:string;documentId:string;versionId:string;expectedRevision:number;purpose:"finance_review"|"finance_original";correlationId:string;idempotencyKey:string};
export function FinanceDocumentDownload({organizationId,document,purpose,onAccessReady}:{organizationId:string;document:WorkspaceDocumentRow;
  purpose:Input["purpose"];onAccessReady?:(accessId:string)=>void}){
  const trpc=useTRPC(),issue=useMutation(trpc.financeDocuments.issueAccess.mutationOptions({retry:false}));
  const attempt=useRef<{input:Input;grant:FinanceDocumentAccessResult|null}|null>(null),busy=useRef(false),objectUrl=useRef<string|null>(null);
  const [pending,setPending]=useState(false),[saved,setSaved]=useState(false),[failure,setFailure]=useState<FinanceFailure|null>(null);
  const [downloadFailed,setDownloadFailed]=useState(false);
  useEffect(()=>()=>{if(objectUrl.current)URL.revokeObjectURL(objectUrl.current);},[]);
  async function download(fresh=false){
    if(busy.current)return;busy.current=true;setPending(true);setFailure(null);setDownloadFailed(false);setSaved(false);
    try{
      if(fresh||!attempt.current)attempt.current={input:{organizationId,documentId:document.documentId,versionId:document.versionId,
        expectedRevision:document.revision,purpose,correlationId:crypto.randomUUID(),idempotencyKey:crypto.randomUUID()},grant:null};
      const current=attempt.current;
      if(!current.grant){
        try{
          const grant=financeDocumentAccessResultSchema.parse(await issue.mutateAsync(current.input));
          if(grant.organizationId!==organizationId||grant.documentId!==document.documentId||grant.versionId!==document.versionId
            ||grant.revision!==document.revision||grant.purpose!==purpose||grant.correlationId!==current.input.correlationId)throw new Error("Invalid finance access response");
          current.grant=grant;
        }catch(error){setFailure(financeFailure(error));return;}
      }
      try{
        const response=await fetch("/api/finance/documents/access",{method:"POST",credentials:"same-origin",cache:"no-store",redirect:"error",
          headers:{"Content-Type":"application/json"},body:JSON.stringify({organizationId,accessId:current.grant.accessId,
            accessToken:current.grant.accessToken,correlationId:crypto.randomUUID()})});
        if(!response.ok){
          if([400,401,403,404,409].includes(response.status)){setFailure(response.status===409?"stale":"denied");return;}
          throw new Error("Finance download unavailable");
        }
        if(response.headers.get("content-type")!=="application/octet-stream"||response.headers.get("content-length")!==String(document.byteSize))throw new Error("Invalid finance file response");
        const file=await response.blob();if(file.size!==document.byteSize)throw new Error("Invalid finance file length");
        if(objectUrl.current)URL.revokeObjectURL(objectUrl.current);objectUrl.current=URL.createObjectURL(file);
        const link=window.document.createElement("a");link.href=objectUrl.current;link.download=document.fileName;
        window.document.body.appendChild(link);link.click();link.remove();onAccessReady?.(current.grant.accessId);setSaved(true);
      }catch{setDownloadFailed(true);}
    }finally{busy.current=false;setPending(false);}
  }
  const locked=failure!==null&&failure!=="unknown";
  return <section className="space-y-3" aria-label="Private finance document access">
    <Button type="button" variant="outline" className="min-h-11" disabled={pending||locked||failure==="unknown"}
      onClick={()=>void download(saved)}>{pending?"Preparing download…":"Download this exact version"}</Button>
    <p className="text-sm leading-7">Access lasts 60 seconds and requires your current signed-in session.</p>
    {saved&&<p role="status" className="text-sm">Download started. Open the file to review its contents.</p>}
    <FinanceDocumentFeedback failure={failure} pending={pending} retry={()=>void download()}/>
    {downloadFailed&&<div className="space-y-3"><p role="alert" className="text-sm">The file response failed. Retry this access or request fresh access.</p>
      <div className="flex flex-wrap gap-3"><Button type="button" className="min-h-11" disabled={pending} onClick={()=>void download()}>Retry this download</Button>
        <Button type="button" variant="outline" className="min-h-11" disabled={pending} onClick={()=>void download(true)}>Request fresh access</Button></div></div>}
  </section>;
}
