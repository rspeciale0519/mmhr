"use client";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { CommercialReasonField } from "@/components/workflow/commercial-finance-preparation";
import type { ManagedInvoiceRequest } from "./use-managed-invoice-command";
import type { ManagedInvoiceDetail } from "./managed-invoice-preparation";
import { InvoiceOriginalDownload } from "./invoice-original-download";
export function ManagedInvoiceDecisions({ detail, request }: { detail: ManagedInvoiceDetail; request: ManagedInvoiceRequest }) {
  const prefix = useId(), [selection, setSelection] = useState("approve_invoice"), [reviewed, setReviewed] = useState(false);
  const [access, setAccess] = useState<Record<string, string>>({});
  const p = detail.currentPreparation, invoice = detail.invoice;
  if (!p || !invoice) return <p role="status" className="text-sm">No invoice proposal is recorded.</p>;
  const action = selection === "reject_invoice" && p.canReject ? "reject_invoice" : p.canApprove ? "approve_invoice" : "reject_invoice";
  const canDecide = p.canApprove || p.canReject;
  const reviewedSources = p.supportingOriginals.map(original => ({ organizationId: original.organizationId, documentId: original.documentId,
    versionId: original.versionId, sha256: original.sha256, reviewedAccessId: access[`${p.preparationId}/${original.versionId}/${original.document.revision}`] }));
  const hasAccess = reviewedSources.every(source => Boolean(source.reviewedAccessId));
  function target() { return { organizationId: detail.organizationId, commissionEventId: detail.commissionEventId,
    invoiceId: invoice!.invoiceId, preparationId: p!.preparationId, expectedEventRevision: detail.eventRevision,
    expectedInvoiceRevision: invoice!.invoiceRevision, expectedPreparationRevision: p!.revision,
    expectedSourceDigest: p!.sourceDigest, correlationId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID() }; }
  return <section className="space-y-5 rounded-lg border p-5 [overflow-wrap:anywhere]" aria-label="Invoice readiness decision">
    <h2 className="text-xl font-semibold">Invoice readiness and issue</h2>
    <p className="text-sm">Prepared by: {p.preparedByLabel}. Owner: {p.ownerLabel}.</p>
    <p className="whitespace-pre-wrap text-sm leading-7">Collection terms: {p.collectionTerms}</p>
    {p.decidedByLabel && <p className="text-sm">Readiness decision by: {p.decidedByLabel}.</p>}
    {p.sourceCurrent === false && <p role="status" className="text-sm">The source observation changed. Approval and issue are unavailable.</p>}
    {!p.ownerCurrent && <p role="status" className="text-sm">The recorded owner is no longer eligible.</p>}
    {invoice.status === "ready" && !p.reviewerCurrent && <p role="status" className="text-sm">The readiness reviewer is no longer eligible.</p>}
    {p.state === "rejected" && <p role="status" className="text-sm">Readiness was rejected. Prepare a replacement proposal before issue.</p>}
    {!canDecide && !p.canIssue && <p role="status" className="text-sm">No readiness decision or issue action is available for this account.</p>}
    <div className="space-y-5" aria-label="Exact invoice supporting originals">{p.supportingOriginals.map(original =>
      <InvoiceOriginalDownload key={`${p.preparationId}/${original.versionId}/${original.document.revision}`} detail={detail} original={original}
        locked={request.locked} onAccessReady={id => {
          if (!request.locked) { setAccess(values => ({ ...values, [`${p.preparationId}/${original.versionId}/${original.document.revision}`]: id })); setReviewed(false); }
        }} />)}</div>
    {canDecide && <form className="space-y-5" onSubmit={event => {
      event.preventDefault(); if (request.locked || !hasAccess || !reviewed || action === "approve_invoice" && !p.canApprove
        || action === "reject_invoice" && !p.canReject) return;
      const fields = new FormData(event.currentTarget);
      request.submit({ ...target(), action, contentsReviewed: true, reviewedSources, reason: String(fields.get("reason") ?? ""),
        reviewReference: String(fields.get("reviewReference") ?? "") });
    }}><fieldset disabled={request.locked} className="space-y-4">
      <p className="text-sm leading-7">A different authorized account must review this proposal and each exact original.</p>
      <label className="block space-y-2 text-sm" htmlFor={`${prefix}-decision`}><span>Readiness decision</span>
        <select id={`${prefix}-decision`} value={action} onChange={event => setSelection(event.target.value)} className="min-h-11 w-full rounded-md border p-3">
          {p.canApprove && <option value="approve_invoice">Approve invoice readiness</option>}{p.canReject && <option value="reject_invoice">Reject invoice readiness</option>}
        </select></label>
      <label className="flex min-h-11 items-start gap-3 text-sm leading-7"><input type="checkbox" checked={reviewed} disabled={!hasAccess}
        onChange={event => setReviewed(event.target.checked)} className="mt-2 size-5 shrink-0" /><span>I opened each exact original and reviewed this invoice proposal.</span></label>
      <label className="block space-y-2 text-sm" htmlFor={`${prefix}-reference`}><span>Readiness review reference</span>
        <input id={`${prefix}-reference`} name="reviewReference" required maxLength={500} className="min-h-11 w-full rounded-md border p-3" /></label>
      <CommercialReasonField id={`${prefix}-reason`} /><Button type="submit" className="min-h-11 transition-colors" disabled={!hasAccess || !reviewed}>Record readiness decision</Button>
    </fieldset></form>}
    {p.canIssue && <form className="space-y-4" onSubmit={event => {
      event.preventDefault(); if (request.locked || !p.canIssue) return;
      request.submit({ ...target(), action: "issue_invoice", reason: String(new FormData(event.currentTarget).get("reason") ?? "") });
    }}><fieldset disabled={request.locked} className="space-y-4">
      <p className="text-sm leading-7">Issue records this full invoice. It does not send the invoice or record a payment.</p>
      <CommercialReasonField id={`${prefix}-issue-reason`} /><Button type="submit" className="min-h-11 transition-colors">Issue the approved invoice</Button>
    </fieldset></form>}
  </section>;
}
