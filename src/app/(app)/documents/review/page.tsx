import Link from "next/link";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { forbidden, notFound } from "next/navigation";
import { requireSelectedOrganizationPermission } from "@/server/auth/page-guards";
import { AuthorizationError } from "@/server/auth/authorization";
import { getWorkspaceDocumentReview } from "@/server/commands/workspace-document-review";
import { WorkspaceDocumentRowView } from "@/components/workflow/workspace-document-view";
import { WorkspaceDocumentReview } from "@/components/workflow/workspace-document-review";

const querySchema = z.strictObject({ document: z.uuid().transform(value => value.toLowerCase()), version: z.uuid().transform(value => value.toLowerCase()) });
export default async function DocumentReviewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { authorization } = await requireSelectedOrganizationPermission("rfp.approve");
  if (authorization.scope.kind !== "organization") forbidden();
  const query = querySchema.safeParse(await searchParams);
  if (!query.success) notFound();
  let page;
  try { page = await getWorkspaceDocumentReview({ organizationId: authorization.scope.organizationId, documentId: query.data.document,
    versionId: query.data.version, correlationId: randomUUID() }, { supabase: authorization.supabase }); }
  catch (error) { if (error instanceof AuthorizationError) notFound(); throw error; }
  return <main className="mx-auto w-full max-w-4xl space-y-6 px-6 py-10 [overflow-wrap:anywhere]">
    <nav aria-label="Document review workspace" className="flex flex-wrap gap-6 text-sm underline">
      <Link className="inline-flex min-h-11 items-center" href="/documents">Workspace documents</Link>
      <Link className="inline-flex min-h-11 items-center" href="/home">Home</Link></nav>
    <h1 className="text-3xl font-semibold">Document review</h1>
    <WorkspaceDocumentRowView row={page.document} organizationId={page.organizationId} />
    <WorkspaceDocumentReview key={`${page.document.versionId}/${page.document.revision}`} page={page} />
  </main>;
}
