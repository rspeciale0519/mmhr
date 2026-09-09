import Link from "next/link";

import { getMarketingPageMetadata } from "@/lib/site-metadata";
import { CASE_STUDIES } from "../../_site/data";
import { CTA, PageHero } from "../../_site/PageParts";

export const metadata = getMarketingPageMetadata(
  "/case-studies",
  "Case studies — MatchMaker HR",
  "How buying committees used verified pricing and shared scorecards to shorten evaluations and renegotiate contracts.",
);

export default function CaseStudiesPage() {
  return (
    <>
      <PageHero
        eyebrow="Case studies"
        title="What the process looks like when it works."
        lede="Three selections, three different problems: a contract renegotiated in place, a deadlocked committee unblocked, and a forced migration landed before year-end close."
      />

      <section className="pu-sec">
        <div className="pu-wrap">
          <div className="pu-cards pu-cards-3">
            {CASE_STUDIES.map((c) => (
              <Link className="pu-pcard" href={`/case-studies/${c.slug}`} key={c.slug}>
                <div className="pu-case-n">{c.stat}</div>
                <div className="pu-case-nl">{c.statLabel}</div>
                <h2>{c.title}</h2>
                <p>{c.summary}</p>
                <div className="pu-pcard-more">Read the case →</div>
              </Link>
            ))}
          </div>

          <p className="pu-fine" style={{ marginTop: 26 }}>
            Company names and figures on these pages are illustrative
            placeholders while the site is in build, not client claims.
          </p>
        </div>
      </section>

      <CTA
        title="Start your own evaluation"
        body="Requirements first, ranked marketplace second, advisor whenever you want one."
        primary={{ label: "Get started", href: "/sign-up" }}
        secondary={{ label: "Advisory services", href: "/services" }}
      />
    </>
  );
}
