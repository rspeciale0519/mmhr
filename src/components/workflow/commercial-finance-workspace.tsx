"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { z } from "zod";
import { managedFinanceReadSchema,managedFinanceDetailSchema } from "@/lib/managed-finance-workflow";
import { verifyManagedFinancePage,verifyManagedFinanceDetail,type managedFinancePageSchema,type managedFinanceDetailPageSchema } from "@/lib/managed-finance-reads";
import { CommercialApprovedOriginalChoices,CommercialNewAgreement,CommercialFinanceReadFailure,type CommercialFinanceOriginalReader,type CommercialFinanceSourcesReader } from "./commercial-finance-original-choices";
import { CommercialCalculationDetails } from "./commercial-finance-display";
import { CommercialSourceVersions } from "./commercial-finance-source-decisions";
import { CommercialContractCalculationActions,CommercialCalculationDecision } from "./commercial-finance-calculation-controls";
import type { CommercialFinanceExecutor } from "./use-commercial-finance-command";
import { commercialAmount,commercialTime } from "./commercial-finance-fields";

type Read=z.output<typeof managedFinanceReadSchema>;
type DetailRead=z.output<typeof managedFinanceDetailSchema>;
type Page=z.output<typeof managedFinancePageSchema>;
export type CommercialFinanceClient={list:(request:Read)=>Promise<unknown>;detail:(request:DetailRead)=>Promise<unknown>;
  originals:CommercialFinanceOriginalReader;sources:CommercialFinanceSourcesReader;execute:CommercialFinanceExecutor};
const route="/admin/finance/commercial";
function listUrl(view:Read["view"],afterId?:string){return `${route}?view=${view}${afterId?`&afterId=${afterId}`:""}`;}
function detailUrl(view:DetailRead["view"],entityId:string,beforeVersion?:number){return `${route}?view=${view}&entityId=${entityId}${beforeVersion?`&beforeVersion=${beforeVersion}`:""}`;}
const eventLabels={pending_review:"Waiting for finance review",approved:"Approved",invoiced:"Invoiced",partially_paid:"Partly paid",paid:"Paid",
  disputed:"Disputed",adjusted:"Adjusted",voided:"Voided",written_off:"Written off"};
export function CommercialFinanceList({page}:{page:Page}){
  return <section className="space-y-5" aria-label="Stored commercial finance records"><h2 className="text-xl font-semibold">
    {page.view==="agreements"?"Commission agreements":page.view==="contracts"?"Signed contracts":"Commission calculations"}</h2>
    {page.items.length===0?<p role="status">No finance records are available on this page.</p>:<ul className="space-y-4">{page.items.map(item=>
      "agreementId" in item?<li key={item.agreementId} className="space-y-2 rounded-lg border p-5 [overflow-wrap:anywhere]">
        <Link className="inline-flex min-h-11 items-center font-semibold underline" href={detailUrl("agreement",item.agreementId)}>{item.vendorLabel}</Link>
        <p className="text-sm">{item.currentApprovedVersionId?"An approved agreement version exists.":"No agreement version is approved."}</p>
        <p className="text-sm tabular-nums">Versions waiting for decision: {item.pendingVersionCount}.</p></li>
      :"calculationId" in item?<li key={item.calculationId} className="space-y-2 rounded-lg border p-5 [overflow-wrap:anywhere]">
        <Link className="inline-flex min-h-11 items-center font-semibold underline" href={detailUrl("calculation",item.calculationId)}>{item.dealLabel}</Link>
        <p className="text-sm">{item.vendorLabel}</p><p className="text-sm">{item.state==="pending"?"Waiting for independent decision":item.state==="approved"?"Approved":"Rejected"}</p>
        <p className="text-sm tabular-nums">Commission: {commercialAmount(item.amountMinorUnits,item.currency)}{item.currency?` ${item.currency}`:""}.</p>
        <p className="text-sm">Prepared by: {item.preparedByLabel}. {commercialTime(item.preparedAt)}</p>
        {item.blockerCodes.length>0&&<p className="text-sm">Completion blockers exist. Open the stored calculation for details.</p>}</li>
      :<li key={item.contractId} className="space-y-2 rounded-lg border p-5 [overflow-wrap:anywhere]">
        <Link className="inline-flex min-h-11 items-center font-semibold underline" href={detailUrl("contract",item.contractId)}>{item.dealLabel}</Link>
        <p className="text-sm">{item.vendorLabel}</p><p className="text-sm">Signed: {commercialTime(item.signedAt)}.</p>
        <p className="text-sm">{item.approvedFactsVersionId?"Confirmed contract facts are approved.":"Confirmed contract facts need approval."}</p>
        <p className="text-sm">{item.commissionState?eventLabels[item.commissionState]:"Commission eligibility is not recorded."}</p></li>)}</ul>}
    <nav className="flex flex-wrap gap-4 text-sm" aria-label="Finance record pages"><Link className="inline-flex min-h-11 items-center underline" href={listUrl(page.view)}>First record page</Link>
      {page.nextCursor&&<Link className="inline-flex min-h-11 items-center underline" href={listUrl(page.view,page.nextCursor)}>Next record page</Link>}</nav>
  </section>;
}
export type CommercialFinanceWorkspaceProps={workspaceLabel:string;workspaceType:"internal"|"customer";request:Read|DetailRead;
  initialData?:Page|z.output<typeof managedFinanceDetailPageSchema>};
export function CommercialFinanceWorkspace({workspaceLabel,workspaceType,request,api,initialData}:CommercialFinanceWorkspaceProps&{api:CommercialFinanceClient}){
  const isDetail="entityId" in request;
  const invalidScope=workspaceType==="internal"?!["agreements","agreement"].includes(request.view):["agreements","agreement"].includes(request.view);
  const query=useQuery({queryKey:["managedFinance",request],queryFn:async()=>{
    if("entityId" in request)return verifyManagedFinanceDetail(await api.detail(request),request);
    return verifyManagedFinancePage(await api.list(request),request);
  },retry:false,enabled:!invalidScope,initialData:initialData?"entityId" in request?verifyManagedFinanceDetail(initialData,request):verifyManagedFinancePage(initialData,request):undefined});
  if(invalidScope)return <p role="alert">Select the required finance workspace before opening these records.</p>;
  return <main className="mx-auto w-full max-w-5xl space-y-8 px-4 py-8 sm:px-6">
    <header className="space-y-3 [overflow-wrap:anywhere]"><h1 className="text-balance text-3xl font-semibold">Commercial finance</h1><p className="text-sm">Selected workspace: {workspaceLabel}.</p>
      <p className="max-w-prose text-sm leading-7">Prepare source terms and contract facts. Use a different authorized account for their approval and calculation decisions.</p>
      <nav aria-label="Commercial finance views" className="flex flex-wrap gap-4 text-sm">
        {workspaceType==="internal"?<Link className="inline-flex min-h-11 items-center underline" href={listUrl("agreements")}>Agreements</Link>:
          <><Link className="inline-flex min-h-11 items-center underline" href={listUrl("contracts")}>Signed contracts</Link>
            <Link className="inline-flex min-h-11 items-center underline" href={listUrl("calculations")}>Calculations</Link></>}
        <Link className="inline-flex min-h-11 items-center underline" href="/admin/finance/documents">Finance documents</Link>
        <Link className="inline-flex min-h-11 items-center underline" href="/workspaces">Select workspace</Link></nav>
    </header>
    {query.isPending?<p role="status">Loading the current finance records.</p>:query.isError?<CommercialFinanceReadFailure error={query.error} reload={()=>void query.refetch()}/>:
      "items" in query.data?<><CommercialFinanceList page={query.data}/>{query.data.view==="agreements"&&<CommercialNewAgreement organizationId={request.organizationId}
        readSources={api.sources} readOriginals={api.originals} execute={api.execute}/>}</>:query.data.view==="calculation"?<>
        <CommercialCalculationDetails organizationId={request.organizationId} calculation={query.data.calculation}/>
        <CommercialCalculationDecision key={`${query.data.entityId}/${query.data.calculation.revision}`} organizationId={request.organizationId} calculation={query.data.calculation} execute={api.execute}/></>:
      <section className="space-y-7 [overflow-wrap:anywhere]">
        <h2 className="text-2xl font-semibold">{query.data.view==="agreement"?query.data.agreement.vendorLabel:query.data.contract.dealLabel}</h2>
        {query.data.view==="contract"&&<><p className="text-sm">Vendor: {query.data.contract.vendorLabel}. Signed: {commercialTime(query.data.contract.signedAt)}.</p>
          <CommercialContractCalculationActions key={`${query.data.entityId}/${query.data.contract.currentEventRevision??0}/${query.data.contract.currentSourceDigest??"none"}`}
            organizationId={request.organizationId} contract={query.data.contract} execute={api.execute}/></>}
        <CommercialSourceVersions detail={query.data} execute={api.execute}/>
        {query.data.nextVersion&&<Link className="inline-flex min-h-11 items-center text-sm underline" href={detailUrl(query.data.view,query.data.entityId,query.data.nextVersion)}>Older source versions</Link>}
        {isDetail&&"beforeVersion" in request&&<Link className="inline-flex min-h-11 items-center text-sm underline" href={detailUrl(query.data.view,query.data.entityId)}>Latest source versions</Link>}
        {query.data.view==="agreement"?<CommercialApprovedOriginalChoices key={`${query.data.entityId}/${query.data.agreement.seriesRevision}`} organizationId={request.organizationId}
          source={{sourceClass:"agreement",vendorOrganizationId:query.data.agreement.vendorOrganizationId}} agreement={query.data.agreement} read={api.originals} execute={api.execute}/>
          :<CommercialApprovedOriginalChoices key={`${query.data.entityId}/${query.data.contract.currentFactsRevision}`} organizationId={request.organizationId}
            source={{sourceClass:"signed_contract",vendorOrganizationId:query.data.contract.vendorOrganizationId,contractId:query.data.contract.contractId,
              handoffId:query.data.contract.handoffId,dealId:query.data.contract.dealId}} contract={query.data.contract} read={api.originals} execute={api.execute}/>}
      </section>}
  </main>;
}


