import Link from "next/link";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { forbidden } from "next/navigation";
import { requirePortalPageAccess } from "@/server/auth/portal/portal-guards";
import { getVendorRfps } from "@/server/commands/rfp-portal";

import { getRfpReceiptStatus } from "@/server/commands/rfp-receipt";
import { RfpReceiptStatus } from "@/components/workflow/rfp-receipt-status";
import { launchVisibleLinks } from "@/lib/launch-surface";

const vendorLinks = [
  { href: "/home", label: "Home" },
  { href: "/workspaces", label: "Change workspace" },
  { href: "/vendor/demos", label: "Demo coordination" },
  { href: "/vendor/proposals", label: "Proposals and pricing" },
  { href: "/vendor/contracts", label: "Contract handoff" },
] as const;

export default async function VendorHome({ searchParams }: { searchParams: Promise<Record<string,string|string[]|undefined>> }) {
  const {authorization} = await requirePortalPageAccess("vendor");
  if (authorization.scope.kind !== "organization") forbidden();
  const query = z.object({after:z.uuid().optional(),receiptsAfter:z.uuid().optional()}).safeParse(await searchParams);
  if (!query.success) return <main className="p-8"><h1>Invalid inbox link</h1></main>;
  const page = await getVendorRfps({organizationId:authorization.scope.organizationId,afterId:query.data.after,correlationId:randomUUID()},{supabase:authorization.supabase});
  const receipts = await getRfpReceiptStatus({organizationId:authorization.scope.organizationId,view:"vendor",afterId:query.data.receiptsAfter,
    correlationId:randomUUID()},{supabase:authorization.supabase});
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-8">
      <nav aria-label="Vendor workspace" className="flex flex-wrap gap-6 text-sm underline">
        {launchVisibleLinks(vendorLinks).map(({ href, label }) =>
          <Link key={href} href={href} className="inline-flex min-h-11 items-center">{label}</Link>)}
      </nav>
      <h1 className="text-2xl font-semibold">Vendor portal</h1>
      <p className="text-sm">Approved RFPs delivered to your organization.</p>
      {page.items.length===0 && <p role="status">No RFPs have been delivered to this inbox.</p>}
      {page.items.map((item) => <article key={item.recipientId} className="space-y-4 rounded-lg border p-5">
        <h2 className="text-xl font-semibold">{item.title}</h2>
        <p className="text-sm">Response deadline: {new Date(item.deadlineAt).toLocaleString()}</p>
        <div className="whitespace-pre-wrap text-sm leading-7 [overflow-wrap:anywhere]">{item.content}</div>
        <Link href={`/vendor/response?recipient=${item.recipientId}`} className="inline-flex min-h-11 items-center text-sm underline">Open response and saved versions</Link>
      </article>)}
      <RfpReceiptStatus page={receipts} nextHref={receipts.nextCursor ? `/vendor?receiptsAfter=${receipts.nextCursor}` : null}/>
      {page.nextCursor && <Link href={`/vendor?after=${page.nextCursor}`} className="inline-flex min-h-11 items-center underline">Next RFPs</Link>}
    </main>
  );
}
