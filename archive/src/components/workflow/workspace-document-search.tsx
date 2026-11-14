"use client";

import { useActionState, useState, type ReactNode } from "react";
import { searchWorkspaceDocumentsAction } from "@/app/(app)/documents/actions";
import { WorkspaceDocumentRowView } from "./workspace-document-view";
import type { WorkspaceDocumentSearchState } from "@/lib/workspace-documents";

const initial: WorkspaceDocumentSearchState = { status: "idle" };
const buttonClass = "min-h-11 rounded-lg border px-4 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50";
export function WorkspaceDocumentSearch({ organizationId, showReview = false, children }: {
  organizationId: string; showReview?: boolean; children: ReactNode;
}) {
  const [state, action, pending] = useActionState(searchWorkspaceDocumentsAction, initial);
  const [query, setQuery] = useState("");
  return <section className="space-y-6" aria-label="Document file search" aria-busy={pending}>
    <form action={action} className="space-y-3">
      <input type="hidden" name="organizationId" value={organizationId} />
      <label htmlFor="document-file-query" className="block text-sm font-medium">Search file names</label>
      <div className="flex flex-wrap gap-3"><input id="document-file-query" name="query" type="search" maxLength={120}
        value={query} onChange={(event) => setQuery(event.target.value)} disabled={pending}
        className="min-h-11 min-w-0 flex-1 rounded-lg border bg-background px-3 text-base focus-visible:outline-2 focus-visible:outline-offset-2"
        aria-describedby="document-search-help" /><button type="submit" disabled={pending} className={buttonClass}>Search</button></div>
      <p id="document-search-help" className="text-sm leading-7">Search current file names in this workspace. Leave the field empty to show all files.</p>
    </form>
    {pending && <p role="status">Searching documents.</p>}
    {!pending && state.status === "error" && <p role="alert">Document search could not finish. Check your workspace and try again.</p>}
    {state.status === "idle" && children}
    {state.status === "success" && <div className="space-y-5">
      <p role="status">{state.page.items.length === 0 ? (state.query ? "No matching file names were found." : "No further documents were found.")
        : state.query ? `File name results for: ${state.query}` : "Workspace files"}</p>
      {state.page.items.map((row) => <WorkspaceDocumentRowView key={row.versionId} row={row}
        organizationId={organizationId} showReview={showReview} />)}
      {state.page.nextCursor && <form action={action}>
        <input type="hidden" name="organizationId" value={organizationId} /><input type="hidden" name="query" value={state.query} />
        <input type="hidden" name="afterId" value={state.page.nextCursor} />
        <button type="submit" className={buttonClass} disabled={pending}>Next results</button>
      </form>}
    </div>}
  </section>;
}
