"use client";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import { WorkflowCommand, commandIds, workflowInputClass } from "@/components/workflow-command";
import type { EvaluationPublicationResult } from "@/server/commands/evaluation-publication";
import { Button } from "@/components/ui/button";
import { ComparisonMatrix } from "@/app/(app)/customer/evaluation/comparison-matrix";
import { responseChoices } from "./response-choices";

export function PublicationControls({organizationId,intakeId,revision,requirements,complete}: {
  organizationId:string; intakeId:string; revision:number;
  requirements:Array<{stableKey:string;label:string;importance:"must"|"nice"|"not_applicable";response:unknown}>; complete:boolean;
}) {
  const trpc=useTRPC();
  const prepare=useMutation(trpc.evaluations.prepare.mutationOptions());
  const publish=useMutation(trpc.evaluations.publish.mutationOptions());
  const [prepared,setPrepared]=useState<EvaluationPublicationResult|null>(null);
  const [afterOrdinal,setAfterOrdinal]=useState(0);
  const [reviewedCount,setReviewedCount]=useState(0);
  const [correlationId]=useState(()=>crypto.randomUUID());
  const review=useQuery(trpc.evaluations.review.queryOptions({organizationId,intakeId,
    publicationId:prepared?.publicationId??"00000000-0000-4000-8000-000000000000",correlationId,afterOrdinal,limit:50},
    {enabled:prepared!==null,retry:false}));
  const active=requirements.filter(r=>r.importance!=="not_applicable" && r.response!==null)
    .map(r=>({...r,choices:responseChoices(r.response)}));
  const labels=Object.fromEntries(active.map(r=>[r.stableKey,r.label]));
  return <section className="space-y-5 border-t pt-8" aria-labelledby="comparison-heading">
    <h2 id="comparison-heading" className="text-xl font-semibold">Prepare the masked comparison</h2>
    <p className="text-sm leading-6">Match each customer requirement to an approved vendor evidence field. Review the result before publication.</p>
    {!complete && <p role="status" className="text-sm">Load all requirements before preparing the comparison.</p>}
    <WorkflowCommand<Parameters<typeof prepare.mutateAsync>[0]> label="Prepare comparison" success="Comparison prepared. Review the options below."
      invalidMessage="The server did not accept the field matches. Each approved vendor field must start with a lowercase letter and use only lowercase letters, numbers, and underscores. Commercial, sponsorship, advertising, paid placement, and partner status fields cannot be used."
      disabled={!complete || active.length===0 || active.some(r=>r.choices.length===0)} execute={async(input)=>{const result=await prepare.mutateAsync(input);setPrepared(result);}}
      prepare={(data)=>({organizationId,intakeId,expectedRevision:revision,configuration:{version:2,criteria:active.map((r)=>{
        const choice=r.choices.length===1?r.choices[0]:r.choices.find((_,index)=>String(index)===data.get(`${r.stableKey}:answer`));
        if(!choice) throw new Error("Choose the answer to compare");
        return {requirementKey:r.stableKey,factKey:String(data.get(r.stableKey)),responsePath:choice.path};
      })},...commandIds()})}>
      {active.map(r=><div key={r.stableKey} className="space-y-3"><label className="block text-sm font-medium">{r.label} · approved vendor field
        <input name={r.stableKey} required pattern="[a-z][a-z0-9_]*" maxLength={100} className={workflowInputClass}/>
      </label>
        {r.choices.length>1?<label className="block text-sm font-medium">{r.label} · answer to compare
          <select name={`${r.stableKey}:answer`} required defaultValue="" className={workflowInputClass}>
            <option value="">Select an answer</option>{r.choices.map((choice,index)=><option key={JSON.stringify(choice.path)} value={index}>{choice.label}</option>)}
          </select>
        </label>:r.choices.length===1?<p className="text-sm">{r.choices[0].label}</p>
          :<p role="alert" className="text-sm">This requirement needs a single text, number, or yes/no answer before comparison.</p>}
      </div>)}
    </WorkflowCommand>
    {prepared && <div className="space-y-4">
      {review.isPending && <p role="status">Loading prepared options.</p>}
      {review.isError && <div role="alert"><p>The prepared comparison could not be loaded.</p><Button type="button" variant="outline" onClick={()=>void review.refetch()}>Retry options</Button></div>}
      {review.data && !review.isError && <>
        <p className="text-sm">{reviewedCount} options reviewed. This page shows {review.data.options.length} of {prepared.optionCount} options.</p>
        <ComparisonMatrix options={review.data.options} labels={labels} selectedOptionIds={new Set<string>()}
          requirements={active.flatMap(r=>r.importance==="must" || r.importance==="nice"
            ? [{key:r.stableKey,label:r.label,importance:r.importance}] : [])}
          renderChoice={()=>null}/>
        {review.data.nextOrdinal!==null && <Button type="button" variant="outline" disabled={review.isFetching} onClick={()=>{
          if (!review.data || review.data.nextOrdinal===null) return;
          setReviewedCount(count=>count+review.data.options.length);setAfterOrdinal(review.data.nextOrdinal);
        }}>Reviewed this page · Next options</Button>}
        <WorkflowCommand<Parameters<typeof publish.mutateAsync>[0]> label="Publish masked comparison" success="Masked comparison published for the customer."
          invalidMessage="The server did not accept the publication fields. Fill in the review reference (up to 500 characters) and the reason (up to 2,000 characters). Spaces alone are not accepted."
          disabled={review.isFetching || review.data.nextOrdinal!==null || reviewedCount+review.data.options.length!==prepared.optionCount || prepared.optionCount===0 || review.data.inputDigest!==prepared.inputDigest}
          execute={(input)=>publish.mutateAsync(input)} prepare={(data)=>({organizationId,publicationId:prepared.publicationId,
            expectedDigest:prepared.inputDigest,approvalReference:String(data.get("reference")),reason:String(data.get("reason")),...commandIds()})}>
          <label className="block text-sm font-medium">Comparison review reference<input name="reference" required maxLength={500} className={workflowInputClass}/></label>
          <label className="block text-sm font-medium">Publication reason<input name="reason" required maxLength={2000} className={workflowInputClass}/></label>
          <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" required/>I reviewed the approved evidence, matching fields, and all displayed options.</label>
        </WorkflowCommand>
      </>}
    </div>}
  </section>;
}
