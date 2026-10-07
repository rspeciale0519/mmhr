import Link from "next/link";
import type { RfpReceiptPage } from "@/lib/rfp-receipt";
import { RfpReceiptControls } from "./rfp-receipt-controls";

const date = (value: string) => new Date(value).toLocaleString("en-US", { timeZone: "UTC" }) + " UTC";
export function RfpReceiptStatus({ page, nextHref }: { page: RfpReceiptPage; nextHref: string | null }) {
  return <section className="space-y-5 border-t pt-8" aria-label="RFP delivery and receipt status">
    <h2 className="text-xl font-semibold">RFP delivery and receipt status</h2>
    <p className="text-sm leading-6">Receipt confirms delivery. It does not confirm a response or approval of vendor answers.</p>
    {page.items.length === 0 && <p role="status" className="text-sm">No delivered questionnaires are available in this workspace.</p>}
    <ul className="space-y-4">{page.items.map(item => <li key={`${page.organizationId}:${item.recipientId}:${item.rfpVersionId}`} className="space-y-3 rounded-lg border p-5">
      <h3 className="font-semibold [overflow-wrap:anywhere]">{item.title} · Version {item.version}</h3>
      <p className="text-sm [overflow-wrap:anywhere]">{item.providerName}</p>
      <dl className="space-y-2 text-sm leading-6">
        <div><dt className="font-medium">Delivery</dt><dd>{item.state === "withdrawn" ? "Withdrawn" : `Delivered ${date(item.sentAt)}`}</dd></div>
        <div><dt className="font-medium">Receipt</dt><dd>{item.receiptKind === "none" ? (item.state === "withdrawn" ? "No receipt recorded" : "Awaiting vendor receipt") :
          `${item.receiptKind === "explicit" ? "Vendor confirmed" : "Receipt recorded"} ${date(item.acknowledgedAt!)}`}</dd></div>
        <div><dt className="font-medium">Response</dt><dd>{item.respondedAt ? `Submitted ${date(item.respondedAt)}` : "No response submitted"}</dd></div>
        <div><dt className="font-medium">Response deadline</dt><dd>{date(item.deadlineAt)}</dd></div>
      </dl>
      {page.view === "vendor" && <RfpReceiptControls organizationId={page.organizationId} item={item}/>}
    </li>)}</ul>
    {nextHref && <Link href={nextHref} className="inline-flex min-h-11 items-center text-sm underline">Next delivery records</Link>}
  </section>;
}
