"use client";
import { useId,useState } from "react";
import type { z } from "zod";
import type { managedFinanceOriginalChoicesPageSchema } from "@/lib/managed-finance-originals";
import type { managedFinanceDetailPageSchema } from "@/lib/managed-finance-reads";
import { proposalQuoteCurrencyCodes } from "@/lib/proposal-quote";
import { Button } from "@/components/ui/button";
import { FinanceDocumentDownload } from "./finance-document-download";
import { commercialInstant,parseCommercialPercentage,parseCommercialTotal } from "./commercial-finance-fields";
import { useCommercialFinanceCommand,CommercialFinanceRequestStatus,type CommercialFinanceExecutor } from "./use-commercial-finance-command";
type Choices=z.output<typeof managedFinanceOriginalChoicesPageSchema>;
type Detail=z.output<typeof managedFinanceDetailPageSchema>;
type Agreement=Extract<Detail,{view:"agreement"}>["agreement"];
type Contract=Extract<Detail,{view:"contract"}>["contract"];
function CurrencyField({id,required=true}:{id:string;required?:boolean}){
  return <label className="block space-y-2 text-sm" htmlFor={id}><span>Currency</span><select name="currency" id={id} required={required}
    defaultValue="" className="min-h-11 w-full rounded-md border p-3"><option value="">{required?"Choose a currency":"Unknown currency"}</option>
    {proposalQuoteCurrencyCodes.map(code=><option key={code} value={code}>{code}</option>)}</select></label>;
}
export function CommercialReasonField({id}:{id:string}){
  return <div className="space-y-2 text-sm"><label className="block space-y-2" htmlFor={id}><span>Reason for this request</span><textarea name="reason" id={id} required maxLength={500}
    aria-describedby={`${id}-help`} className="min-h-24 w-full rounded-md border p-3"/></label><p id={`${id}-help`} className="text-xs">Use a short reason without links or credentials.</p></div>;
}
function OriginalChoice({choices,locked,id}:{choices:Choices;locked:boolean;id:string}){
  const [selected,setSelected]=useState("");const original=choices.items.find(item=>item.original.versionId===selected);
  return <section className="space-y-4"><label className="block space-y-2 text-sm" htmlFor={id}><span>Approved source original</span>
    <select name="original" id={id} required value={selected} onChange={event=>setSelected(event.target.value)} disabled={locked}
      className="min-h-11 w-full max-w-full rounded-md border p-3"><option value="" disabled>Choose an approved original</option>
      {choices.items.map(item=><option key={item.original.versionId} value={item.original.versionId}>
        {item.vendorLabel}{item.dealLabel&&` · ${item.dealLabel}`} · {item.document.fileName} · Version {item.document.version}</option>)}</select></label>
    {original&&!locked&&<FinanceDocumentDownload key={`${original.document.versionId}/${original.document.revision}`} organizationId={choices.organizationId}
      document={original.document} purpose="finance_original"/>}
    {choices.items.length===0&&<p role="status" className="text-sm">No approved current originals are available on this page.</p>}
  </section>;
}
const text=(fields:FormData,key:string)=>String(fields.get(key)??"");
export function CommercialAgreementPreparation({choices,agreement,execute}:{choices:Choices;agreement?:Agreement;execute:CommercialFinanceExecutor}){
  const prefix=useId(),request=useCommercialFinanceCommand(execute),[kind,setKind]=useState("flat_amount");
  if(choices.source.sourceClass!=="agreement"||agreement&&agreement.vendorOrganizationId!==choices.source.vendorOrganizationId){
    return <p role="alert">The agreement source is unavailable. Reload the finance workspace.</p>;
  }
  const predecessor=agreement?.currentApprovedVersionId??null,amendment=predecessor!==null;
  return <section className="space-y-5 rounded-lg border p-5 [overflow-wrap:anywhere]" aria-label="Prepare commission agreement terms">
    <h2 className="text-xl font-semibold">{amendment?"Prepare future agreement terms":"Prepare commission agreement terms"}</h2>
    <p className="text-sm leading-7">Preparation records proposed terms. An independent decision must approve their use.</p>
    <form className="space-y-5" onSubmit={event=>{
      event.preventDefault();if(request.locked)return;const fields=new FormData(event.currentTarget),original=choices.items.find(item=>item.original.versionId===fields.get("original"));
      if(!original){request.invalid();return;}
      try{
        const rule=kind==="unsupported"?{kind,sourceTermReference:text(fields,"sourceTermReference")}
          :kind==="contract_value_rate"?{kind,rateBasisPoints:parseCommercialPercentage(text(fields,"rate")),currency:text(fields,"currency")}
          :{kind,amountMinorUnits:parseCommercialTotal(true,text(fields,"amount"),text(fields,"currency")).amountMinorUnits,currency:text(fields,"currency")};
        request.submit({organizationId:choices.organizationId,action:"prepare_agreement",agreementId:agreement?.agreementId??crypto.randomUUID(),versionId:crypto.randomUUID(),
          vendorOrganizationId:choices.source.vendorOrganizationId,expectedSeriesRevision:agreement?.seriesRevision??0,predecessorVersionId:predecessor,
          source:original.original,effectiveFrom:commercialInstant(text(fields,"effectiveFrom")),statedEffectiveEnd:commercialInstant(text(fields,"effectiveEnd"),true),
          replacementSourceReference:amendment?text(fields,"replacementReference"):null,rule,
          conditionReferences:text(fields,"conditions").split(/\r?\n/).map(value=>value.trim()).filter(Boolean),reason:text(fields,"reason"),
          correlationId:crypto.randomUUID(),idempotencyKey:crypto.randomUUID()});
      }catch{request.invalid();}
    }}><fieldset disabled={request.locked} className="space-y-5">
      <OriginalChoice choices={choices} locked={request.locked} id={`${prefix}-original`}/>
      <label className="block space-y-2 text-sm" htmlFor={`${prefix}-kind`}><span>Calculation rule</span><select id={`${prefix}-kind`} value={kind}
        onChange={event=>setKind(event.target.value)} className="min-h-11 w-full rounded-md border p-3"><option value="flat_amount">Fixed commission amount</option>
        <option value="contract_value_rate">Percentage of confirmed contract value</option><option value="unsupported">Other source terms</option></select></label>
      <fieldset key={kind} className="space-y-4"><legend className="sr-only">Rule details</legend>
        {kind==="unsupported"?<label className="block space-y-2 text-sm" htmlFor={`${prefix}-unsupported`}><span>Source term reference</span>
          <input name="sourceTermReference" id={`${prefix}-unsupported`} required maxLength={500} className="min-h-11 w-full rounded-md border p-3"/></label>
          :<><CurrencyField id={`${prefix}-${kind}-currency`}/><label className="block space-y-2 text-sm" htmlFor={`${prefix}-${kind}-amount`}>
            <span>{kind==="flat_amount"?"Fixed commission amount":"Commission percentage"}</span><input name={kind==="flat_amount"?"amount":"rate"}
              id={`${prefix}-${kind}-amount`} required type="text" inputMode="decimal" className="min-h-11 w-full rounded-md border p-3"/></label></>}
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2"><label className="block space-y-2 text-sm" htmlFor={`${prefix}-from`}><span>Effective from (UTC)</span>
        <input name="effectiveFrom" id={`${prefix}-from`} required type="text" placeholder="2026-11-01T09:00:00.000001" aria-describedby={`${prefix}-time-help`}
          className="min-h-11 w-full max-w-full rounded-md border p-3"/></label>
        <label className="block space-y-2 text-sm" htmlFor={`${prefix}-end`}><span>Stated end (UTC, optional)</span>
          <input name="effectiveEnd" id={`${prefix}-end`} type="text" placeholder="2027-11-01T09:00:00" aria-describedby={`${prefix}-time-help`}
            className="min-h-11 w-full max-w-full rounded-md border p-3"/></label></div>
      <p id={`${prefix}-time-help`} className="text-xs leading-6">Use YYYY-MM-DDTHH:mm:ss.ffffff in UTC. Fractional seconds are optional.</p>
      {amendment&&<label className="block space-y-2 text-sm" htmlFor={`${prefix}-replacement`}><span>Source replacement reference</span>
        <input name="replacementReference" id={`${prefix}-replacement`} required maxLength={500} className="min-h-11 w-full rounded-md border p-3"/></label>}
      <label className="block space-y-2 text-sm" htmlFor={`${prefix}-conditions`}><span>Condition references, one per line (optional)</span>
        <textarea name="conditions" id={`${prefix}-conditions`} className="min-h-24 w-full rounded-md border p-3"/></label>
      <CommercialReasonField id={`${prefix}-reason`}/><Button type="submit" className="min-h-11 transition-colors" disabled={choices.items.length===0}>Record proposed terms</Button>
    </fieldset></form><CommercialFinanceRequestStatus request={request}/>
  </section>;
}
export function CommercialContractFactsPreparation({choices,contract,execute}:{choices:Choices;contract:Contract;execute:CommercialFinanceExecutor}){
  const prefix=useId(),request=useCommercialFinanceCommand(execute),[knowledge,setKnowledge]=useState("");
  if(choices.source.sourceClass!=="signed_contract"||choices.source.contractId!==contract.contractId||choices.source.handoffId!==contract.handoffId
    ||choices.source.dealId!==contract.dealId||choices.source.vendorOrganizationId!==contract.vendorOrganizationId){
    return <p role="alert">The signed contract source is unavailable. Reload the finance workspace.</p>;
  }
  return <section className="space-y-5 rounded-lg border p-5 [overflow-wrap:anywhere]" aria-label="Prepare confirmed contract facts">
    <h2 className="text-xl font-semibold">Prepare confirmed contract facts</h2><p className="text-sm leading-7">Use the stored signed contract original. An independent decision must approve these facts.</p>
    <form className="space-y-5" onSubmit={event=>{
      event.preventDefault();if(request.locked)return;const fields=new FormData(event.currentTarget),original=choices.items.find(item=>item.original.versionId===fields.get("original"));
      if(!original||!["known","unknown"].includes(knowledge)){request.invalid();return;}
      try{request.submit({organizationId:choices.organizationId,action:"prepare_contract_facts",contractId:contract.contractId,handoffId:contract.handoffId,versionId:crypto.randomUUID(),
        predecessorVersionId:contract.approvedFactsVersionId,expectedFactsRevision:contract.currentFactsRevision,source:original.original,
        contractValue:parseCommercialTotal(knowledge==="known",text(fields,"amount"),text(fields,"currency")),sourceReference:text(fields,"sourceReference"),
        reason:text(fields,"reason"),correlationId:crypto.randomUUID(),idempotencyKey:crypto.randomUUID()});}catch{request.invalid();}
    }}><fieldset disabled={request.locked} className="space-y-5"><OriginalChoice choices={choices} locked={request.locked} id={`${prefix}-original`}/>
      <label className="block space-y-2 text-sm" htmlFor={`${prefix}-knowledge`}><span>Contract total status</span><select required value={knowledge}
        id={`${prefix}-knowledge`} onChange={event=>setKnowledge(event.target.value)} className="min-h-11 w-full rounded-md border p-3">
        <option value="" disabled>Choose the confirmed status</option><option value="known">Confirmed total is known</option><option value="unknown">Total is unknown</option></select></label>
      <fieldset key={knowledge} className="space-y-4"><legend className="sr-only">Confirmed total details</legend><CurrencyField id={`${prefix}-${knowledge}-currency`} required={knowledge==="known"}/>
        {knowledge==="known"&&<label className="block space-y-2 text-sm" htmlFor={`${prefix}-amount`}><span>Confirmed contract total</span><input required name="amount"
          id={`${prefix}-amount`} type="text" inputMode="decimal" className="min-h-11 w-full rounded-md border p-3"/></label>}</fieldset>
      <label className="block space-y-2 text-sm" htmlFor={`${prefix}-reference`}><span>Contract source reference</span><input name="sourceReference" id={`${prefix}-reference`}
        required maxLength={500} className="min-h-11 w-full rounded-md border p-3"/></label>
      <CommercialReasonField id={`${prefix}-reason`}/><Button type="submit" className="min-h-11 transition-colors" disabled={choices.items.length===0}>Record proposed facts</Button>
    </fieldset></form><CommercialFinanceRequestStatus request={request}/>
  </section>;
}

