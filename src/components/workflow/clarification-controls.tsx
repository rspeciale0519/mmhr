"use client";

import { useMutation } from "@tanstack/react-query";
import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useTRPC } from "@/lib/trpc/client";
import { portalClarificationCommandSchema, type PortalClarificationCommand, type PortalClarificationPage } from "@/lib/portal-clarification";
import { ClarificationList } from "./clarification-list";

type Item = PortalClarificationPage["items"][number];
const fieldClass = "w-full rounded-md border bg-background p-3 text-sm leading-6 [overflow-wrap:anywhere]";

export function VendorClarifications({ organizationId, items }: { organizationId: string; items: Item[] }) {
  return <ClarificationList items={items}>{(item) => <ClarificationReply organizationId={organizationId} item={item}
    latestNormalizationId={item.latestNormalizationId} latestRevision={item.latestRevision} />}</ClarificationList>;
}
export function StaffClarifications({ organizationId, items }: { organizationId: string; items: Item[] }) {
  return <ClarificationList items={items}>{(item) => <ClarificationDecision organizationId={organizationId} item={item} />}</ClarificationList>;
}

function useClarificationAction() {
  const trpc = useTRPC(), router = useRouter();
  const ask = useMutation(trpc.clarifications.ask.mutationOptions({ retry: false }));
  const reply = useMutation(trpc.clarifications.reply.mutationOptions({ retry: false }));
  const decide = useMutation(trpc.clarifications.decide.mutationOptions({ retry: false }));
  const [locked, setLocked] = useState(false), [complete, setComplete] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const attempt = useRef<PortalClarificationCommand | null>(null), sending = useRef(false);
  async function send(input: PortalClarificationCommand) {
    if (sending.current || complete) return;
    sending.current = true;
    setLocked(true);
    setMessage(null);
    try {
      if (input.action === "ask") await ask.mutateAsync(input);
      else if (input.action === "reply") await reply.mutateAsync(input);
      else await decide.mutateAsync(input);
      setComplete(true);
      setMessage(input.action === "ask" ? "Your question is saved in the vendor portal."
        : input.action === "reply" ? "Your answer is saved for staff review. It does not approve a response."
        : "Your decision is saved. Response approval remains a separate step.");
      try { router.refresh(); } catch { setMessage("Your action is saved. Reload this page to read its status."); }
    } catch { setMessage("We could not confirm this action. Retry the unchanged request or reload this page."); }
    finally { sending.current = false; }
  }
  function begin(input: Record<string, unknown>) {
    if (locked || sending.current || complete) return;
    if (typeof crypto.randomUUID !== "function") { setMessage("Use a secure connection to save this action."); return; }
    const parsed = portalClarificationCommandSchema.safeParse({ ...input, correlationId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID() });
    if (!parsed.success) { setMessage("Check the fields. Shorten long text and enter a valid deadline."); return; }
    if (parsed.data.action === "ask" && (Date.parse(parsed.data.deadlineAt) <= Date.now()
      || Date.parse(parsed.data.deadlineAt) > Date.now() + 365 * 86400000)) {
      setMessage("Choose a future reply deadline within one year."); return;
    }
    attempt.current = parsed.data;
    void send(parsed.data);
  }
  return { begin, locked, complete, message, pending: ask.isPending || reply.isPending || decide.isPending,
    retry: () => { if (attempt.current) void send(attempt.current); } };
}

function ActionStatus({ action }: { action: ReturnType<typeof useClarificationAction> }) {
  return <div className="space-y-3">
    {action.message && <p className="text-sm leading-7" role={action.complete ? "status" : "alert"}>{action.message}</p>}
    {action.locked && !action.complete && <div className="flex flex-wrap gap-3">
      <Button type="button" className="min-h-11" disabled={action.pending} onClick={action.retry}>{action.pending ? "Saving…" : "Retry unchanged request"}</Button>
      <Button type="button" className="min-h-11" variant="outline" onClick={() => window.location.reload()}>Reload page</Button>
    </div>}
  </div>;
}

export function ClarificationQuestion({ organizationId, recipientId, normalizationId }: {
  organizationId: string; recipientId: string; normalizationId: string;
}) {
  const action = useClarificationAction(), id = useId();
  return <details className="border-t pt-3">
    <summary className="flex min-h-11 cursor-pointer items-center text-sm underline">Ask vendor to clarify</summary>
    <form className="mt-3 space-y-4" onSubmit={(event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget), deadline = new Date(String(data.get("deadline")));
      action.begin({ action: "ask", organizationId, recipientId, normalizationId, question: data.get("question"),
        deadlineAt: Number.isNaN(deadline.getTime()) ? "invalid" : deadline.toISOString() });
    }}>
      {!action.complete && <fieldset disabled={action.locked} className="space-y-4">
        <div className="space-y-2"><label className="block text-sm font-medium" htmlFor={`${id}-question`}>Question for vendor</label>
          <textarea id={`${id}-question`} name="question" className={fieldClass} rows={3} required maxLength={5000} /></div>
        <div className="space-y-2"><label className="block text-sm font-medium" htmlFor={`${id}-deadline`}>Reply deadline in your local time</label>
          <input id={`${id}-deadline`} name="deadline" className={fieldClass} type="datetime-local" required /></div>
        <p className="text-sm leading-6 text-muted-foreground">The question stays linked to this response. A different staff member must decide whether the answer resolves it.</p>
        <Button type="submit" className="min-h-11">Send question to vendor portal</Button>
      </fieldset>}
      <ActionStatus action={action} />
    </form>
  </details>;
}

export function ClarificationReply({ organizationId, item, latestNormalizationId, latestRevision }: {
  organizationId: string; item: Item; latestNormalizationId: string | null; latestRevision: number;
}) {
  const action = useClarificationAction(), id = useId();
  const [changed, setChanged] = useState(false), [confirmed, setConfirmed] = useState(false);
  if (!item.canReply) return null;
  const hasRevision = latestNormalizationId !== null && latestRevision > item.revision;
  return <form className="space-y-4 border-t pt-5" onSubmit={(event) => {
    event.preventDefault();
    if (!confirmed || (changed && !hasRevision)) return;
    const data = new FormData(event.currentTarget);
    action.begin({ action: "reply", organizationId, clarificationId: item.clarificationId,
      answer: data.get("answer"), changeSummary: data.get("changeSummary"), replyNormalizationId: changed ? latestNormalizationId : null });
  }}>
    {!action.complete && <fieldset disabled={action.locked} className="space-y-4">
      <div className="space-y-2"><label className="block text-sm font-medium" htmlFor={`${id}-answer`}>Your answer</label>
        <textarea id={`${id}-answer`} name="answer" className={fieldClass} required maxLength={5000} rows={3} /></div>
      <div className="space-y-2"><label className="block text-sm font-medium" htmlFor={`${id}-changes`}>What changed in your response?</label>
        <textarea id={`${id}-changes`} name="changeSummary" className={fieldClass} required maxLength={2000} rows={2} placeholder="Explain the change, or state that no change is required." /></div>
      <label className="flex min-h-11 items-start gap-3 text-sm leading-6">
        <input type="checkbox" className="mt-1 size-4" checked={changed} onChange={(event) => setChanged(event.target.checked)} />
        <span>This answer uses my newer saved response{hasRevision ? ` ${latestRevision}` : ""}.</span>
      </label>
      {changed && !hasRevision && <p className="text-sm" role="alert">Submit a new response above, then reload this page before you link its revision.</p>}
      <label className="flex min-h-11 items-start gap-3 text-sm leading-6">
        <input type="checkbox" className="mt-1 size-4" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
        <span>I checked this answer and its stated changes.</span>
      </label>
      <Button type="submit" className="min-h-11" disabled={!confirmed || (changed && !hasRevision)}>Submit clarification answer</Button>
    </fieldset>}
    <ActionStatus action={action} />
  </form>;
}

export function ClarificationDecision({ organizationId, item }: { organizationId: string; item: Item }) {
  const action = useClarificationAction(), id = useId();
  const [confirmed, setConfirmed] = useState(false);
  if (!item.canDecide) return item.status === "answered" && item.decision === "pending"
    ? <p className="text-sm">A different staff member must record the decision.</p> : null;
  return <form className="space-y-4 border-t pt-5" onSubmit={(event) => {
    event.preventDefault();
    if (!confirmed) return;
    const data = new FormData(event.currentTarget);
    action.begin({ action: "decide", organizationId, clarificationId: item.clarificationId,
      decision: data.get("decision"), reason: data.get("reason") });
  }}>
    {!action.complete && <fieldset disabled={action.locked} className="space-y-4">
      <div className="space-y-2"><label className="block text-sm font-medium" htmlFor={`${id}-decision`}>Decision</label>
        <select id={`${id}-decision`} name="decision" className={fieldClass} required>
          <option value="accepted">Accept answer</option><option value="rejected">Reject answer</option><option value="deferred">Defer decision</option>
        </select></div>
      <div className="space-y-2"><label className="block text-sm font-medium" htmlFor={`${id}-reason`}>Decision reason</label>
        <textarea id={`${id}-reason`} name="reason" className={fieldClass} required maxLength={2000} rows={2} /></div>
      <label className="flex min-h-11 items-start gap-3 text-sm leading-6">
        <input type="checkbox" className="mt-1 size-4" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
        <span>I checked the vendor answer and any linked response revision.</span>
      </label>
      <p className="text-sm leading-6 text-muted-foreground">The customer can read an accepted answer only after the related response receives separate approval.</p>
      <Button type="submit" className="min-h-11" disabled={!confirmed}>Record clarification decision</Button>
    </fieldset>}
    <ActionStatus action={action} />
  </form>;
}
