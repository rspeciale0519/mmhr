import Link from "next/link";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { forbidden, notFound } from "next/navigation";
import { requireSelectedOrganizationPermission } from "@/server/auth/page-guards";
import { AuthorizationError, authorizePermission } from "@/server/auth/authorization";
import { getWorkspaceDocumentHistory, getWorkspaceDocuments, getWorkspaceDocumentVersions } from "@/server/commands/workspace-documents";
import { documentTime, WorkspaceDocumentRowView } from "@/components/workflow/workspace-document-view";
import { WorkspaceDocumentSearch } from "@/components/workflow/workspace-document-search";
import { WorkspaceDocumentUpload } from "@/components/workflow/workspace-document-upload";

const uuid = z.uuid().transform((value) => value.toLowerCase());
const cursor = (maximum: number) => z.string().regex(/^(0|[1-9][0-9]{0,9})$/).transform(Number).pipe(z.number().int().min(0).max(maximum));
const querySchema = z.strictObject({ after: uuid.optional(), document: uuid.optional(), version: uuid.optional(),
  afterVersion: cursor(100_000).optional(), afterRevision: cursor(2_147_483_646).optional() }).refine((query) => {
  if (!query.document) return !query.version && query.afterVersion === undefined && query.afterRevision === undefined;
  if (query.after) return false;
  return query.version ? query.afterVersion === undefined : query.afterRevision === undefined;
});
const actions = { reserve: "Upload recorded", uploaded: "Upload completed", scan_claimed: "Safety check started", scan_clean: "Safety check passed",
  scan_rejected: "Safety check rejected the file", scan_failed: "Safety check failed", review_started: "Document review started", approve: "Document approved", reject: "Document rejected",
  retry: "Processing retry recorded", supersede: "Version replaced" };
export default async function WorkspaceDocuments({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { authorization } = await requireSelectedOrganizationPermission("workspace.access");
  if (authorization.scope.kind !== "organization") forbidden();
  const query = querySchema.safeParse(await searchParams);
  if (!query.success) notFound();
  const { document, version, after, afterVersion, afterRevision } = query.data;
  const input = { organizationId: authorization.scope.organizationId, correlationId: randomUUID() };
  const options = { supabase: authorization.supabase };
  const [staffAccess, reviewAccess] = await Promise.all([
    authorizePermission("admin.access", { kind: "platform" }, options),
    authorizePermission("rfp.approve", authorization.scope, options),
  ]);
  const showReview = staffAccess?.identityId === authorization.identityId && reviewAccess?.identityId === authorization.identityId
    && staffAccess?.assurance === "aal2" && reviewAccess?.assurance === "aal2";
  async function readPage() {
    try {
      if (document && version) return { kind: "history" as const,
        page: await getWorkspaceDocumentHistory({ ...input, documentId: document, versionId: version, afterRevision: afterRevision ?? 0 }, options) };
      if (document) return { kind: "versions" as const,
        page: await getWorkspaceDocumentVersions({ ...input, documentId: document, afterVersion: afterVersion ?? 0 }, options) };
      return { kind: "list" as const, page: await getWorkspaceDocuments({ ...input, afterId: after }, options) };
    } catch (error) {
      if (error instanceof AuthorizationError) notFound();
      throw error;
    }
  }
  const result = await readPage();
  let content: React.ReactNode;
    if (result.kind === "history") {
      const page = result.page;
      content = <><h1 className="text-3xl font-semibold">Document change history</h1>
        <Link className="inline-flex min-h-11 items-center text-sm underline" href={`/documents?document=${document}`}>Back to document versions</Link>
        {page.items.length === 0 ? <p role="status">No further changes are recorded for this version.</p>
          : <ol className="space-y-4">{page.items.map((item) => <li key={item.revision} className="space-y-2 rounded-lg border p-5 text-sm">
            <h2 className="font-semibold">Change {item.revision}: {actions[item.action]}</h2><p>{documentTime(item.occurredAt)}</p></li>)}</ol>}
        {page.nextRevision && <Link className="inline-flex min-h-11 items-center underline"
          href={`/documents?document=${document}&version=${version}&afterRevision=${page.nextRevision}`}>Next changes</Link>}</>;
    } else if (result.kind === "versions") {
      const page = result.page;
      const current = page.items.find((row) => row.isCurrent);
      content = <><h1 className="text-3xl font-semibold">Document versions</h1><p className="text-sm">Current version: {page.currentVersion}</p>
        <Link className="inline-flex min-h-11 items-center text-sm underline" href="/documents">Back to workspace documents</Link>
        {page.canUpload && current && ["approved", "rejected"].includes(current.state) && page.currentVersion < 100_000
          && <WorkspaceDocumentUpload key={`${input.organizationId}/${document}/${page.currentVersion}`} organizationId={input.organizationId}
            replacement={{ documentId: page.documentId, expectedVersion: page.currentVersion }} />}
        {page.items.length === 0 && <p role="status">No further document versions are recorded.</p>}
        <div className="space-y-5">{page.items.map((row) => <WorkspaceDocumentRowView key={row.versionId} row={row} showVersions={false}
          organizationId={input.organizationId} showReview={showReview} />)}</div>
        {page.nextVersion && <Link className="inline-flex min-h-11 items-center underline"
          href={`/documents?document=${document}&afterVersion=${page.nextVersion}`}>Next versions</Link>}</>;
    } else {
      const page = result.page;
      content = <><h1 className="text-3xl font-semibold">Workspace documents</h1>
        <p className="text-sm leading-7">View document status, saved versions, and change history in your selected workspace.</p>
        {page.canUpload && <WorkspaceDocumentUpload key={`upload/${input.organizationId}`} organizationId={input.organizationId} />}
        <WorkspaceDocumentSearch key={`search/${input.organizationId}`} organizationId={input.organizationId} showReview={showReview}>
        {page.items.length === 0 && <p role="status">{after ? "No further documents are recorded." : "No documents are recorded in this workspace."}</p>}
        <div className="space-y-5">{page.items.map((row) => <WorkspaceDocumentRowView key={row.versionId} row={row}
          organizationId={input.organizationId} showReview={showReview} />)}</div>
        {page.nextCursor && <Link className="inline-flex min-h-11 items-center underline" href={`/documents?after=${page.nextCursor}`}>Next documents</Link>}
        {after && <Link className="inline-flex min-h-11 items-center text-sm underline" href="/documents">First documents</Link>}
        </WorkspaceDocumentSearch></>;
    }
  return <main className="mx-auto w-full max-w-4xl space-y-6 px-6 py-10 [overflow-wrap:anywhere]">
    <nav aria-label="Document workspace" className="flex flex-wrap gap-6 text-sm underline">
      <Link className="inline-flex min-h-11 items-center" href="/home">Home</Link>
      <Link className="inline-flex min-h-11 items-center" href="/workspaces">Change workspace</Link>
    </nav>{content}</main>;
}
