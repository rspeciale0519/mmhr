"use client";
import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { useTRPC } from "@/lib/trpc/client";
import { proposalComparisonCommandSchema, proposalQuoteCommandSchema } from "@/lib/proposal-quote";
import { Button } from "@/components/ui/button";

const schema=z.union([proposalQuoteCommandSchema,proposalComparisonCommandSchema]);
type Command=z.output<typeof schema>;
export const proposalFieldClass="w-full rounded-md border bg-background p-3 text-sm leading-6 [overflow-wrap:anywhere]";
export function useProposalAction(){
  const trpc=useTRPC(),router=useRouter();
  const submit=useMutation(trpc.proposals.submit.mutationOptions({retry:false}));
  const review=useMutation(trpc.proposals.review.mutationOptions({retry:false}));
  const approve=useMutation(trpc.proposals.approve.mutationOptions({retry:false}));
  const revision=useMutation(trpc.proposals.requestRevision.mutationOptions({retry:false}));
  const withdraw=useMutation(trpc.proposals.withdraw.mutationOptions({retry:false}));
  const prepare=useMutation(trpc.proposals.prepareComparison.mutationOptions({retry:false}));
  const approveComparison=useMutation(trpc.proposals.approveComparison.mutationOptions({retry:false}));
  const rejectComparison=useMutation(trpc.proposals.rejectComparison.mutationOptions({retry:false}));
  const sending=useRef(false),attempt=useRef<Command|null>(null);
  const [locked,setLocked]=useState(false),[saved,setSaved]=useState(false),[message,setMessage]=useState<string|null>(null);
  async function send(input:Command){
    if(sending.current||saved)return;
    sending.current=true;setLocked(true);setMessage(null);
    try{
      if(input.action==="submit")await submit.mutateAsync(input);
      else if(input.action==="review")await review.mutateAsync(input);
      else if(input.action==="request_revision")await revision.mutateAsync(input);
      else if(input.action==="withdraw")await withdraw.mutateAsync(input);
      else if(input.action==="prepare")await prepare.mutateAsync(input);
      else if(input.action==="reject")await rejectComparison.mutateAsync(input);
      else if("comparisonId" in input)await approveComparison.mutateAsync(input);
      else await approve.mutateAsync(input);
      setSaved(true);setMessage("Your action is saved. The page shows the current records after refresh.");
      try{router.refresh();}catch{setMessage("Your action is saved. Reload the page to read the current records.");}
    }catch{setMessage("We could not confirm this action. Retry the unchanged request or reload the page.");}
    finally{sending.current=false;}
  }
  function begin(build:()=>Record<string,unknown>){
    if(locked||saved||sending.current)return;
    try{
      const parsed=schema.safeParse({...build(),correlationId:crypto.randomUUID(),idempotencyKey:crypto.randomUUID()});
      if(!parsed.success){setMessage(parsed.error.issues[0]?.message??"Check the proposal fields.");return;}
      attempt.current=parsed.data;void send(parsed.data);
    }catch(error){setMessage(error instanceof Error?error.message:"Check the proposal fields.");}
  }
  return{begin,locked,saved,message,pending:submit.isPending||review.isPending||approve.isPending||revision.isPending||withdraw.isPending
    ||prepare.isPending||approveComparison.isPending||rejectComparison.isPending,retry:()=>{if(attempt.current)void send(attempt.current);}};
}
export function ProposalActionStatus({action}:{action:ReturnType<typeof useProposalAction>}){
  return <div className="space-y-3">{action.message&&<p className="text-sm leading-7" role={action.saved?"status":"alert"}>{action.message}</p>}
    {action.locked&&!action.saved&&<div className="flex flex-wrap gap-3"><Button type="button" className="min-h-11" disabled={action.pending} onClick={action.retry}>Retry unchanged request</Button>
      <Button type="button" className="min-h-11" variant="outline" onClick={()=>window.location.reload()}>Reload page</Button></div>}</div>;
}
