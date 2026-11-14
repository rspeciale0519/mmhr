"use client";
import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { z } from "zod";
import { managedInvoiceDetailRequestSchema, verifyManagedInvoiceDetail } from "@/lib/managed-invoice";
import { Button } from "@/components/ui/button";
import { CommercialFinanceReadFailure } from "@/components/workflow/commercial-finance-original-choices";
import { commercialAmount, commercialTime } from "@/components/workflow/commercial-finance-fields";
import { ManagedInvoicePreparation, type ManagedInvoiceOwnerReader, type ManagedInvoiceSourceReader } from "./managed-invoice-preparation";
import { ManagedInvoiceDecisions } from "./managed-invoice-decisions";
import { ManagedInvoiceRequestStatus, useManagedInvoiceCommand, type ManagedInvoiceExecutor } from "./use-managed-invoice-command";
export type ManagedInvoiceClient = { detail: (input: z.output<typeof managedInvoiceDetailRequestSchema>) => Promise<unknown>;
  owners: ManagedInvoiceOwnerReader; source: ManagedInvoiceSourceReader; execute: ManagedInvoiceExecutor };
export type ManagedInvoiceWorkspaceProps = { request: z.output<typeof managedInvoiceDetailRequestSchema>; actorIdentityId: string;
  workspaceLabel: string; workspaceType: "internal" | "customer" | "vendor"; initialData?: unknown; api: ManagedInvoiceClient };
export function ManagedInvoiceWorkspace({ request: initialRequest, actorIdentityId, workspaceLabel, workspaceType, initialData, api }: ManagedInvoiceWorkspaceProps) {
  const [afterPreparationId, setAfter] = useState<string | undefined>(initialRequest.afterPreparationId);
  const request = managedInvoiceDetailRequestSchema.parse({ ...initialRequest, afterPreparationId });
  const query = useQuery({ queryKey: ["managedInvoiceDetail", request], enabled: workspaceType === "customer", retry: false,
    queryFn: async () => verifyManagedInvoiceDetail(await api.detail(request), request, actorIdentityId),
    initialData: initialData && afterPreparationId === initialRequest.afterPreparationId ? verifyManagedInvoiceDetail(initialData, request, actorIdentityId) : undefined });
  // The request lives above all read states. Refetch failures cannot discard an uncertain command.
  const command = useManagedInvoiceCommand(api.execute, async () => {
    const result = await query.refetch(); if (result.isError) throw new Error("Invoice refresh failed");
  });
  const formKey = query.data ? `${query.data.organizationId}/${query.data.commissionEventId}/${actorIdentityId}/${query.data.eventRevision}/${query.data.invoice?.invoiceId ?? "new"}/${query.data.currentPreparation?.preparationId ?? "none"}/${query.data.currentPreparation?.revision ?? 0}/${query.data.invoice?.invoiceRevision ?? 0}` : "loading";
  if (workspaceType !== "customer") return <p role="alert">Select the customer finance workspace before opening this invoice.</p>;
  return <main className="mx-auto w-full max-w-5xl space-y-8 px-4 py-8 sm:px-6">
    <header className="space-y-3 [overflow-wrap:anywhere]"><h1 className="text-balance text-3xl font-semibold">Invoice readiness</h1>
      <p className="text-sm">Selected customer workspace: {workspaceLabel}.</p>
      <p className="max-w-prose text-sm leading-7">Prepare one full invoice from approved commission sources. A different authorized account must approve its readiness.</p>
      <nav className="flex flex-wrap gap-4 text-sm" aria-label="Finance views"><Link className="inline-flex min-h-11 items-center underline"
        href="/admin/finance/commercial?view=calculations">Commission calculations</Link><Link className="inline-flex min-h-11 items-center underline"
        href="/admin/finance/documents">Finance documents</Link><Link className="inline-flex min-h-11 items-center underline" href="/workspaces">Select workspace</Link></nav>
    </header>
    <ManagedInvoiceRequestStatus request={command} />
    {query.isPending ? <p role="status">Loading the stored invoice record.</p> : query.isError ?
      <CommercialFinanceReadFailure error={query.error} reload={() => void query.refetch()} /> : <>
      {query.data.invoice ? <section className="space-y-4 rounded-lg border p-5 [overflow-wrap:anywhere]" aria-label="Stored invoice">
        <h2 className="text-xl font-semibold">{query.data.invoice.invoiceNumber}</h2><p className="text-sm">Stored invoice status: {query.data.invoice.status}.</p>
        <p className="text-sm tabular-nums">Amount: {commercialAmount(query.data.invoice.amountMinorUnits, query.data.invoice.currency)} {query.data.invoice.currency}.</p>
        <dl className="grid gap-4 text-sm sm:grid-cols-2"><div><dt className="font-medium">Issue date</dt><dd>{commercialTime(query.data.invoice.issueDate)}</dd></div>
          <div><dt className="font-medium">Due date</dt><dd>{commercialTime(query.data.invoice.dueDate)}</dd></div></dl>
      </section> : <p role="status">No invoice is recorded for this commission event.</p>}
      {query.data.calculationId && <Link className="inline-flex min-h-11 items-center text-sm underline"
        href={`/admin/finance/commercial?view=calculation&entityId=${query.data.calculationId}`}>Open the exact approved commission calculation</Link>}
      <ManagedInvoicePreparation key={`preparation/${formKey}`} detail={query.data} owners={api.owners} source={api.source} request={command} />
      <ManagedInvoiceDecisions key={`decisions/${formKey}`} detail={query.data} request={command} />
      <section className="space-y-4" aria-label="Preserved invoice proposals"><h2 className="text-xl font-semibold">Preserved invoice proposals</h2>
        {query.data.preparations.length === 0 ? <p role="status">No proposals are recorded on this page.</p> : <ul className="space-y-3">
          {query.data.preparations.map(preparation => <li key={preparation.preparationId} className="space-y-2 rounded-lg border p-4 text-sm [overflow-wrap:anywhere]">
            <p>{preparation.state === "pending" ? "Waiting for independent decision" : preparation.state === "approved" ? "Readiness approved" : "Readiness rejected"}.</p>
            <p>Prepared by: {preparation.preparedByLabel}. {commercialTime(preparation.preparedAt)}</p>
            <p className="tabular-nums">Invoice revision after preparation: {preparation.invoiceRevisionAfterPrepare}.</p></li>)}</ul>}
        <nav className="flex flex-wrap gap-3" aria-label="Invoice proposal pages">
          {afterPreparationId && <Button type="button" variant="outline" className="min-h-11" disabled={command.locked} onClick={() => setAfter(undefined)}>First proposal page</Button>}
          {query.data.nextPreparationCursor && <Button type="button" variant="outline" className="min-h-11" disabled={command.locked}
            onClick={() => setAfter(query.data.nextPreparationCursor ?? undefined)}>Next proposal page</Button>}
        </nav>
      </section>
    </>}
  </main>;
}
