"use client";
import { useRef,useState } from "react";
import { useRouter } from "next/navigation";
import { managedFinanceCommandSchema,verifyManagedFinanceResult,type ManagedFinanceCommand } from "@/lib/managed-finance-workflow";
import { Button } from "@/components/ui/button";
import { financeFailure,type FinanceFailure } from "./finance-document-feedback";
export type CommercialFinanceExecutor=(input:ManagedFinanceCommand)=>Promise<unknown>;
export function useCommercialFinanceCommand(execute:CommercialFinanceExecutor){
  const router=useRouter(),attempt=useRef<ManagedFinanceCommand|null>(null),busy=useRef(false);
  const [pending,setPending]=useState(false),[saved,setSaved]=useState(false),[hasAttempt,setHasAttempt]=useState(false);
  const [failure,setFailure]=useState<FinanceFailure|null>(null),[refreshFailed,setRefreshFailed]=useState(false);
  async function send(input:ManagedFinanceCommand){
    if(busy.current)return;busy.current=true;setPending(true);setFailure(null);
    try{verifyManagedFinanceResult(await execute(input),input);setSaved(true);try{router.refresh();}catch{setRefreshFailed(true);}}
    catch(error){const next=financeFailure(error);if(next==="invalid"){attempt.current=null;setHasAttempt(false);}setFailure(next);}
    finally{busy.current=false;setPending(false);}
  }
  function submit(value:unknown){
    if(busy.current||attempt.current||saved)return;const input=managedFinanceCommandSchema.safeParse(value);
    if(!input.success){setFailure("invalid");return;}attempt.current=input.data;setHasAttempt(true);void send(input.data);
  }
  return {submit,invalid:()=>setFailure("invalid"),locked:pending||saved||hasAttempt,pending,saved,failure,refreshFailed,
    retry:()=>{if(failure==="unknown"&&attempt.current)void send(attempt.current);}};
}
export function CommercialFinanceRequestStatus({request}:{request:ReturnType<typeof useCommercialFinanceCommand>}){
  const messages:Record<FinanceFailure,string>={invalid:"The request fields are invalid. Correct the fields before another request.",
    denied:"This action is unavailable. Reload the authorized finance record.",stale:"The finance record changed. Reload it before another request.",
    unknown:"The response is unknown. Retry the unchanged request, or reload to check the stored record."};
  return <div className="space-y-3 text-sm leading-7">
    {request.pending&&<p role="status">Recording the finance request.</p>}
    {request.saved&&<p role="status">The request is recorded. Reload to read its stored status.</p>}
    {request.refreshFailed&&<p role="status">The page could not refresh. The recorded result remains saved.</p>}
    {request.failure&&<><p role="alert">{messages[request.failure]}</p><div className="flex flex-wrap gap-3">
      {request.failure==="unknown"&&<Button type="button" className="min-h-11 transition-colors" disabled={request.pending} onClick={request.retry}>Retry unchanged request</Button>}
      <Button type="button" variant="outline" className="min-h-11 transition-colors" disabled={request.pending} onClick={()=>window.location.reload()}>Reload finance record</Button>
    </div></>}
  </div>;
}

