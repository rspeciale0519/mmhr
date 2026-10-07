"use client";
import { useId, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import { auditSearchFromForm, verifyStaffAuditPage, type StaffAuditPage, type StaffAuditSearch as Search } from "@/lib/staff-audit";
import { Button } from "@/components/ui/button";

const field = "min-h-11 w-full rounded-md border bg-background px-3 py-2 text-sm";
export function StaffAuditSearch({ organizationId, initialPage }: { organizationId: string | null; initialPage: StaffAuditPage }) {
  const trpc = useTRPC(), prefix = useId();
  const mutation = useMutation(trpc.audit.search.mutationOptions({ retry: false, gcTime: 0 }));
  const [page, setPage] = useState<StaffAuditPage | null>(() => verifyStaffAuditPage(initialPage, { organizationId, limit: 25 }));
  const [actorType, setActorType] = useState(""), [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const active = useRef<Search>({ organizationId, limit: 25 }), pending = useRef(false);
  async function read(input: Search) {
    if (pending.current) return;
    pending.current = true; setBusy(true); setPage(null); setMessage("");
    try {
      const response = await mutation.mutateAsync(input);
      setPage(verifyStaffAuditPage(response, input)); active.current = input;
    } catch { setMessage("Audit search is unavailable. Check your access and try again."); }
    finally { mutation.reset(); pending.current = false; setBusy(false); }
  }
  return <section className="space-y-6">
    <form onSubmit={event => {
      event.preventDefault(); if (pending.current) return;
      try { const input = auditSearchFromForm(new FormData(event.currentTarget), organizationId); void read(input); }
      catch { setPage(null); setMessage("Check the actor, event fields, and UTC date range."); }
    }} className="space-y-4 rounded-lg border p-5">
      <h2 className="text-xl font-semibold">Search events</h2>
      <p className="text-sm">Enter exact recorded values. Private actor details and saved change values are not shown.</p>
      <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
        <label htmlFor={`${prefix}-actorType`} className="space-y-2"><span>Actor type</span>
          <select id={`${prefix}-actorType`} name="actorType" className={field} value={actorType} onChange={event => setActorType(event.target.value)}>
            <option value="">All actors</option><option value="user">User</option><option value="worker">Worker</option>
            <option value="system">System</option><option value="migration">Migration</option>
          </select></label>
        {actorType === "user" && <label htmlFor={`${prefix}-actorIdentityId`} className="space-y-2"><span>Recorded user identity ID</span>
          <input id={`${prefix}-actorIdentityId`} name="actorIdentityId" className={field} maxLength={36} required autoComplete="off"/></label>}
        {actorType && actorType !== "user" && <div className="space-y-2">
          <label htmlFor={`${prefix}-actorReference`} className="space-y-2"><span>Known actor reference (optional)</span>
            <input key={actorType} id={`${prefix}-actorReference`} name="actorReference" className={field} maxLength={500} autoComplete="off"
              aria-describedby={`${prefix}-actorReference-help`}/></label>
          <span id={`${prefix}-actorReference-help`} className="block text-sm">Leave this field empty to search all actors of this type.</span>
        </div>}
        {([ ["entityType", "Entity type", 100], ["entityId", "Entity ID", 256], ["action", "Action", 100] ] as const).map(([name, label, max]) =>
          <label key={name} htmlFor={`${prefix}-${name}`} className="space-y-2"><span>{label}</span>
            <input id={`${prefix}-${name}`} name={name} className={field} maxLength={max} autoComplete="off"/></label>)}
        {([ ["occurredFrom", "From (UTC)"], ["occurredTo", "To (UTC)"] ] as const).map(([name, label]) =>
          <label key={name} htmlFor={`${prefix}-${name}`} className="space-y-2"><span>{label}</span>
            <input id={`${prefix}-${name}`} name={name} type="datetime-local" step="1" className={field}/></label>)}
        <label htmlFor={`${prefix}-limit`} className="space-y-2"><span>Events per page</span>
          <select id={`${prefix}-limit`} name="limit" className={field} defaultValue="25"><option>25</option><option>50</option><option>100</option></select></label>
        <Button type="submit" className="min-h-11">Search audit events</Button>
      </fieldset>
    </form>
    {busy && <p role="status">Loading audit events…</p>}
    {message && <p role="alert">{message}</p>}
    {page && <div className="space-y-4">
      <p className="text-sm">Newest events appear first. Each page checks your current access. New events can change later results.</p>
      {page.rows.length === 0 ? <p role="status">No audit events match this search.</p> : <ol className="divide-y">
        {page.rows.map(row => <li key={row.id} className="space-y-2 py-4 [overflow-wrap:anywhere]">
          <p className="font-medium">{row.action}</p><p>{row.entityType} · {row.entityId}</p>
          <time className="tabular-nums" dateTime={row.occurredAt}>{row.occurredAt.replace("T", " ").replace("Z", " UTC")}</time>
          <p className="text-sm">Event ID: {row.id}</p>
        </li>)}</ol>}
      {page.nextCursor && <Button type="button" className="min-h-11" disabled={busy} onClick={() => {
        if (page.nextCursor) void read({ ...active.current, after: page.nextCursor });
      }}>Next audit page</Button>}
    </div>}
  </section>;
}
