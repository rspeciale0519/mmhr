"use client";

import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTRPC } from "@/lib/trpc/client";
import { createClient } from "@/lib/supabase/client";
import { createWorkspaceDocumentFileManifest, workspaceDocumentQuarantineBucket,
  workspaceDocumentUploadPreparationSchema, type WorkspaceDocumentUploadPreparation } from "@/lib/workspace-document-upload";
import { Button } from "@/components/ui/button";

type Phase = "idle" | "reading" | "preparing" | "uploading" | "checking" | "reservation_error" | "completion_error" | "success" | "invalid";
type Attempt = { file: File; preparation: WorkspaceDocumentUploadPreparation; completionKey: string };

export function WorkspaceDocumentUpload({ organizationId, replacement }: {
  organizationId: string; replacement?: { documentId: string; expectedVersion: number };
}) {
  const trpc = useTRPC(), router = useRouter();
  const prepare = useMutation(trpc.documents.prepareUpload.mutationOptions({ retry: false }));
  const complete = useMutation(trpc.documents.completeUpload.mutationOptions({ retry: false }));
  const field = useRef<HTMLInputElement>(null), attempt = useRef<Attempt | null>(null), sending = useRef(false);
  const [phase, setPhase] = useState<Phase>("idle"), [refreshFailed, setRefreshFailed] = useState(false);
  const [recordedDocumentId, setRecordedDocumentId] = useState<string | null>(null);
  const busy = ["reading", "preparing", "uploading", "checking"].includes(phase);
  async function confirm(current: Attempt) {
    setPhase("checking");
    try {
      const input = current.preparation;
      await complete.mutateAsync({ organizationId: input.organizationId, documentId: input.documentId,
        versionId: input.versionId, expectedRevision: 1, correlationId: input.correlationId, idempotencyKey: current.completionKey });
      setPhase("success");
      try { router.refresh(); } catch { setRefreshFailed(true); }
    } catch { setPhase("completion_error"); }
  }
  async function reserveAndUpload(current: Attempt) {
    setPhase("preparing");
    try { await prepare.mutateAsync(current.preparation); }
    catch { setPhase("reservation_error"); return; }
    setPhase("uploading");
    try {
      const input = current.preparation;
      const objectPath = `${input.organizationId}/${input.documentId}/${input.versionId}`;
      const response = await createClient().storage.from(workspaceDocumentQuarantineBucket).upload(objectPath, current.file,
        { contentType: input.declaredMimeType, cacheControl: "0", upsert: false });
      if (response.error || response.data?.path !== objectPath
        || response.data.fullPath !== `${workspaceDocumentQuarantineBucket}/${objectPath}`) {
        setPhase("completion_error"); return;
      }
    } catch { setPhase("completion_error"); return; }
    await confirm(current);
  }
  async function begin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending.current || attempt.current) return;
    const file = field.current?.files?.[0];
    if (!file) { setPhase("invalid"); return; }
    sending.current = true; setPhase("reading");
    try {
      const manifest = await createWorkspaceDocumentFileManifest(file);
      const preparation = workspaceDocumentUploadPreparationSchema.parse({ ...manifest, organizationId,
        documentId: replacement?.documentId ?? crypto.randomUUID(), versionId: crypto.randomUUID(),
        expectedVersion: replacement?.expectedVersion ?? 0, correlationId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID() });
      const current = { file, preparation, completionKey: crypto.randomUUID() };
      attempt.current = current;
      setRecordedDocumentId(preparation.documentId);
      await reserveAndUpload(current);
    } catch { setPhase("invalid"); }
    finally { sending.current = false; }
  }
  async function retry() {
    const current = attempt.current;
    if (!current || sending.current || !["reservation_error", "completion_error"].includes(phase)) return;
    sending.current = true;
    try {
      if (phase === "reservation_error") await reserveAndUpload(current);
      else await confirm(current);
    } finally { sending.current = false; }
  }
  const message = phase === "invalid" ? "Choose a PDF, Word, PNG, or JPEG file from 1 byte to 25 MB with a valid name."
    : phase === "reservation_error" ? "The upload could not start. Retry the same request or check your recorded documents."
    : phase === "completion_error" ? "Upload completion is uncertain. Check this upload before you start another upload."
    : phase === "success" ? "Your private upload is recorded. Check its current status before use."
    : busy ? (phase === "reading" ? "Reading the selected file." : phase === "preparing" ? "Preparing the private upload."
      : phase === "uploading" ? "Uploading the file." : "Checking upload completion.") : null;
  return <section className="space-y-4 rounded-lg border p-5" aria-label={replacement ? "Upload a replacement version" : "Upload a workspace document"}>
    <h2 className="text-lg font-semibold">{replacement ? "Upload a replacement version" : "Upload a document"}</h2>
    <p className="text-sm leading-7">PDF, Word (.docx), PNG, and JPEG files can contain up to 25 MB. Files require safety checks and review before use.</p>
    <form onSubmit={begin} className="space-y-4">
      <label className="block space-y-2 text-sm"><span>Document file</span>
        <input ref={field} type="file" required accept=".pdf,.docx,.png,.jpg,.jpeg" disabled={busy || recordedDocumentId !== null}
          className="block min-h-11 w-full max-w-full rounded-md border p-3" /></label>
      <Button type="submit" className="min-h-11" disabled={busy || recordedDocumentId !== null}>Upload privately</Button>
    </form>
    {message && <p className="text-sm leading-7" role={phase.endsWith("error") || phase === "invalid" ? "alert" : "status"}>{message}</p>}
    {refreshFailed && <p role="status" className="text-sm">Upload completion is recorded. Reload this page to see the current status.</p>}
    {recordedDocumentId && <Link className="inline-flex min-h-11 items-center text-sm underline"
      href={`/documents?document=${recordedDocumentId}`}>Check recorded document versions</Link>}
    {(phase === "reservation_error" || phase === "completion_error") && <Button type="button" variant="outline" className="min-h-11" onClick={retry}>
      {phase === "reservation_error" ? "Retry the same request" : "Check this upload"}</Button>}
    {phase === "success" && !replacement && <Button type="button" variant="outline" className="min-h-11" onClick={() => {
      attempt.current = null; setRecordedDocumentId(null); if (field.current) field.current.value = ""; setRefreshFailed(false); setPhase("idle");
    }}>Upload another file</Button>}
  </section>;
}
