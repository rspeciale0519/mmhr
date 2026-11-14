"use client";
import { Button } from "@/components/ui/button";
export type FinanceFailure="invalid"|"denied"|"stale"|"unknown";
export function financeFailure(error:unknown):FinanceFailure{
  const data=error&&typeof error==="object"&&"data" in error?error.data:null;
  const code=data&&typeof data==="object"&&"code" in data?data.code:null;
  return code==="BAD_REQUEST"?"invalid":code==="CONFLICT"?"stale"
    :["UNAUTHORIZED","FORBIDDEN","NOT_FOUND"].includes(String(code))?"denied":"unknown";
}
const messages:Record<FinanceFailure,string>={invalid:"The request fields are invalid. Check the fields before another request.",
  denied:"Access or document state is unavailable. Reload the page before another request.",
  stale:"The document changed. Reload the page before another request.",
  unknown:"The response is unknown. Retry the unchanged request, or reload to check the document."};
export function FinanceDocumentFeedback({failure,retry,pending=false}:{failure:FinanceFailure|null;retry?:()=>void;pending?:boolean}){
  if(!failure)return null;
  return <div className="space-y-3"><p role="alert" className="text-sm leading-7">{messages[failure]}</p>
    <div className="flex flex-wrap gap-3">{failure==="unknown"&&retry&&<Button type="button" className="min-h-11" disabled={pending} onClick={retry}>Retry unchanged request</Button>}
      <Button type="button" variant="outline" className="min-h-11" disabled={pending} onClick={()=>window.location.reload()}>Reload page</Button></div></div>;
}
