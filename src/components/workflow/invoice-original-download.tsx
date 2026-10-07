"use client";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import type { ManagedInvoiceDetail } from "./managed-invoice-preparation";
import { Button } from "@/components/ui/button";
type Original = NonNullable<ManagedInvoiceDetail["currentPreparation"]>["supportingOriginals"][number];
export type InvoiceOriginalDownloadInput = { organizationId: string; commissionEventId: string; invoiceId: string;
  preparationId: string; source: { organizationId: string; documentId: string; versionId: string; sha256: string };
  expectedRevision: number; correlationId: string; idempotencyKey: string };
export function InvoiceOriginalDownload({ detail, original, locked, onAccessReady }: { detail: ManagedInvoiceDetail;
  original: Original; locked: boolean; onAccessReady: (accessId: string) => void }) {
  const attempt = useRef<InvoiceOriginalDownloadInput | null>(null), busy = useRef(false), objectUrl = useRef<string | null>(null);
  const [pending, setPending] = useState(false), [saved, setSaved] = useState(false);
  const [failure, setFailure] = useState<"unknown" | "denied" | "stale" | "expired" | null>(null);
  useEffect(() => () => { if (objectUrl.current) URL.revokeObjectURL(objectUrl.current); }, []);
  async function download(fresh = false) {
    if (busy.current || locked || !detail.invoice || !detail.currentPreparation) return;
    busy.current = true; setPending(true); setFailure(null);
    try {
      if (fresh || !attempt.current) attempt.current = { organizationId: detail.organizationId, commissionEventId: detail.commissionEventId,
        invoiceId: detail.invoice.invoiceId, preparationId: detail.currentPreparation.preparationId,
        source: { organizationId: original.organizationId, documentId: original.documentId, versionId: original.versionId, sha256: original.sha256 },
        expectedRevision: original.document.revision, correlationId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID() };
      const response = await fetch("/api/finance/invoices/originals", { method: "POST", credentials: "same-origin", cache: "no-store", redirect: "error",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(attempt.current) });
      if (!response.ok) {
        if ([400, 401, 403, 404].includes(response.status)) { setFailure("denied"); return; }
        if (response.status === 409) { setFailure("stale"); return; }
        if (response.status === 410) { setFailure("expired"); return; }
        throw new Error("Invoice original response is unknown");
      }
      const access = z.uuid().safeParse(response.headers.get("X-MMHR-Reviewed-Access-Id"));
      if (!access.success || response.headers.get("content-type") !== "application/octet-stream"
        || response.headers.get("content-length") !== String(original.document.byteSize)) throw new Error("Invalid invoice original response");
      const file = await response.blob();
      if (file.size !== original.document.byteSize) throw new Error("Invalid invoice original length");
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = URL.createObjectURL(file);
      const link = window.document.createElement("a"); link.href = objectUrl.current; link.download = original.fileName;
      window.document.body.appendChild(link); link.click(); link.remove();
      onAccessReady(access.data.toLowerCase()); setSaved(true);
    } catch { setFailure("unknown"); }
    finally { busy.current = false; setPending(false); }
  }
  const denied = failure === "denied" || failure === "stale";
  return <section className="space-y-3 text-sm" aria-label={`Invoice original access: ${original.fileName}`}>
    <p>{original.fileName}. Stored version {original.originalVersion}.</p>
    {original.currentDocumentVersion !== original.originalVersion && <p>A later document exists. This invoice keeps its exact approved original.</p>}
    <Button type="button" variant="outline" className="min-h-11 transition-colors" disabled={locked || pending || failure !== null}
      onClick={() => void download(saved)}>{pending ? "Preparing original download…" : saved ? "Download this original again" : "Download this invoice original"}</Button>
    <p className="leading-7">The server checks invoice access and this original&apos;s finance workspace. Downloading does not approve invoice readiness.</p>
    {saved && <p role="status">Download started. Open this exact original before you confirm your review.</p>}
    {failure && <p role="alert">{failure === "unknown" ? "The file response is unknown. Retry the unchanged access request."
      : failure === "expired" ? "This original access expired. Request fresh access."
      : "The original or its access changed. Reload the authorized invoice record."}</p>}
    {failure === "unknown" && <Button type="button" className="min-h-11" disabled={locked || pending}
      onClick={() => void download()}>Retry unchanged original access</Button>}
    {failure === "expired" && <Button type="button" className="min-h-11" disabled={locked || pending}
      onClick={() => void download(true)}>Request fresh original access</Button>}
    {denied && <Button type="button" variant="outline" className="min-h-11" disabled={pending}
      onClick={() => window.location.reload()}>Reload invoice record</Button>}
  </section>;
}
