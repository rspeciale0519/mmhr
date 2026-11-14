"use client";
import { useRef, useState } from "react";
import { managedInvoiceCommandSchema, verifyManagedInvoiceResult } from "@/lib/managed-invoice";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { financeFailure, type FinanceFailure } from "@/components/workflow/finance-document-feedback";

export type ManagedInvoiceCommand = z.output<typeof managedInvoiceCommandSchema>;
export type ManagedInvoiceExecutor = (input: ManagedInvoiceCommand) => Promise<unknown>;
export function useManagedInvoiceCommand(execute: ManagedInvoiceExecutor, recorded: () => Promise<unknown>) {
  const attempt = useRef<ManagedInvoiceCommand | null>(null), busy = useRef(false);
  const [pending, setPending] = useState(false), [locked, setLocked] = useState(false);
  const [failure, setFailure] = useState<FinanceFailure | null>(null);
  const [result, setResult] = useState<ReturnType<typeof verifyManagedInvoiceResult> | null>(null);
  const [refreshFailed, setRefreshFailed] = useState(false);
  async function send(input: ManagedInvoiceCommand) {
    if (busy.current) return;
    busy.current = true; setPending(true); setFailure(null);
    try {
      setResult(verifyManagedInvoiceResult(await execute(input), input));
      try { await recorded(); } catch { setRefreshFailed(true); }
    } catch (error) {
      const next = financeFailure(error);
      if (next === "invalid") { attempt.current = null; setLocked(false); }
      setFailure(next);
    } finally { busy.current = false; setPending(false); }
  }
  return { pending, locked, failure, result, refreshFailed,
    invalid: () => setFailure("invalid"),
    submit(value: unknown) {
      if (busy.current || attempt.current || result) return;
      const input = managedInvoiceCommandSchema.safeParse(value);
      if (!input.success) { setFailure("invalid"); return; }
      // Zod copies the full request. Subsequent form edits and reads cannot change this attempt.
      attempt.current = input.data; setLocked(true); void send(input.data);
    },
    retry() { if (failure === "unknown" && attempt.current) void send(attempt.current); },
  };
}
export type ManagedInvoiceRequest = ReturnType<typeof useManagedInvoiceCommand>;
export function ManagedInvoiceRequestStatus({ request }: { request: ManagedInvoiceRequest }) {
  const messages: Record<FinanceFailure, string> = {
    invalid: "The request fields are invalid. Check the fields before another request.",
    denied: "This action is unavailable for this account. Reload the authorized invoice record.",
    stale: "The invoice or its sources changed. Reload the record before another request.",
    unknown: "The response is unknown. Retry the unchanged request, or reload to check the stored record.",
  };
  return <section className="space-y-3 text-sm leading-7" aria-label="Invoice request result">
    {request.pending && <p role="status">Recording the invoice request.</p>}
    {request.result && <p role="status">The original request result is recorded: {request.result.status}.
      {request.result.outcomeCode === "replayed" ? " The same request returned its original result." : ""} Reload before another action.</p>}
    {request.refreshFailed && <p role="status">The current record could not refresh. The original request result remains recorded.</p>}
    {request.failure && <p role="alert">{messages[request.failure]}</p>}
    {(request.failure || request.result) && <div className="flex flex-wrap gap-3">
      {request.failure === "unknown" && <Button type="button" className="min-h-11 transition-colors" disabled={request.pending}
        onClick={request.retry}>Retry unchanged request</Button>}
      <Button type="button" variant="outline" className="min-h-11 transition-colors" disabled={request.pending}
        onClick={() => window.location.reload()}>Reload invoice record</Button>
    </div>}
  </section>;
}
