"use client";
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { WorkflowFieldError, commandFailure, commandIds } from "@/components/workflow-command";
import type { EvaluationDisclosureReview } from "@/server/commands/evaluation-disclosure";
import { DisclosureFields, disclosureInvalidMessage, readDisclosureFields } from "./disclosure-fields";

type Item = EvaluationDisclosureReview["items"][number];
type Status = "waiting" | "pending" | "done" | "invalid" | "rejected" | "unknown";
export type DisclosureRequest = {
  organizationId: string; intakeId: string; candidateId: string; expectedReviewDigest: string;
  discussionAt: string; discussionReference: string; conflictDisclosure: string; reason: string;
  correlationId: string; idempotencyKey: string;
};

const statusText: Record<Status, string> = {
  waiting: "Waiting", pending: "Recording…", done: "Disclosure recorded",
  invalid: "Not recorded. The server did not accept the fields.",
  rejected: "Not recorded. The server refused it. Reload the page to check its review.",
  unknown: "Result unknown. Retry the same request.",
};

/** An option with no recorded disclosure. A changed review after an earlier disclosure uses the single-option form. */
export function needsDisclosure(item: Item) {
  return item.canDisclose && item.reviewDigest !== null && item.lastDisclosureAt === null;
}

/**
 * Records one disclosure event per option with the shared fields. Each option keeps its own
 * request, so a retry resends the unchanged request and cannot record a second event.
 */
export function DisclosureBatch({ review, execute }: {
  review: EvaluationDisclosureReview; execute: (input: DisclosureRequest) => Promise<unknown>;
}) {
  const router = useRouter();
  const active = useRef(false);
  const requests = useRef(new Map<string, DisclosureRequest>());
  const [targets, setTargets] = useState<Item[] | null>(null);
  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState("");
  const [message, setMessage] = useState<{ text: string; alert: boolean } | null>(null);

  const shown = targets ?? review.items.filter(needsDisclosure);
  const ids = (status: Status) => shown.filter((item) => statuses[item.candidateId] === status).map((item) => item.candidateId);
  const unknown = ids("unknown"), invalid = ids("invalid");
  const finished = targets !== null && unknown.length === 0 && invalid.length === 0;
  const editable = !running && (targets === null || (invalid.length > 0 && unknown.length === 0));

  if (targets === null && shown.length === 0) {
    return review.items.some((item) => item.canDisclose)
      ? <p role="status" className="text-sm leading-6">Every selected option on this page has a recorded disclosure. To record one again after a review change, use the form for that option.</p>
      : null;
  }

  function build(list: Item[], data: FormData) {
    const fields = readDisclosureFields(data);
    for (const item of list) requests.current.set(item.candidateId, { organizationId: review.organizationId,
      intakeId: review.intakeId, candidateId: item.candidateId, expectedReviewDigest: item.reviewDigest!, ...fields, ...commandIds() });
  }

  async function run(list: Item[], current: Record<string, Status>) {
    const next = { ...current };
    let recorded = false;
    for (const [index, item] of list.entries()) {
      setProgress(`Recording disclosure ${index + 1} of ${list.length}: ${item.maskedLabel}`);
      next[item.candidateId] = "pending"; setStatuses({ ...next });
      try {
        await execute(requests.current.get(item.candidateId)!);
        next[item.candidateId] = "done"; recorded = true;
      } catch (error) {
        const failure = commandFailure(error);
        next[item.candidateId] = failure === "invalid" ? "invalid" : failure === "rejected" ? "rejected" : "unknown";
      }
      setStatuses({ ...next });
    }
    setProgress("");
    const all = targets ?? list;
    const done = all.filter((item) => next[item.candidateId] === "done");
    if (done.length === all.length) {
      setMessage({ text: `Disclosure recorded for all ${all.length} option${all.length === 1 ? "" : "s"}.`, alert: false });
    } else {
      const missing = all.filter((item) => next[item.candidateId] !== "done").map((item) => item.maskedLabel).join(", ");
      const hint = Object.values(next).includes("unknown") ? " Retry the options with an unknown result. The retry sends the same requests."
        : Object.values(next).includes("invalid") ? ` ${disclosureInvalidMessage}` : " Reload the page to check the current review.";
      setMessage({ text: `Disclosure recorded for ${done.length} of ${all.length} options. Not recorded: ${missing}.${hint}`, alert: true });
    }
    if (recorded) router.refresh();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (active.current || finished) return;
    let list: Item[];
    if (unknown.length > 0) list = shown.filter((item) => unknown.includes(item.candidateId));
    else {
      list = targets === null ? shown : shown.filter((item) => invalid.includes(item.candidateId));
      try { build(list, new FormData(event.currentTarget)); }
      catch (error) {
        setMessage({ text: error instanceof WorkflowFieldError ? error.message : "Check the required fields and try again.", alert: true });
        return;
      }
    }
    active.current = true; setRunning(true); setMessage(null);
    if (targets === null) setTargets(shown);
    const current = { ...statuses };
    for (const item of list) current[item.candidateId] = "waiting";
    try { await run(list, current); } finally { active.current = false; setRunning(false); }
  }

  const label = running ? "Recording…" : unknown.length > 0 ? "Retry options with unknown result"
    : invalid.length > 0 ? "Record disclosure for remaining options"
    : `Record disclosure for ${shown.length} option${shown.length === 1 ? "" : "s"}`;
  return <article className="space-y-4 rounded-lg border p-5" aria-labelledby="disclosure-batch-heading">
    <div><h3 id="disclosure-batch-heading" className="text-lg font-semibold">Record one discussion for all options</h3>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">Use this form when one customer discussion covered every option below. Each option still gets its own disclosure record.</p></div>
    <ul className="divide-y rounded-md border" aria-label="Options in this disclosure">
      {shown.map((item) => <li key={item.candidateId} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3 text-sm">
        <span><span className="text-muted-foreground">{item.maskedLabel}</span> <span className="font-medium">{item.providerName} · {item.productName}</span></span>
        {statuses[item.candidateId] && <span>{statusText[statuses[item.candidateId]]}</span>}
      </li>)}
    </ul>
    <form onSubmit={submit} className="space-y-4">
      <fieldset disabled={!editable} className="space-y-4">
        <DisclosureFields/>
        <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" required/>I completed the customer discussion and reviewed the provider details for every option listed.</label>
      </fieldset>
      <p role="status" className="text-sm leading-6">{progress}</p>
      {message && <p role={message.alert ? "alert" : "status"} className="text-sm leading-6">{message.text}</p>}
      <div className="flex flex-wrap gap-3">
        {!finished && <Button type="submit" disabled={running} className="min-h-11">{label}</Button>}
        {targets !== null && !running && shown.some((item) => statuses[item.candidateId] !== "done") &&
          <Button type="button" variant="outline" className="min-h-11" onClick={() => window.location.reload()}>Reload saved state</Button>}
      </div>
    </form>
  </article>;
}
