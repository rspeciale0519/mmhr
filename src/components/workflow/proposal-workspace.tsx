import { requireLaunchArea } from "@/lib/launch-surface-guard";
import Link from "next/link";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { forbidden,notFound } from "next/navigation";
import { requirePagePermission,requireSelectedOrganizationPermission } from "@/server/auth/page-guards";
import { requirePortalPageAccess } from "@/server/auth/portal/portal-guards";
import { AuthorizationError } from "@/server/auth/authorization";
import { getIntakesPage } from "@/server/commands/intake-read";
import { getVendorRfps } from "@/server/commands/rfp-portal";
import { getProposalComparisons,getProposalQuotes } from "@/server/commands/proposal-quotes";
import { ProposalQuoteForm } from "./proposal-quote-form";
import { ProposalComparisonForm,ProposalDecisionForm } from "./proposal-decisions";
import { displayProposalTime,ProposalComparison,ProposalQuoteDetails } from "./proposal-display";

type View="staff"|"customer"|"vendor";
export async function ProposalWorkspace({view,searchParams}:{view:View;searchParams:Promise<Record<string,string|string[]|undefined>>}){
  requireLaunchArea("candidate-b");
  if(view==="staff")await requirePagePermission("admin.access",{kind:"platform"});
  const {authorization}=view==="staff"?await requireSelectedOrganizationPermission("rfp.approve"):await requirePortalPageAccess(view);
  if(authorization.scope.kind!=="organization")forbidden();
  const query=z.strictObject({intake:z.uuid().optional(),recipient:z.uuid().optional(),after:z.uuid().optional(),comparisonsAfter:z.uuid().optional(),choicesAfter:z.uuid().optional()})
    .refine((value)=>view==="vendor"?!value.intake&&!value.comparisonsAfter:!value.recipient)
    .refine((value)=>!value.choicesAfter||!(value.intake||value.recipient))
    .refine((value)=>!(value.after||value.comparisonsAfter)||(view==="vendor"?!!value.recipient:!!value.intake)).safeParse(await searchParams);
  if(!query.success)notFound();
  const organizationId=authorization.scope.organizationId,options={supabase:authorization.supabase};
  const basePath=view==="staff"?"/admin/proposals":`/${view}/proposals`;
  const frame=(children:React.ReactNode)=><main className="mx-auto w-full max-w-5xl space-y-8 px-6 py-10"><header className="space-y-3">
    <Link className="inline-flex min-h-11 items-center text-sm underline" href={view==="staff"?"/admin":`/${view}`}>Back to {view==="staff"?"administration":`${view} workspace`}</Link>
    <h1 className="text-balance text-3xl font-semibold">Proposals and pricing</h1><p className="text-sm leading-7">Original vendor quotes stay unchanged. Separate staff review and approval control customer access.</p>
    {view==="staff"&&<Link className="inline-flex min-h-11 items-center text-sm underline" href="/workspaces">Change customer workspace</Link>}</header>{children}</main>;
  if(view==="vendor"&&!query.data.recipient){
    const page=await getVendorRfps({organizationId,correlationId:randomUUID(),afterId:query.data.choicesAfter},options);
    return frame(<section className="space-y-5"><h2 className="text-xl font-semibold">Choose a delivered request</h2>{page.items.length===0&&<p>No delivered requests are available.</p>}
      <ul className="divide-y">{page.items.map((item)=><li key={item.recipientId} className="py-3"><Link className="inline-flex min-h-11 items-center underline" href={`${basePath}?recipient=${item.recipientId}`}>{item.title}</Link></li>)}</ul>
      {page.nextCursor&&<Link className="inline-flex min-h-11 items-center underline" href={`${basePath}?choicesAfter=${page.nextCursor}`}>Next delivered requests</Link>}</section>);
  }
  if(view!=="vendor"&&!query.data.intake){
    const page=await getIntakesPage({organizationId,afterId:query.data.choicesAfter},options);
    return frame(<section className="space-y-5"><h2 className="text-xl font-semibold">Choose a customer intake</h2>{page.intakes.length===0&&<p>No saved intakes are available.</p>}
      <ul className="divide-y">{page.intakes.map((item)=><li key={item.intakeId} className="py-3"><Link className="inline-flex min-h-11 items-center underline" href={`${basePath}?intake=${item.intakeId}`}>Intake · {item.status} · {displayProposalTime(item.createdAt)}</Link></li>)}</ul>
      {page.nextCursor&&<Link className="inline-flex min-h-11 items-center underline" href={`${basePath}?choicesAfter=${page.nextCursor}`}>Next intakes</Link>}</section>);
  }
  const scope=view==="vendor"?{view,organizationId,recipientId:query.data.recipient!}:{view,organizationId,intakeId:query.data.intake!};
  const [quotes,comparisons]=await Promise.all([
    getProposalQuotes({...scope,correlationId:randomUUID(),afterId:query.data.after},options),
    view==="vendor"?Promise.resolve(null):getProposalComparisons({view,organizationId,intakeId:query.data.intake!,correlationId:randomUUID(),afterId:query.data.comparisonsAfter},options),
  ]).catch((error:unknown)=>{if(error instanceof AuthorizationError)notFound();throw error;});
  const pageLink=(key:"after"|"comparisonsAfter",value:string)=>{
    const params=new URLSearchParams(view==="vendor"?{recipient:query.data.recipient!}:{intake:query.data.intake!});
    if(query.data.after)params.set("after",query.data.after);if(query.data.comparisonsAfter)params.set("comparisonsAfter",query.data.comparisonsAfter);
    params.set(key,value);return`${basePath}?${params}`;
  };
  return frame(<><Link className="inline-flex min-h-11 items-center text-sm underline" href={basePath}>Choose another {view==="vendor"?"request":"intake"}</Link>
    {view==="vendor"&&(quotes.submission?.eligible&&quotes.submission.expectedVersion!==null?<ProposalQuoteForm key={`${query.data.recipient}:${quotes.submission.expectedVersion}`} organizationId={organizationId} recipientId={query.data.recipient!} expectedVersion={quotes.submission.expectedVersion}/>
      :<p className="rounded-lg border p-5 text-sm">Quote submission is unavailable. MMHR must prepare a current disclosed deal, and your account must have write access.</p>)}
    {view==="staff"&&<ProposalComparisonForm organizationId={organizationId} intakeId={query.data.intake!} choices={quotes.items.filter((row)=>row.current)}/>}
    {comparisons&&<section className="space-y-5"><h2 className="text-2xl font-semibold">Saved comparisons</h2>{comparisons.items.length===0&&<p className="text-sm">No {view==="customer"?"approved ":""}comparisons are available.</p>}
      {comparisons.items.map((item)=><ProposalComparison key={item.comparisonId} item={item}>{view==="staff"&&item.state==="draft"&&(item.canApprove||item.canReject)&&item.sourceDigest&&<ProposalDecisionForm organizationId={organizationId}
        decision={{kind:"comparison",comparisonId:item.comparisonId,expectedDigest:item.sourceDigest,actions:item.canApprove?["approve","reject"]:["reject"]}}/>}</ProposalComparison>)}
      {comparisons.nextCursor&&<Link className="inline-flex min-h-11 items-center underline" href={pageLink("comparisonsAfter",comparisons.nextCursor)}>Next saved comparisons</Link>}</section>}
    <section className="space-y-5"><h2 className="text-2xl font-semibold">{view==="customer"?"Approved quote history":"Original quote versions"}</h2>
      {quotes.items.length===0&&<p className="text-sm">No {view==="customer"?"approved ":""}quote versions are available.</p>}
      {quotes.items.map((item)=>{const actions=view==="staff"?(item.latest?(item.canReview?["review"] as const:item.state==="under_review"?(item.canApprove?["approve","request_revision"] as const:["request_revision"] as const):[]):[])
        :view==="vendor"&&item.canSubmit&&!["superseded","withdrawn"].includes(item.state)?["withdraw"] as const:[];
        return <article key={item.proposalVersionId} className="space-y-5 rounded-lg border p-5 [overflow-wrap:anywhere]"><header className="space-y-2"><h3 className="text-xl font-semibold">{item.vendorName} · Quote version {item.versionNumber}</h3>
          <p className="text-sm">State: {item.state.replaceAll("_"," ")}</p><p className="text-sm">Received: {displayProposalTime(item.receivedAt)}</p>
          {item.approvedAt&&<p className="text-sm">Approved: {displayProposalTime(item.approvedAt)}{!item.current?" · Historical version":""}</p>}
          {!item.latest&&<p className="text-sm">A newer quote version exists.</p>}</header><ProposalQuoteDetails quote={item.quote}/>{item.reason&&<p className="whitespace-pre-wrap text-sm">Decision reason: {item.reason}</p>}
          {actions.length>0&&<ProposalDecisionForm key={item.revision} organizationId={organizationId} decision={{kind:"quote",proposalVersionId:item.proposalVersionId,expectedRevision:item.revision,actions}}/>}</article>;})}
      {quotes.nextCursor&&<Link className="inline-flex min-h-11 items-center underline" href={pageLink("after",quotes.nextCursor)}>Next quote versions</Link>}
    </section></>);
}
