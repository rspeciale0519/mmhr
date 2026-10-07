"use client";
import { useId,useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { z } from "zod";
import type { FinanceDocumentSource } from "@/lib/finance-document-upload";
import { financeDocumentSourcesSchema,financeDocumentSourcesPageSchema } from "@/lib/finance-document-sources";
import { managedFinanceOriginalChoicesSchema,verifyManagedFinanceOriginalChoices } from "@/lib/managed-finance-originals";
import type { managedFinanceDetailPageSchema } from "@/lib/managed-finance-reads";
import { Button } from "@/components/ui/button";
import { financeFailure } from "./finance-document-feedback";
import { CommercialAgreementPreparation,CommercialContractFactsPreparation } from "./commercial-finance-preparation";
import type { CommercialFinanceExecutor } from "./use-commercial-finance-command";
type Detail=z.output<typeof managedFinanceDetailPageSchema>;
export type CommercialFinanceOriginalReader=(input:z.output<typeof managedFinanceOriginalChoicesSchema>)=>Promise<unknown>;
export type CommercialFinanceSourcesReader=(input:z.output<typeof financeDocumentSourcesSchema>)=>Promise<unknown>;
export function CommercialFinanceReadFailure({error,reload}:{error:unknown;reload:()=>void}){
  const failure=financeFailure(error);
  return <div className="space-y-3"><p role="alert" className="text-sm leading-7">{failure==="denied"?"This finance read is unavailable for the current account.":
    failure==="stale"?"The finance records changed. Reload the current records.":failure==="invalid"?"The finance read request is invalid.":"The finance records could not load."}</p>
    <Button type="button" className="min-h-11 transition-colors" variant="outline" onClick={reload}>Reload finance records</Button></div>;
}
export function CommercialApprovedOriginalChoices({organizationId,source,agreement,contract,read,execute}:{organizationId:string;source:FinanceDocumentSource;
  agreement?:Extract<Detail,{view:"agreement"}>["agreement"];contract?:Extract<Detail,{view:"contract"}>["contract"];
  read:CommercialFinanceOriginalReader;execute:CommercialFinanceExecutor}){
  const [afterVersionId,setAfter]=useState<string|undefined>(),[correlationId]=useState(()=>crypto.randomUUID());
  const input=managedFinanceOriginalChoicesSchema.parse({organizationId,source,correlationId,...(afterVersionId?{afterVersionId}:{})});
  const query=useQuery({queryKey:["managedFinanceOriginals",input],queryFn:async()=>verifyManagedFinanceOriginalChoices(await read(input),input),retry:false});
  if(query.isPending)return <p role="status" className="text-sm">Loading approved originals for this stored source.</p>;
  if(query.isError)return <CommercialFinanceReadFailure error={query.error} reload={()=>void query.refetch()}/>;
  const choices=query.data;
  return <section className="space-y-5" aria-label="Approved finance original choices">
    {source.sourceClass==="agreement"?<CommercialAgreementPreparation key={`${source.vendorOrganizationId}/${afterVersionId??"first"}/${agreement?.seriesRevision??0}`}
      choices={choices} agreement={agreement} execute={execute}/>:contract?<CommercialContractFactsPreparation
        key={`${source.handoffId}/${afterVersionId??"first"}/${contract.currentFactsRevision}`} choices={choices} contract={contract} execute={execute}/>:null}
    <div className="flex flex-wrap gap-3">{afterVersionId&&<Button type="button" variant="outline" className="min-h-11 transition-colors" onClick={()=>setAfter(undefined)}>First original page</Button>}
      {choices.nextCursor&&<Button type="button" variant="outline" className="min-h-11 transition-colors" onClick={()=>setAfter(choices.nextCursor??undefined)}>Next original page</Button>}</div>
    <p className="text-xs leading-6">Each page contains at most 25 approved current originals. Page changes start a new preparation form.</p>
  </section>;
}
export function CommercialNewAgreement({organizationId,readSources,readOriginals,execute}:{organizationId:string;readSources:CommercialFinanceSourcesReader;
  readOriginals:CommercialFinanceOriginalReader;execute:CommercialFinanceExecutor}){
  const prefix=useId(),[afterId,setAfter]=useState<string|undefined>(),[selected,setSelected]=useState(""),[correlationId]=useState(()=>crypto.randomUUID());
  const input=financeDocumentSourcesSchema.parse({organizationId,correlationId,...(afterId?{afterId}:{})});
  const query=useQuery({queryKey:["commercialFinanceSources",input],queryFn:async()=>{
    const page=financeDocumentSourcesPageSchema.parse(await readSources(input));
    if(page.organizationId!==input.organizationId||page.correlationId!==input.correlationId||page.documentBinding!==null||page.workspaceType!=="internal")throw new Error("Invalid finance source page");
    let previous=input.afterId;for(const item of page.choices){if(previous&&item.choiceId<=previous)throw new Error("Invalid finance source order");previous=item.choiceId;}
    if(page.nextCursor&&(page.choices.length!==25||page.nextCursor!==previous))throw new Error("Invalid finance source cursor");return page;
  },retry:false});
  if(query.isPending)return <p role="status">Loading eligible agreement vendors.</p>;
  if(query.isError)return <CommercialFinanceReadFailure error={query.error} reload={()=>void query.refetch()}/>;
  const sources=query.data,choice=sources.choices.find(item=>item.choiceId===selected);
  function page(after?:string){setSelected("");setAfter(after);}
  return <section className="space-y-5 rounded-lg border p-5 [overflow-wrap:anywhere]" aria-label="New commission agreement">
    <h2 className="text-xl font-semibold">Prepare a new commission agreement</h2>
    <p className="text-sm leading-7">To change an existing agreement, open its vendor in the agreement register.</p>
    <label className="block space-y-2 text-sm" htmlFor={`${prefix}-vendor`}><span>Eligible vendor</span><select id={`${prefix}-vendor`} value={selected}
      onChange={event=>setSelected(event.target.value)} className="min-h-11 w-full max-w-full rounded-md border p-3"><option value="">Choose a stored vendor</option>
      {sources.choices.map(item=><option key={item.choiceId} value={item.choiceId}>{item.vendorLabel}</option>)}</select></label>
    {sources.choices.length===0&&<p role="status">No eligible vendors are available on this page.</p>}
    {choice&&<CommercialApprovedOriginalChoices key={choice.choiceId} organizationId={organizationId} source={choice.source} read={readOriginals} execute={execute}/>}
    <div className="flex flex-wrap gap-3">{afterId&&<Button type="button" variant="outline" className="min-h-11 transition-colors" onClick={()=>page()}>First vendor page</Button>}
      {sources.nextCursor&&<Button type="button" variant="outline" className="min-h-11 transition-colors" onClick={()=>page(sources.nextCursor??undefined)}>Next vendor page</Button>}</div>
  </section>;
}

