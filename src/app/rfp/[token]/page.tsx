import type { Metadata } from "next";
import { brand } from "@/lib/brand";
import { selectRfpTabs } from "@/lib/rfp-form-library";
import { readPublicRfpForm } from "@/server/commands/rfp-vendor-form-public";
import { VendorRfpForm } from "./vendor-form";

/**
 * The RFP web form a vendor opens from their email.
 *
 * There is no sign-in. The long random token in the address is the key to
 * exactly one form. The page is built fresh on every visit so the vendor
 * always sees their latest saved answers.
 */

// Never index this page, and never send its address to other sites.
export const metadata: Metadata = {
  title: `Request for proposal | ${brand.name}`,
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

// Always run on the server at request time; never cache.
export const dynamic = "force-dynamic";

export default async function VendorRfpPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const form = await readPublicRfpForm(token);

  // Unknown, mistyped, or withdrawn link. Say so plainly, with a next step.
  if (!form) {
    return (
      <main className="mx-auto flex w-full max-w-xl flex-col gap-4 px-6 py-24">
        <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{brand.name}</p>
        <h1 className="text-2xl font-semibold">This link is not active</h1>
        <p className="text-base leading-7 text-muted-foreground">
          Check that you copied the whole link from your email. If it still does not open, reply to that email and
          the {brand.name} team will send you a new one.
        </p>
      </main>
    );
  }

  return <VendorRfpForm token={token} form={form} tabs={selectRfpTabs(form.tabKeys)} brandName={brand.name} />;
}
