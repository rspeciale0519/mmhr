"use client";
import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useTRPC } from "@/lib/trpc/client";
import { workspaceDocumentReviewSchema, type WorkspaceDocumentReviewPage } from "@/lib/workspace-document-review";
import { WorkspaceDocumentDownload } from "./workspace-document-download";

export function WorkspaceDocumentReview({ page }: { page: WorkspaceDocumentReviewPage }) {
  const trpc = useTRPC(), router = useRouter(), prefix = useId();
  const decide = useMutation(trpc.documents.decide.mutationOptions({ retry: false }));
  const attempt = useRef<ReturnType<typeof workspaceDocumentReviewSchema.parse> | null>(null), busy = useRef(false);
  const [phase, setPhase] = useState<"idle" | "pending" | "error" | "success" | "invalid">("idle");
  const [accessId, setAccessId] = useState<string | null>(null);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const document = page.document, starting = document.state === "ready";
  const locked = ["pending", "error", "success"].includes(phase);
  async function send(input: ReturnType<typeof workspaceDocumentReviewSchema.parse>) {
    if (busy.current) return;
    busy.current = true; setPhase("pending");
    try { await decide.mutateAsync(input); setPhase("success");
      try { router.refresh(); } catch { setRefreshFailed(true); }
    }
    catch { setPhase("error"); }
    finally { busy.current = false; }
  }
  if (!page.canReview) return <p role="status" className="text-sm">This version cannot receive a new decision from this account.</p>;
  return <section className="space-y-5 rounded-lg border p-5" aria-label="Independent document review">
    <h2 className="text-xl font-semibold">{starting ? "Start document review" : "Record your document decision"}</h2>
    <p className="text-sm leading-7">A staff member must review the exact scanned file. The uploader cannot approve their own file.</p>
    {!starting && !locked && <WorkspaceDocumentDownload organizationId={page.organizationId} document={document} purpose="review" onAccessReady={setAccessId} />}
    <form className="space-y-5" onSubmit={event => {
      event.preventDefault(); if (attempt.current || busy.current) return;
      const form = new FormData(event.currentTarget);
      const parsed = workspaceDocumentReviewSchema.safeParse({ organizationId: page.organizationId, documentId: document.documentId,
        versionId: document.versionId, expectedRevision: document.revision, action: starting ? "begin_review" : String(form.get("decision")),
        reason: String(form.get("reason") ?? ""), reviewReference: String(form.get("reviewReference") ?? ""),
        correlationId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID(),
        ...(!starting ? { reviewedAccessId: accessId, contentsReviewed: form.get("contentsReviewed") === "on" } : {}) });
      if (!parsed.success) { setPhase("invalid"); return; }
      attempt.current = parsed.data; void send(parsed.data);
    }}>
      <fieldset className="space-y-5" disabled={locked}>
        {!starting && <label className="block space-y-2 text-sm" htmlFor={`${prefix}-decision`}><span>Decision</span>
          <select name="decision" id={`${prefix}-decision`} className="min-h-11 w-full rounded-md border p-3">
            <option value="approve">Approve this version</option><option value="reject">Reject this version</option></select></label>}
        <label className="block space-y-2 text-sm" htmlFor={`${prefix}-reason`}><span>Private review reason</span>
          <input required name="reason" id={`${prefix}-reason`} aria-describedby={`${prefix}-reason-help`} maxLength={500} className="min-h-11 w-full rounded-md border p-3" /></label>
        <p id={`${prefix}-reason-help`} className="text-xs leading-6">Use a short review reason without links or credentials.</p>
        <label className="block space-y-2 text-sm" htmlFor={`${prefix}-reference`}><span>Review record reference</span>
          <input required name="reviewReference" id={`${prefix}-reference`} maxLength={500}
            className="min-h-11 w-full rounded-md border p-3" /></label>
        {!starting && <label className="flex min-h-11 items-start gap-3 text-sm leading-7">
          <input type="checkbox" name="contentsReviewed" required className="mt-2 size-4 shrink-0" />
          <span>I opened this version and reviewed its contents.</span></label>}
        <Button type="submit" className="min-h-11" disabled={!starting && !accessId}>{starting ? "Start review" : "Record decision"}</Button>
      </fieldset>
    </form>
    {phase === "pending" && <p role="status" className="text-sm">Recording your decision.</p>}
    {phase === "invalid" && <p role="alert" className="text-sm">Check the required fields and confirm your review before you submit.</p>}
    {phase === "success" && <p role="status" className="text-sm">Your decision is recorded. Reload this page to see the current status.</p>}
    {refreshFailed && <p role="status" className="text-sm">The page could not refresh. Your recorded result remains saved.</p>}
    {phase === "error" && <><p role="alert" className="text-sm">The decision result is uncertain. Retry the unchanged request or reload this page.</p>
      <Button type="button" variant="outline" className="min-h-11" onClick={() => { if (attempt.current) void send(attempt.current); }}>Retry unchanged decision</Button></>}
  </section>;
}
