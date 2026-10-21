import Link from "next/link";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { forbidden,notFound } from "next/navigation";
import { requireSelectedOrganizationPermission } from "@/server/auth/page-guards";
import { AuthorizationError } from "@/server/auth/authorization";
import { requireFinanceDocumentAuthority } from "@/server/commands/finance-document-upload";
import { getFinanceDocuments,getFinanceDocumentVersions,getFinanceDocumentHistory } from "@/server/commands/finance-documents";
import { getFinanceDocumentSources } from "@/server/commands/finance-document-sources";
import { getFinanceDocumentReview } from "@/server/commands/finance-document-review";
import { documentTime } from "./workspace-document-view";
import { FinanceDocumentRowView } from "./finance-document-view";
import { FinanceDocumentUpload } from "./finance-document-upload";
import { FinanceDocumentReview } from "./finance-document-review";
import { getFinanceDocumentRecovery } from "@/server/commands/finance-document-recovery";
import { FinanceDocumentRecovery } from "./finance-document-recovery";
const uuid=z.uuid().transform(value=>value.toLowerCase());
const cursor=(maximum:number)=>z.string().regex(/^(0|[1-9][0-9]{0,9})$/).transform(Number).pipe(z.number().int().min(0).max(maximum));
const querySchema=z.strictObject({after:uuid.optional(),sourceAfter:uuid.optional(),document:uuid.optional(),version:uuid.optional(),
  afterVersion:cursor(100_000).optional(),afterRevision:cursor(2_147_483_646).optional()}).refine(query=>{
    if(!query.document)return !query.version&&query.afterVersion===undefined&&query.afterRevision===undefined;
    if(query.after||query.sourceAfter)return false;return query.version?query.afterVersion===undefined:query.afterRevision===undefined;
  });
const actions={reserve:"Upload recorded",uploaded:"Upload completed",scan_claimed:"Safety check started",scan_clean:"Safety check passed",
  scan_rejected:"Safety check rejected the file",scan_failed:"Safety check failed",review_started:"Independent review started",approve:"Document approved",
  reject:"Document rejected",retry:"Processing retry recorded",supersede:"Version replaced",abandon:"Unfinished upload stopped"};
type Search=Promise<Record<string,string|string[]|undefined>>;
export async function FinanceDocumentWorkspace({searchParams,review=false}:{searchParams:Search;review?:boolean}){
  const {authorization}=await requireSelectedOrganizationPermission("finance.manage");
  if(authorization.scope.kind!=="organization"||authorization.assurance!=="aal2")forbidden();
  const parsed=querySchema.safeParse(await searchParams);
  if(!parsed.success)notFound();const query=parsed.data;
  if(review&&(!query.document||!query.version||query.afterRevision!==undefined))notFound();
  const organizationId=authorization.scope.organizationId,input={organizationId,correlationId:randomUUID()},options={supabase:authorization.supabase};
  const denied=(error:unknown):never=>{if(error instanceof AuthorizationError)notFound();throw error;};
  await requireFinanceDocumentAuthority(organizationId,input.correlationId,options).catch(denied);
  const sources=await getFinanceDocumentSources({...input,afterId:query.sourceAfter,documentId:query.document},options).catch(denied);
  const frame=(children:React.ReactNode)=><main className="mx-auto w-full max-w-4xl space-y-7 px-6 py-10 [overflow-wrap:anywhere]">
    <nav aria-label="Finance document workspace" className="flex flex-wrap gap-6 text-sm underline">
      <Link className="inline-flex min-h-11 items-center" href="/admin">Administration</Link>
      <Link className="inline-flex min-h-11 items-center" href="/workspaces">Change workspace</Link>
      <Link className="inline-flex min-h-11 items-center" href="/admin/finance/documents">Finance documents</Link></nav>
    <header className="space-y-3"><h1 className="text-balance text-3xl font-semibold">{review?"Finance document review":query.document?"Finance document versions and history":"Finance documents"}</h1>
      <p className="text-sm leading-7">Selected {sources.workspaceType==="internal"?"internal finance":"customer finance"} workspace. These files require current finance access.</p></header>
    {sources.documentBinding&&<section className="space-y-2 rounded-lg border p-5 text-sm" aria-label="Recorded finance source"><h2 className="font-semibold">Recorded source</h2>
      <p>{sources.documentBinding.vendorLabel}</p>{sources.documentBinding.dealLabel&&<p>{sources.documentBinding.dealLabel}</p>}
      <p>Labels use current records. The source binding remains unchanged.</p></section>}{children}</main>;
  if(review){
    const page=await getFinanceDocumentReview({...input,documentId:query.document!,versionId:query.version!},options).catch(denied);
    return frame(<><FinanceDocumentRowView row={page.document} organizationId={organizationId} showReview={false}/>
      <FinanceDocumentReview key={`${organizationId}/${page.document.versionId}/${page.document.revision}`} page={page}/></>);
  }
  if(query.document&&query.version){
    const page=await getFinanceDocumentHistory({...input,documentId:query.document,versionId:query.version,afterRevision:query.afterRevision??0},options).catch(denied);
    return frame(<section className="space-y-4"><h2 className="text-xl font-semibold">Version change history</h2>
      <Link className="inline-flex min-h-11 items-center text-sm underline" href={`/admin/finance/documents?document=${query.document}`}>Back to finance versions</Link>
      {page.items.length===0&&<p role="status">No further changes are recorded.</p>}
      <ol className="space-y-4">{page.items.map(item=><li key={item.revision} className="space-y-2 rounded-lg border p-5 text-sm">
        <h3 className="font-semibold">Change {item.revision}: {actions[item.action]}</h3><p>{documentTime(item.occurredAt)}</p></li>)}</ol>
      {page.nextRevision&&<Link className="inline-flex min-h-11 items-center underline" href={`/admin/finance/documents?document=${query.document}&version=${query.version}&afterRevision=${page.nextRevision}`}>Next changes</Link>}
    </section>);
  }
  if(query.document){
    const page=await getFinanceDocumentVersions({...input,documentId:query.document,afterVersion:query.afterVersion??0},options).catch(denied);
    const current=page.items.find(row=>row.isCurrent);
    const recovery=current?.state==="received"?await getFinanceDocumentRecovery({...input,documentId:page.documentId,versionId:current.versionId},options).catch(denied):null;
    return frame(<><p className="text-sm tabular-nums">Current version: {page.currentVersion}</p>
      {recovery&&<FinanceDocumentRecovery key={`${organizationId}/${recovery.document.versionId}/${recovery.document.revision}`} page={recovery}/>}
      {page.canUpload&&current&&["approved","rejected"].includes(current.state)&&sources.documentBinding&&page.currentVersion<100_000
        &&<FinanceDocumentUpload key={`${organizationId}/${page.documentId}/${page.currentVersion}`} sources={sources}
          replacement={{documentId:page.documentId,expectedVersion:page.currentVersion,binding:sources.documentBinding}}/>}
      {page.items.length===0&&<p role="status">No further finance versions are recorded.</p>}
      <div className="space-y-5">{page.items.map(row=><FinanceDocumentRowView key={row.versionId} row={row} organizationId={organizationId} showVersions={false}/>)}</div>
      {page.nextVersion&&<Link className="inline-flex min-h-11 items-center underline" href={`/admin/finance/documents?document=${query.document}&afterVersion=${page.nextVersion}`}>Next versions</Link>}
    </>);
  }
  const page=await getFinanceDocuments({...input,afterId:query.after},options).catch(denied);
  return frame(<>{page.canUpload&&<FinanceDocumentUpload key={`${organizationId}/${query.sourceAfter??"first"}`} sources={sources}/>}
    <nav aria-label="Finance source choices" className="flex flex-wrap gap-6 text-sm underline">
      {sources.nextCursor&&<Link className="inline-flex min-h-11 items-center" href={`/admin/finance/documents?sourceAfter=${sources.nextCursor}`}>More recorded sources</Link>}
      {query.sourceAfter&&<Link className="inline-flex min-h-11 items-center" href="/admin/finance/documents">First recorded sources</Link>}</nav>
    <section className="space-y-5"><h2 className="text-xl font-semibold">Recorded finance documents</h2>
      {page.items.length===0&&<p role="status">{query.after?"No further finance documents are recorded.":"No finance documents are recorded in this workspace."}</p>}
      {page.items.map(row=><FinanceDocumentRowView key={row.versionId} row={row} organizationId={organizationId}/>)}
      {page.nextCursor&&<Link className="inline-flex min-h-11 items-center underline" href={`/admin/finance/documents?after=${page.nextCursor}`}>Next finance documents</Link>}
    </section></>);
}
