import { responseFields, type ResponseField } from "@/lib/rfp-response";
import type { PortalResponsePage } from "@/server/commands/rfp-portal-response";

export function ResponseList({ items, children }: {
  items: PortalResponsePage["items"];
  children?: (item: PortalResponsePage["items"][number]) => React.ReactNode;
}) {
  return <div className="space-y-6">{items.map((item) => <article key={item.submissionId} className="space-y-5 rounded-lg border p-5">
    <header className="space-y-2">
      <h3 className="text-lg font-semibold">{item.providerName}</h3>
      <p className="text-sm tabular-nums">Response {item.revision} · RFP version {item.version}</p>
      <p className="text-sm">{item.state === "pending" ? "Awaiting MMHR review" : item.state === "reviewed" ? "Awaiting MMHR approval" : item.state === "approved" ? "Approved by MMHR" : "Rejected by MMHR"}</p>
      {!item.isLatest && <p className="text-sm text-muted-foreground">A newer response has been submitted.</p>}
      {item.late && <p className="text-sm text-muted-foreground">Received after the response deadline.</p>}
      <p className="text-sm text-muted-foreground">Received: {new Date(item.submittedAt).toLocaleString()}</p>
      {item.approvedAt && <p className="text-sm text-muted-foreground">Approved: {new Date(item.approvedAt).toLocaleString()}</p>}
    </header>
    {(Object.keys(responseFields) as ResponseField[]).map((field) => item.response[field].length > 0 && <section key={field} className="space-y-2">
      <h4 className="text-sm font-semibold">{responseFields[field]}</h4>
      <ul className="list-disc space-y-2 pl-5 text-sm leading-7 [overflow-wrap:anywhere]">{item.response[field].map((statement, index) => <li key={index}>{statement}</li>)}</ul>
    </section>)}
    {children?.(item)}
  </article>)}</div>;
}
