import { getMarketingPageMetadata } from "@/lib/site-metadata";
import { CTA, PageHero, SectionHead } from "../../../_site/PageParts";

export const metadata = getMarketingPageMetadata(
  "/partners/pe-vc",
  "For PE & VC firms — MatchMaker HR",
  "HRIS diligence, portfolio-wide benchmarking, and post-close systems consolidation for private equity and venture portfolios.",
);

const OFFERS = [
  {
    k: "DILIGENCE",
    h: "What the HR stack actually costs",
    p: "A read on the target's HR systems spend against verified benchmarks, plus contract terms that will constrain a post-close integration.",
  },
  {
    k: "PORTFOLIO",
    h: "Benchmarking across holdings",
    p: "Most portfolios contain several companies paying materially different rates for comparable systems. We identify the gaps and the renewal dates to act on them.",
  },
  {
    k: "POST-CLOSE",
    h: "Consolidation and migration",
    p: "When two companies merge onto one HRIS, the question is which platform survives and what the switch costs. We model both before anyone commits.",
  },
];

export default function PeVcPage() {
  return (
    <>
      <PageHero
        eyebrow="Partners · PE & VC"
        title="HR systems, priced properly, across the whole portfolio."
        lede="HRIS spend rarely makes the diligence list and almost always contains surplus. It is a recurring, contracted cost that most portfolio companies negotiated once, without benchmarks, several years ago."
      />

      <section className="pu-sec">
        <div className="pu-wrap">
          <SectionHead
            eyebrow="Where we help"
            title="Three points in the holding period"
          />
          <div className="pu-cards pu-cards-3">
            {OFFERS.map((o) => (
              <article className="pu-pcard" key={o.k}>
                <div className="pu-cell-k">{o.k}</div>
                <h3>{o.h}</h3>
                <p>{o.p}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="pu-sec pu-sec-surface">
        <div className="pu-wrap">
          <SectionHead title="Why this is usually worth checking" />
          <div className="pu-prose">
            <p>
              An HRIS contract is typically three years, renews quietly, and is
              priced per employee. A portfolio company that has grown since
              signature is often paying a rate negotiated against a much smaller
              headcount — and one that has contracted is frequently paying for
              seats it no longer fills.
            </p>
            <p>
              Neither shows up in a monthly review, because the line item looks
              stable. It is the comparison against the market that reveals the
              gap, and that comparison needs current data across every major
              platform.
            </p>
          </div>
        </div>
      </section>

      <CTA
        title="Benchmark a portfolio"
        body="Tell us the holdings and headcounts, and we will show you where the surplus sits."
        primary={{ label: "Contact us", href: "/contact" }}
        secondary={{ label: "See the platform", href: "/platform" }}
      />
    </>
  );
}
