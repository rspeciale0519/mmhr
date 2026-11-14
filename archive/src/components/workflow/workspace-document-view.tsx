import Link from "next/link";
import type { WorkspaceDocumentRow } from "@/lib/workspace-documents";
import { WorkspaceDocumentDownload } from "./workspace-document-download";

const status: Record<WorkspaceDocumentRow["state"], string> = {
  received: "Upload not finished", quarantined: "Waiting for safety check", scanning: "Safety check in progress",
  ready: "Ready for MMHR review", processing: "Document processing", needs_review: "Waiting for MMHR review",
  approved: "Approved", rejected: "Rejected", failed: "Processing failed", superseded: "Earlier version",
};
const failures = { unsafe_document: "The safety check rejected this file.", document_integrity: "The stored file did not match the uploaded file.",
  invalid_document: "The file format did not pass validation.", processing_failed: "Document processing could not finish." };
const formats: Record<WorkspaceDocumentRow["contentType"], string> = { "application/pdf": "PDF", "image/png": "PNG", "image/jpeg": "JPEG",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word document" };
export function documentTime(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(value)) + " UTC";
}
export function WorkspaceDocumentRowView({ row, showVersions = true, organizationId, showReview = false }: {
  row: WorkspaceDocumentRow; showVersions?: boolean; organizationId?: string; showReview?: boolean;
}) {
  return <article className="space-y-4 rounded-lg border p-5 [overflow-wrap:anywhere]">
    <header className="space-y-2"><h2 className="text-xl font-semibold">{row.fileName}</h2>
      <p className="text-sm">Version {row.version}{row.isCurrent ? " · Current version" : " · Earlier version"}</p>
      <p className="text-sm font-medium">Status: {status[row.state]}</p></header>
    <dl className="space-y-2 text-sm"><div><dt className="font-medium">File type and size</dt>
      <dd>{formats[row.contentType]} · {new Intl.NumberFormat("en").format(row.byteSize)} bytes</dd></div>
      <div><dt className="font-medium">Recorded</dt><dd>{documentTime(row.createdAt)}</dd></div>
      <div><dt className="font-medium">Last update</dt><dd>{documentTime(row.updatedAt)}</dd></div></dl>
    {row.failureCode && <p role="status" className="text-sm">{failures[row.failureCode]}</p>}
    <nav aria-label={`${row.fileName} version ${row.version}`} className="flex flex-wrap gap-x-6 gap-y-1 text-sm underline">
      {showVersions && <Link className="inline-flex min-h-11 items-center" href={`/documents?document=${row.documentId}`}>View versions</Link>}
      <Link className="inline-flex min-h-11 items-center" href={`/documents?document=${row.documentId}&version=${row.versionId}`}>View change history</Link>
      {showReview && row.isCurrent && ["ready", "needs_review"].includes(row.state) && <Link className="inline-flex min-h-11 items-center"
        href={`/documents/review?document=${row.documentId}&version=${row.versionId}`}>Review this version</Link>}
    </nav>
    {organizationId && row.isCurrent && row.state === "approved" && <WorkspaceDocumentDownload key={`${row.versionId}/${row.revision}`}
      organizationId={organizationId} document={row} purpose="approved" />}
  </article>;
}
