import Link from "next/link";
import type { WorkspaceDocumentRow } from "@/lib/workspace-documents";
import { documentTime } from "./workspace-document-view";
import { FinanceDocumentDownload } from "./finance-document-download";
const states:Record<WorkspaceDocumentRow["state"],string>={received:"Upload not finished",quarantined:"Waiting for safety check",scanning:"Safety check in progress",
  ready:"Ready for independent review",processing:"Document processing",needs_review:"Waiting for independent review",approved:"Approved",
  rejected:"Rejected",failed:"Processing failed",superseded:"Earlier version"};
const formats:Record<WorkspaceDocumentRow["contentType"],string>={"application/pdf":"PDF","image/png":"PNG","image/jpeg":"JPEG",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":"Word document"};
const failures={unsafe_document:"The safety check rejected this file.",document_integrity:"The stored file did not match the recorded file.",
  invalid_document:"The file format failed validation.",processing_failed:"Document processing could not finish."};
export function FinanceDocumentRowView({organizationId,row,showVersions=true,showReview=true}:{organizationId:string;row:WorkspaceDocumentRow;
  showVersions?:boolean;showReview?:boolean}){
  return <article className="space-y-4 rounded-lg border p-5 [overflow-wrap:anywhere]">
    <h2 className="text-xl font-semibold">{row.fileName}</h2><p className="text-sm tabular-nums">Version {row.version} · {row.isCurrent?"Current version":"Earlier version"}</p>
    <p className="text-sm font-medium">Status: {states[row.state]}</p>
    <dl className="grid gap-4 text-sm sm:grid-cols-2"><div><dt className="font-medium">File type and size</dt><dd>{formats[row.contentType]} · {new Intl.NumberFormat("en").format(row.byteSize)} bytes</dd></div>
      <div><dt className="font-medium">Recorded</dt><dd>{documentTime(row.createdAt)}</dd></div><div><dt className="font-medium">Last update</dt><dd>{documentTime(row.updatedAt)}</dd></div></dl>
    {row.failureCode&&<p role="status" className="text-sm">{failures[row.failureCode]}</p>}
    <nav className="flex flex-wrap gap-x-6 gap-y-1 text-sm underline" aria-label={`${row.fileName} version ${row.version}`}>
      {showVersions&&<Link className="inline-flex min-h-11 items-center" href={`/admin/finance/documents?document=${row.documentId}`}>View finance versions</Link>}
      <Link className="inline-flex min-h-11 items-center" href={`/admin/finance/documents?document=${row.documentId}&version=${row.versionId}`}>View change history</Link>
      {showReview&&row.isCurrent&&["ready","needs_review"].includes(row.state)&&<Link className="inline-flex min-h-11 items-center"
        href={`/admin/finance/documents/review?document=${row.documentId}&version=${row.versionId}`}>Review this version</Link>}
    </nav>
    {["approved","superseded"].includes(row.state)&&<FinanceDocumentDownload key={`${row.versionId}/${row.revision}`} organizationId={organizationId}
      document={row} purpose="finance_original"/>}
  </article>;
}
