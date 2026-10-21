"use client";
import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useTRPC } from "@/lib/trpc/client";
import { workspaceDocumentAccessResultSchema, type WorkspaceDocumentAccessResult } from "@/lib/workspace-document-review";
import type { WorkspaceDocumentRow } from "@/lib/workspace-documents";

type Phase = "idle" | "pending" | "success" | "issue_error" | "download_error";
export function WorkspaceDocumentDownload({ organizationId, document, purpose, onAccessReady }: {
  organizationId: string; document: WorkspaceDocumentRow; purpose: "review" | "approved"; onAccessReady?: (accessId: string) => void;
}) {
  const trpc = useTRPC();
  const issue = useMutation(trpc.documents.issueAccess.mutationOptions({ retry: false }));
  const attempt = useRef<{ input: { organizationId: string; documentId: string; versionId: string; expectedRevision: number;
    purpose: "review" | "approved"; correlationId: string; idempotencyKey: string }; grant: WorkspaceDocumentAccessResult | null } | null>(null);
  const busy = useRef(false), objectUrl = useRef<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  useEffect(() => () => { if (objectUrl.current) URL.revokeObjectURL(objectUrl.current); }, []);
  async function download(fresh = false) {
    if (busy.current) return;
    busy.current = true; setPhase("pending");
    try {
      if (fresh || !attempt.current) attempt.current = { input: { organizationId, documentId: document.documentId,
        versionId: document.versionId, expectedRevision: document.revision, purpose,
        correlationId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID() }, grant: null };
      const current = attempt.current;
      if (!current.grant) {
        try { current.grant = workspaceDocumentAccessResultSchema.parse(await issue.mutateAsync(current.input)); }
        catch { setPhase("issue_error"); return; }
      }
      try {
        const response = await fetch("/api/documents/access", { method: "POST", credentials: "same-origin", cache: "no-store", redirect: "error",
          headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId, accessId: current.grant.accessId,
            accessToken: current.grant.accessToken, correlationId: crypto.randomUUID() }) });
        if (!response.ok || response.headers.get("content-type") !== "application/octet-stream"
          || response.headers.get("content-length") !== String(document.byteSize)) throw new Error("Document request failed");
        const file = await response.blob();
        if (file.size !== document.byteSize) throw new Error("Document request failed");
        if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
        objectUrl.current = URL.createObjectURL(file);
        const link = window.document.createElement("a"); link.href = objectUrl.current; link.download = document.fileName;
        window.document.body.appendChild(link); link.click(); link.remove();
        onAccessReady?.(current.grant.accessId); setPhase("success");
      } catch { setPhase("download_error"); }
    } finally { busy.current = false; }
  }
  const pending = phase === "pending";
  return <section className="space-y-3" aria-label="Private document access">
    <Button type="button" variant="outline" className="min-h-11" disabled={pending} onClick={() => download(phase === "success")}> 
      {pending ? "Preparing download…" : phase === "issue_error" ? "Retry unchanged access request" : "Download this version"}
    </Button>
    <p className="text-sm leading-7">File access lasts 60 seconds and requires your current signed-in session.</p>
    {phase === "success" && <p role="status" className="text-sm">Download started. Open the file to check its contents.</p>}
    {phase === "issue_error" && <p role="alert" className="text-sm">File access is uncertain. Retry the unchanged request or reload this page.</p>}
    {phase === "download_error" && <><p role="alert" className="text-sm">The file could not download. Retry this access or request fresh access.</p>
      <Button type="button" variant="outline" className="min-h-11" disabled={pending} onClick={() => download(true)}>Request fresh access</Button></>}
  </section>;
}
