"use client";
import { useId } from "react";
import { Button } from "@/components/ui/button";
import { ProposalActionStatus, proposalFieldClass, useProposalAction } from "./proposal-action";

type Decision={kind:"quote";proposalVersionId:string;expectedRevision:number;actions:readonly ("review"|"approve"|"request_revision"|"withdraw")[]}
  |{kind:"comparison";comparisonId:string;expectedDigest:string;actions:readonly ("approve"|"reject")[]};
const labels={review:"Record staff review",approve:"Record independent approval",request_revision:"Request a revised quote",withdraw:"Withdraw this quote",reject:"Reject this comparison"};
export function ProposalDecisionForm({organizationId,decision}:{organizationId:string;decision:Decision}){
  const action=useProposalAction(),prefix=useId();
  return <form className="space-y-4 border-t pt-5" onSubmit={(event)=>{event.preventDefault();const form=new FormData(event.currentTarget);
    action.begin(()=>{const choice=String(form.get("action"));if(!decision.actions.includes(choice as never))throw new Error("Choose an available action.");
      const reference=String(form.get("reference")??"").trim();
      return{action:choice,organizationId,...(decision.kind==="quote"?{proposalVersionId:decision.proposalVersionId,expectedRevision:decision.expectedRevision}
        :{comparisonId:decision.comparisonId,expectedRevision:1,expectedDigest:decision.expectedDigest}),reason:String(form.get("reason")),
        ...(choice==="approve"?{approvalReference:reference}:{})};});}}>
    <fieldset className="space-y-4" disabled={action.locked}>
      <label className="block space-y-2" htmlFor={`${prefix}-action`}><span className="text-sm font-medium">Action</span><select id={`${prefix}-action`} name="action" className={proposalFieldClass}>
        {decision.actions.map((choice)=><option key={choice} value={choice}>{labels[choice]}</option>)}</select></label>
      <label className="block space-y-2" htmlFor={`${prefix}-reason`}><span className="text-sm font-medium">Decision reason</span><textarea id={`${prefix}-reason`} name="reason" className={proposalFieldClass} rows={3} maxLength={2000} required/></label>
      {decision.actions.includes("approve")&&<label className="block space-y-2" htmlFor={`${prefix}-reference`}><span className="text-sm font-medium">Approval reference (required for approval)</span>
        <input id={`${prefix}-reference`} name="reference" className={proposalFieldClass} maxLength={300}/></label>}
      <Button type="submit" className="min-h-11">Save decision</Button>
    </fieldset><ProposalActionStatus action={action}/>
  </form>;
}
export function ProposalComparisonForm({organizationId,intakeId,choices}:{organizationId:string;intakeId:string;choices:{proposalVersionId:string;vendorName:string;versionNumber:number}[]}){
  const action=useProposalAction(),prefix=useId();
  return <form className="space-y-4 rounded-lg border p-5" onSubmit={(event)=>{event.preventDefault();const form=new FormData(event.currentTarget);
    action.begin(()=>({action:"prepare",organizationId,intakeId,proposalVersionIds:form.getAll("source").map(String),reason:String(form.get("reason"))}));}}>
    <h2 className="text-xl font-semibold">Prepare a comparison</h2><p className="text-sm leading-7">Choose two to five approved quotes from different vendors. A different staff member must approve the saved comparison.</p>
    <fieldset disabled={action.locked} className="space-y-4"><legend className="sr-only">Approved source quotes</legend>
      {choices.map((choice)=><label key={choice.proposalVersionId} className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" name="source" value={choice.proposalVersionId}/>
        {choice.vendorName} · Quote version {choice.versionNumber}</label>)}
      <label className="block space-y-2" htmlFor={`${prefix}-reason`}><span className="text-sm font-medium">Comparison reason</span><textarea id={`${prefix}-reason`} name="reason" className={proposalFieldClass} maxLength={2000} rows={3} required/></label>
      <Button type="submit" className="min-h-11" disabled={choices.length<2}>Save comparison for independent approval</Button>
    </fieldset><ProposalActionStatus action={action}/>
  </form>;
}
