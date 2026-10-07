import type { PortalClarificationPage } from "@/lib/portal-clarification";

export function ClarificationList({ items, children }: {
  items: PortalClarificationPage["items"];
  children?: (item: PortalClarificationPage["items"][number]) => React.ReactNode;
}) {
  return <div className="space-y-6">{items.map((item) => <article key={item.clarificationId} className="space-y-4 rounded-lg border p-5">
    <header className="space-y-2"><h3 className="text-lg font-semibold">{item.providerName} · response {item.revision}</h3>
      <p className="text-sm">{item.status === "pending" ? "Awaiting vendor answer" : item.decision === "pending" ? "Awaiting staff decision"
        : item.decision === "accepted" ? "Answer accepted by MMHR" : item.decision === "rejected" ? "Answer rejected by MMHR" : "Decision deferred by MMHR"}</p>
      <p className="text-sm text-muted-foreground">Reply deadline: {new Date(item.deadlineAt).toLocaleString()}</p>
      {item.late && <p className="text-sm text-muted-foreground">{item.answeredAt ? "Answered after the deadline." : "The reply deadline has passed."}</p>}
    </header>
    <section className="space-y-2"><h4 className="text-sm font-semibold">Staff question</h4><p className="whitespace-pre-wrap text-sm leading-7 [overflow-wrap:anywhere]">{item.question}</p></section>
    {item.answer && <section className="space-y-2"><h4 className="text-sm font-semibold">Vendor answer</h4><p className="whitespace-pre-wrap text-sm leading-7 [overflow-wrap:anywhere]">{item.answer}</p>
      <p className="whitespace-pre-wrap text-sm leading-7 [overflow-wrap:anywhere]">{item.changeSummary}</p>
      {item.replyRevision && <p className="text-sm">Linked response revision: {item.replyRevision}</p>}
      {item.answeredAt && <p className="text-sm text-muted-foreground">Answered: {new Date(item.answeredAt).toLocaleString()}</p>}
    </section>}
    {item.decisionReason && <section className="space-y-2"><h4 className="text-sm font-semibold">Staff decision reason</h4><p className="whitespace-pre-wrap text-sm leading-7 [overflow-wrap:anywhere]">{item.decisionReason}</p></section>}
    {children?.(item)}
  </article>)}</div>;
}
