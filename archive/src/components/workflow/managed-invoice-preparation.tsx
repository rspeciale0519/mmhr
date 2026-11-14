"use client";
import { useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { z } from "zod";
import { managedInvoiceOwnerRequestSchema, managedInvoiceSourceRequestSchema, verifyManagedInvoiceOwners,
  verifyManagedInvoiceSource, type managedInvoiceDetailSchema } from "@/lib/managed-invoice";
import { Button } from "@/components/ui/button";
import { CommercialFinanceReadFailure } from "@/components/workflow/commercial-finance-original-choices";
import { commercialAmount, commercialInstant } from "@/components/workflow/commercial-finance-fields";
import { CommercialReasonField } from "@/components/workflow/commercial-finance-preparation";
import type { ManagedInvoiceRequest } from "./use-managed-invoice-command";
export type ManagedInvoiceDetail = z.output<typeof managedInvoiceDetailSchema>;
export type ManagedInvoiceOwnerReader = (input: z.output<typeof managedInvoiceOwnerRequestSchema>) => Promise<unknown>;
export type ManagedInvoiceSourceReader = (input: z.output<typeof managedInvoiceSourceRequestSchema>) => Promise<unknown>;
export function ManagedInvoicePreparation({ detail, owners, source, request }: { detail: ManagedInvoiceDetail;
  owners: ManagedInvoiceOwnerReader; source: ManagedInvoiceSourceReader; request: ManagedInvoiceRequest }) {
  const prefix = useId(), [afterId, setAfter] = useState<string | undefined>(), [ownerId, setOwner] = useState("");
  const [correlationId] = useState(() => crypto.randomUUID());
  const ownerInput = managedInvoiceOwnerRequestSchema.parse({ organizationId: detail.organizationId, commissionEventId: detail.commissionEventId,
    correlationId, ...(afterId ? { afterId } : {}) });
  const sourceInput = detail.calculationId ? managedInvoiceSourceRequestSchema.safeParse({ organizationId: detail.organizationId,
    commissionEventId: detail.commissionEventId, calculationId: detail.calculationId, supportingSources: detail.mandatorySources, correlationId }) : null;
  const eligible = detail.eventState === "approved" && detail.invoice?.status !== "issued" && sourceInput?.success === true;
  const ownerQuery = useQuery({ queryKey: ["managedInvoiceOwners", ownerInput], enabled: eligible,
    queryFn: async () => verifyManagedInvoiceOwners(await owners(ownerInput), ownerInput), retry: false });
  const sourceQuery = useQuery({ queryKey: ["managedInvoiceSource", sourceInput?.success ? sourceInput.data : null], enabled: eligible,
    queryFn: async () => {
      if (!sourceInput?.success) throw new Error("Invoice source is unavailable");
      return verifyManagedInvoiceSource(await source(sourceInput.data), sourceInput.data);
    }, retry: false });
  if (!eligible) return <p role="status" className="text-sm">{detail.invoice?.status === "issued" ? "The invoice is issued. Another proposal is unavailable."
    : "Invoice preparation needs an approved event and a known approved calculation."}</p>;
  if (ownerQuery.isPending || sourceQuery.isPending) return <p role="status">Loading current invoice sources and eligible owners.</p>;
  if (ownerQuery.isError || sourceQuery.isError) return <CommercialFinanceReadFailure error={ownerQuery.error ?? sourceQuery.error}
    reload={() => { void ownerQuery.refetch(); void sourceQuery.refetch(); }} />;
  const observation = sourceQuery.data, ownerPage = ownerQuery.data;
  function page(after?: string) { if (!request.locked) { setOwner(""); setAfter(after); } }
  return <section className="space-y-5 rounded-lg border p-5 [overflow-wrap:anywhere]" aria-label="Invoice preparation">
    <h2 className="text-xl font-semibold">{detail.invoice ? "Replace the unissued invoice proposal" : "Prepare the invoice"}</h2>
    <p className="text-sm leading-7">The invoice uses the full approved commission amount. The server checks its exact calculation and supporting originals.</p>
    {detail.invoice?.status === "ready" && <p role="status" className="text-sm">Replacement removes current readiness. The earlier approval remains in history.</p>}
    <p className="text-sm tabular-nums">Approved amount: {commercialAmount(observation.amountMinorUnits, observation.currency)} {observation.currency}.</p>
    {ownerPage.owners.length === 0 && <p role="status">No eligible owners are available on this page.</p>}
    <form className="space-y-4" onSubmit={event => {
      event.preventDefault(); if (request.locked || !ownerPage.owners.some(owner => owner.identityId === ownerId)) return;
      const fields = new FormData(event.currentTarget);
      try {
        request.submit({ organizationId: detail.organizationId, commissionEventId: detail.commissionEventId,
          action: "prepare_invoice", invoiceId: detail.invoice?.invoiceId ?? crypto.randomUUID(), preparationId: crypto.randomUUID(),
          calculationId: observation.calculationId, expectedEventRevision: observation.eventRevision,
          expectedInvoiceRevision: detail.invoice?.invoiceRevision ?? 0, expectedSourceDigest: observation.sourceDigest,
          supportingSources: observation.supportingSources, ownerIdentityId: ownerId, invoiceNumber: String(fields.get("invoiceNumber") ?? ""),
          issueDate: commercialInstant(String(fields.get("issueDate") ?? "")), dueDate: commercialInstant(String(fields.get("dueDate") ?? "")),
          collectionTerms: String(fields.get("collectionTerms") ?? ""), reason: String(fields.get("reason") ?? ""),
          correlationId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID() });
      } catch { request.invalid(); }
    }}><fieldset disabled={request.locked} className="space-y-4">
      <label className="block space-y-2 text-sm" htmlFor={`${prefix}-owner`}><span>Eligible invoice owner</span>
        <select id={`${prefix}-owner`} value={ownerId} onChange={event => setOwner(event.target.value)} required className="min-h-11 w-full rounded-md border p-3">
          <option value="">Choose an eligible staff member</option>{ownerPage.owners.map(owner => <option key={owner.identityId} value={owner.identityId}>{owner.label}</option>)}
        </select></label>
      <label className="block space-y-2 text-sm" htmlFor={`${prefix}-number`}><span>Invoice number</span><input id={`${prefix}-number`} name="invoiceNumber"
        required maxLength={100} defaultValue={detail.invoice?.invoiceNumber ?? ""} className="min-h-11 w-full rounded-md border p-3" /></label>
      <div className="grid gap-4 sm:grid-cols-2">{(["issueDate", "dueDate"] as const).map(name => <label key={name} className="block space-y-2 text-sm"
        htmlFor={`${prefix}-${name}`}><span>{name === "issueDate" ? "Issue date and time (UTC)" : "Due date and time (UTC)"}</span>
        <input id={`${prefix}-${name}`} name={name} required placeholder="2026-10-03T14:00:00" defaultValue={detail.invoice?.[name].replace(/Z$/, "") ?? ""}
          className="min-h-11 w-full rounded-md border p-3" /></label>)}</div>
      <label className="block space-y-2 text-sm" htmlFor={`${prefix}-terms`}><span>Collection terms</span><textarea id={`${prefix}-terms`} name="collectionTerms"
        required maxLength={500} defaultValue={detail.currentPreparation?.collectionTerms ?? ""} className="min-h-24 w-full rounded-md border p-3" /></label>
      <CommercialReasonField id={`${prefix}-reason`} /><Button type="submit" className="min-h-11 transition-colors" disabled={!ownerId}>Record invoice proposal</Button>
    </fieldset></form>
    <nav className="flex flex-wrap gap-3" aria-label="Eligible owner pages">
      {afterId && <Button variant="outline" className="min-h-11" disabled={request.locked} onClick={() => page()}>First owner page</Button>}
      {ownerPage.nextCursor && <Button variant="outline" className="min-h-11" disabled={request.locked} onClick={() => page(ownerPage.nextCursor ?? undefined)}>Next owner page</Button>}
    </nav>
  </section>;
}
