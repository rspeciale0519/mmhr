"use client";
import { useId,useState } from "react";
import type { z } from "zod";
import type { managedFinanceDetailPageSchema } from "@/lib/managed-finance-reads";
import { Button } from "@/components/ui/button";
import { FinanceDocumentDownload } from "./finance-document-download";
import { CommercialReasonField } from "./commercial-finance-preparation";
import { CommercialAgreementRuleDetails,CommercialContractTotalDetails } from "./commercial-finance-display";
import { commercialTime } from "./commercial-finance-fields";
import { useCommercialFinanceCommand,CommercialFinanceRequestStatus,type CommercialFinanceExecutor } from "./use-commercial-finance-command";
type Detail=z.output<typeof managedFinanceDetailPageSchema>;
type Agreement=Extract<Detail,{view:"agreement"}>;
type Contract=Extract<Detail,{view:"contract"}>;
type SourceProps={organizationId:string;execute:CommercialFinanceExecutor}&(
  {view:"agreement";entityId:string;version:Agreement["versions"][number]}|
  {view:"contract";entityId:string;version:Contract["versions"][number]});
export function CommercialSourceDecision(props:SourceProps){
  const {organizationId,version,execute}=props,prefix=useId(),request=useCommercialFinanceCommand(execute);
  const [selection,setSelection]=useState("approve"),[accessId,setAccessId]=useState<string|null>(null),[reviewed,setReviewed]=useState(false);
  const action=selection==="reject"&&version.canReject?"reject":version.canApprove?"approve":"reject";
  if(!version.canDecide)return <p role="status" className="text-sm">No independent decision is available for this source version.</p>;
  if(version.original.organizationId!==organizationId)return <p role="alert">Select the original&apos;s finance workspace before this decision.</p>;
  return <section className="space-y-5 rounded-lg border p-5 [overflow-wrap:anywhere]" aria-label="Independent source decision">
    <h3 className="text-lg font-semibold">Record an independent source decision</h3>
    <p className="text-sm leading-7">Download and read this exact original. The account that prepared this version cannot decide it.</p>
    {!version.canApprove&&<p role="status" className="text-sm">Approval is unavailable. You can reject this stored version after reviewing its original.</p>}
    <FinanceDocumentDownload key={`${version.original.versionId}/${version.original.document.revision}`} organizationId={organizationId}
      document={version.original.document} purpose="finance_original" onAccessReady={id=>{if(!request.locked){setAccessId(id);setReviewed(false);}}}/>
    <form className="space-y-5" onSubmit={event=>{
      event.preventDefault();if(request.locked||!accessId||!reviewed||action==="approve"&&!version.canApprove||action==="reject"&&!version.canReject)return;
      const fields=new FormData(event.currentTarget),metadata={organizationId,versionId:version.versionId,expectedRevision:version.revision,
        expectedSourceDigest:version.sourceDigest,reviewedAccessId:accessId,contentsReviewed:true,
        reviewReference:String(fields.get("reviewReference")??""),reason:String(fields.get("reason")??""),correlationId:crypto.randomUUID(),idempotencyKey:crypto.randomUUID()};
      if(props.view==="agreement")request.submit({...metadata,action:action==="approve"?"approve_agreement":"reject_agreement",agreementId:props.entityId,
        expectedSeriesRevision:props.version.expectedSeriesRevision,predecessorVersionId:props.version.predecessorVersionId});
      else request.submit({...metadata,action:action==="approve"?"approve_contract_facts":"reject_contract_facts",contractId:props.entityId,
        expectedFactsRevision:props.version.expectedFactsRevision,predecessorVersionId:props.version.predecessorVersionId});
    }}><fieldset disabled={request.locked} className="space-y-5">
      <label className="flex min-h-11 items-start gap-3 text-sm leading-7" htmlFor={`${prefix}-reviewed`}><input type="checkbox" id={`${prefix}-reviewed`}
        checked={reviewed} disabled={!accessId} onChange={event=>setReviewed(event.target.checked)} className="mt-2 size-5 shrink-0"/>
        <span>I read the downloaded original and checked these recorded terms or facts.</span></label>
      <label className="block space-y-2 text-sm" htmlFor={`${prefix}-decision`}><span>Source decision</span><select id={`${prefix}-decision`} value={action}
        onChange={event=>setSelection(event.target.value)} className="min-h-11 w-full rounded-md border p-3">
        {version.canApprove&&<option value="approve">Approve this source version</option>}{version.canReject&&<option value="reject">Reject this source version</option>}</select></label>
      <label className="block space-y-2 text-sm" htmlFor={`${prefix}-reference`}><span>Decision record reference</span><input id={`${prefix}-reference`}
        name="reviewReference" required maxLength={500} className="min-h-11 w-full rounded-md border p-3"/></label>
      <CommercialReasonField id={`${prefix}-reason`}/><Button type="submit" className="min-h-11 transition-colors" disabled={!accessId||!reviewed}>Record source decision</Button>
    </fieldset></form><CommercialFinanceRequestStatus request={request}/>
  </section>;
}
export function CommercialSourceVersions({detail,execute}:{detail:Agreement|Contract;execute:CommercialFinanceExecutor}){
  return <section className="space-y-6" aria-label="Stored finance source versions">
    <h2 className="text-xl font-semibold">Stored source versions</h2>
    {detail.versions.length===0&&<p role="status">No proposed source versions are recorded on this page.</p>}
    {detail.versions.map(version=><article key={`${version.versionId}/${version.revision}`} className="space-y-5 rounded-lg border p-5 [overflow-wrap:anywhere]">
      <header className="space-y-2"><h3 className="text-lg font-semibold">Source version {version.version}</h3>
        <p className="text-sm">{version.state==="pending"?"Waiting for independent decision":version.state==="approved"?"Approved":"Rejected"}</p>
        <p className="text-sm">Prepared by: {version.preparedByLabel}. {commercialTime(version.preparedAt)}</p></header>
      {"rule" in version?<><p className="text-sm">Effective from: {commercialTime(version.effectiveFrom)}.</p>
        <p className="text-sm">Stated end: {version.statedEffectiveEnd?commercialTime(version.statedEffectiveEnd):"No stated end"}.</p>
        <CommercialAgreementRuleDetails rule={version.rule} conditions={version.conditionReferences}/></>
        :<><CommercialContractTotalDetails value={version.contractValue}/><p className="whitespace-pre-wrap text-sm">Source reference: {version.sourceReference}</p></>}
      <p className="text-sm">Original: {version.original.fileName}. Version {version.original.originalVersion}.</p>
      {version.original.currentDocumentVersion!==version.original.originalVersion&&<p className="text-sm">A later document exists. This record keeps its exact original.</p>}
      {version.decidedByLabel&&<section className="space-y-2 text-sm" aria-label="Recorded source decision"><p>Decided by: {version.decidedByLabel}.</p>
        <p>{version.decidedAt&&commercialTime(version.decidedAt)}</p><p className="whitespace-pre-wrap">{version.decisionReason}</p></section>}
      {detail.view==="agreement"&&"rule" in version?<CommercialSourceDecision organizationId={detail.organizationId} view="agreement"
        entityId={detail.entityId} version={version} execute={execute}/>:detail.view==="contract"&&"contractValue" in version?
          <CommercialSourceDecision organizationId={detail.organizationId} view="contract" entityId={detail.entityId} version={version} execute={execute}/>:null}
      {!version.canDecide&&<FinanceDocumentDownload organizationId={detail.organizationId} document={version.original.document} purpose="finance_original"/>}
    </article>)}
  </section>;
}

