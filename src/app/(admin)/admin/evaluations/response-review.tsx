"use client";
import { useMutation } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useTRPC } from "@/lib/trpc/client";
import type { PortalResponsePage } from "@/server/commands/rfp-portal-response";
import { ResponseList } from "@/components/workflow/response-list";
import { ClarificationQuestion } from "@/components/workflow/clarification-controls";

type Item = PortalResponsePage["items"][number];
type Attempt = { organizationId: string; normalizationId: string; rfpId: string; version: number;
  action: "review" | "approve" | "reject"; correlationId: string; idempotencyKey: string; approvalReference: string };

export function StaffResponses({ organizationId, items }: { organizationId: string; items: Item[] }) {
  return <ResponseList items={items}>{(item) => <div className="space-y-5">
    <ResponseDecision organizationId={organizationId} item={item} />
    {item.isLatest && item.state !== "rejected" && <ClarificationQuestion organizationId={organizationId} recipientId={item.recipientId} normalizationId={item.normalizationId} />}
  </div>}</ResponseList>;
}
function ResponseDecision({ organizationId, item }: { organizationId: string; item: Item }) {
  const trpc = useTRPC();
  const router = useRouter();
  const review = useMutation(trpc.responses.review.mutationOptions({ retry: false }));
  const approve = useMutation(trpc.responses.approve.mutationOptions({ retry: false }));
  const reject = useMutation(trpc.responses.reject.mutationOptions({ retry: false }));
  const [confirmed, setConfirmed] = useState(false);
  const [locked, setLocked] = useState(false);
  const [complete, setComplete] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const attempt = useRef<Attempt | null>(null);
  const sending = useRef(false);
  const pending = review.isPending || approve.isPending || reject.isPending;
  async function send(input: Attempt) {
    if (sending.current || complete) return;
    sending.current = true;
    setLocked(true);
    setMessage(null);
    try {
      const { approvalReference, action, ...base } = input;
      if (action === "review") await review.mutateAsync({ ...base, action });
      else if (action === "approve") await approve.mutateAsync({ ...base, action, approvalReference });
      else await reject.mutateAsync({ ...base, action });
      setComplete(true);
      setMessage(action === "review" ? "Review recorded. A different staff member must approve or reject this response." : action === "approve" ? "Approval recorded. The customer can read this response." : "Rejection recorded. This response remains private.");
      try { router.refresh(); } catch { setMessage("Your decision was recorded. Reload this page to read its saved status."); }
    } catch { setMessage("We could not confirm this decision. Retry the unchanged request or reload the review."); }
    finally { sending.current = false; }
  }
  function decide(action: Attempt["action"]) {
    if (locked || !confirmed || typeof crypto.randomUUID !== "function") return;
    const key = crypto.randomUUID();
    attempt.current = { organizationId, normalizationId: item.normalizationId, rfpId: item.rfpId,
      version: item.version, action, correlationId: crypto.randomUUID(), idempotencyKey: key, approvalReference: `approval:portal-response:${key}` };
    void send(attempt.current);
  }
  if (!item.canReview && !item.canApprove) return item.isLatest && item.state === "reviewed"
    ? <p className="text-sm">A different MMHR staff member must approve or reject this response.</p> : null;
  return <div className="space-y-4 border-t pt-5">
    {!locked && <label className="flex min-h-11 items-start gap-3 text-sm leading-6">
      <input className="mt-1 size-4" type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
      <span>I checked these statements, conditions, and unanswered questions against the RFP.</span>
    </label>}
    {message && <p className="text-sm leading-7" role={complete ? "status" : "alert"}>{message}</p>}
    {!locked && <div className="flex flex-wrap gap-3">
      {item.canReview && <Button type="button" className="min-h-11" disabled={!confirmed} onClick={() => decide("review")}>Record staff review</Button>}
      {item.canApprove && <>
        <Button type="button" className="min-h-11" disabled={!confirmed} onClick={() => decide("approve")}>Approve for customer</Button>
        <Button type="button" variant="outline" className="min-h-11" disabled={!confirmed} onClick={() => decide("reject")}>Reject response</Button>
      </>}
    </div>}
    {locked && !complete && <div className="flex flex-wrap gap-3"><Button type="button" className="min-h-11" disabled={pending} onClick={() => { if (attempt.current) void send(attempt.current); }}>
      {pending ? "Saving…" : "Retry unchanged decision"}
    </Button><Button type="button" variant="outline" className="min-h-11" onClick={() => window.location.reload()}>Reload review</Button></div>}
  </div>;
}
