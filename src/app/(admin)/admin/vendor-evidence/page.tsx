import Link from "next/link";
import { forbidden } from "next/navigation";
import { z } from "zod";
import { requirePagePermission, requireSelectedOrganizationPermission } from "@/server/auth/page-guards";
import { searchCrm } from "@/server/commands/crm-search-database";
import { getVendorEvidence } from "@/server/commands/vendor-evidence-database";
import { EvidenceCapture, EvidenceReview, EvidenceRenewal } from "./evidence-controls";
import { EvidenceValue } from "./evidence-value";
import { AddProduct } from "./add-product";
import { ProductReview } from "./product-review";
import { ProfileReview } from "./profile-review";
import { getVendorCatalogProfile } from "@/server/commands/vendor-catalog";
import { getVendorRfpTracking } from "@/server/commands/rfp-vendor-forms";
import { RfpTrackingCard } from "../rfp-forms/tracking-card";

export default async function VendorEvidencePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePagePermission("admin.access", { kind: "platform" });
  const { authorization } = await requireSelectedOrganizationPermission("workspace.access");
  if (authorization.scope.kind !== "organization") forbidden();
  const query = z.object({ after: z.uuid().optional(), productsAfter: z.uuid().optional() }).safeParse(await searchParams);
  if (!query.success) return <main className="p-8"><h1>Invalid evidence link</h1></main>;
  const organizationId = authorization.scope.organizationId, options = { supabase: authorization.supabase };
  const [vendors, products, page] = await Promise.all([
    searchCrm({ organizationId, resource: "vendor", limit: 2 }, options),
    searchCrm({ organizationId, resource: "product", statuses: ["active", "draft"], limit: 50, cursor: query.data.productsAfter }, options),
    getVendorEvidence({ organizationId, afterId: query.data.after, limit: 25, registryVersion: 1 }, options),
  ]);
  // RFPs emailed to this vendor. Left out if the tracking data cannot be read.
  const tracking = vendors.length === 1 ? await getVendorRfpTracking(organizationId, options).catch(() => null) : null;
  const profile = vendors.length === 1 ? await getVendorCatalogProfile({ organizationId, profileId: vendors[0].recordId }, options) : null;
  return <main className="mx-auto w-full max-w-4xl space-y-8 px-5 py-10 sm:px-8">
    <header className="space-y-3"><Link href="/admin" className="inline-flex min-h-11 items-center text-sm underline">Administration</Link>
      <h1 className="text-3xl font-semibold">Vendor evidence</h1>
      <p className="text-sm leading-6 text-muted-foreground">{vendors[0]?.label ?? "Select a vendor workspace to record evidence."}</p>
      <Link href="/workspaces" className="inline-flex min-h-11 items-center underline">Change workspace</Link></header>
    {tracking && <section className="space-y-4" aria-labelledby="rfp-tracking-heading">
      <h2 id="rfp-tracking-heading" className="text-xl font-semibold">RFP tracking</h2>
      <p className="text-sm leading-6 text-muted-foreground">
        RFPs emailed to this vendor, newest first. RFP contact: {tracking.contact ? `${tracking.contact.contactName}, ${tracking.contact.contactEmail}` : "not set. Add one at Administration, Vendors."}
      </p>
      {tracking.items.length === 0 && <p className="text-sm">No RFP has been emailed to this vendor yet. Send one from the customer review page after the RFP is delivered.</p>}
      {tracking.items.map((form) => <RfpTrackingCard key={form.formId} form={form} heading="customer"/>)}
    </section>}
    {vendors.length === 1 && <AddProduct organizationId={organizationId} vendorProfileId={vendors[0].recordId}/>}
    {vendors.length === 1 && <EvidenceCapture key={`${organizationId}:${query.data.productsAfter ?? "first"}`} organizationId={organizationId}
      vendorProfileId={vendors[0].recordId} products={products}/>}
    {profile && <ProfileReview profile={profile}/>}
    {products.length > 0 && <ProductReview organizationId={organizationId} products={products}/>}
    {products.length === 0 && <p>No active or draft products are available on this page. Add a product above.</p>}
    {products.length === 50 && <Link className="inline-flex min-h-11 items-center underline" href={`/admin/vendor-evidence?productsAfter=${products.at(-1)!.recordId}`}>Next products</Link>}
    {query.data.productsAfter && <Link className="inline-flex min-h-11 items-center underline" href="/admin/vendor-evidence">First products</Link>}
    <section className="space-y-5" aria-labelledby="saved-evidence-heading"><h2 id="saved-evidence-heading" className="text-xl font-semibold">Saved evidence</h2>
      {page.items.length === 0 && <p className="text-sm">No saved evidence on this page.</p>}
      {page.items.map((item) => <article key={item.evidence.evidenceId} className="space-y-4 rounded-xl border p-5 sm:p-7">
        <h3 className="break-words font-semibold">{item.fact.fieldKey} · version {item.evidence.version}</h3>
        <p className="text-sm font-medium">{item.productName ?? "Vendor-wide fact"} · {item.fact.status}</p>
        {Date.parse(item.evidence.freshUntil) <= Date.parse(page.readAt) && <p className="text-sm font-medium">Evidence expired. Do not use this record for a new comparison.</p>}
        <EvidenceValue fieldKey={item.fact.fieldKey} value={item.fact.value}/>
        {item.registry && <p className="text-sm">Source owner: {item.registry.ownerIdentityId ? "recorded" : "not recorded"}. Capture method: {item.registry.captureMethod}. Review every {item.registry.cadenceDays} days. Evidence approval required.</p>}
        <p className="text-sm">Captured {new Date(item.evidence.capturedAt).toISOString().slice(0, 10)} · Expires {new Date(item.evidence.freshUntil).toISOString().slice(0, 10)}</p>
        <a href={item.source.uri} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center underline">Open source</a>
        <p className="whitespace-pre-wrap break-words text-sm leading-6">{item.evidence.citation}</p>
        <EvidenceReview item={item}/>
        <EvidenceRenewal item={item}/>
      </article>)}
      {page.nextCursor && <Link className="inline-flex min-h-11 items-center underline" href={`/admin/vendor-evidence?after=${page.nextCursor}`}>Next evidence</Link>}
      {query.data.after && <Link className="inline-flex min-h-11 items-center underline" href="/admin/vendor-evidence">First evidence</Link>}
    </section>
  </main>;
}
