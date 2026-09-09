import { getMarketingPageMetadata } from "@/lib/site-metadata";
import { CTA, PageHero, SectionHead } from "../../../_site/PageParts";

export const metadata = getMarketingPageMetadata(
  "/resources/hris-landscape-report",
  "HRIS Landscape Report — MatchMaker HR",
  "A market-wide read on HRIS segments, pricing bands, capability depth and consolidation, refreshed from the verification pipeline.",
);

const CONTENTS = [
  {
    k: "01",
    h: "Segment map",
    p: "Which platforms genuinely serve which headcount bands, as opposed to which ones claim to.",
  },
  {
    k: "02",
    h: "Pricing bands",
    p: "Verified per-employee-per-month ranges by segment, with the implementation and module fees that sit alongside them.",
  },
  {
    k: "03",
    h: "Capability depth",
    p: "Module-level scoring across payroll, benefits, talent, time and international — where the marketing and the product diverge.",
  },
  {
    k: "04",
    h: "Consolidation watch",
    p: "Acquisitions, sunset notices and platform migrations that change whether a system is a safe ten-year bet.",
  },
];

export default function LandscapeReportPage() {
  return (
    <>
      <PageHero
        eyebrow="Resources · Report"
        title="The HRIS Landscape Report."
        lede="One document covering the whole market rather than the shortlist someone already sold you. Built from the same verification pipeline that keeps the marketplace current."
      />

      <section className="pu-sec">
        <div className="pu-wrap">
          <SectionHead eyebrow="Contents" title="What is inside" />
          <div className="pu-g2">
            {CONTENTS.map((c) => (
              <div className="pu-cell" key={c.k}>
                <div className="pu-cell-k">{c.k}</div>
                <h3>{c.h}</h3>
                <p>{c.p}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="pu-sec pu-sec-surface">
        <div className="pu-wrap">
          <SectionHead
            eyebrow="Method"
            title="Where the numbers come from"
            sub="Worth knowing before you rely on any market report, including this one."
          />
          <div className="pu-prose">
            <p>
              Figures come from an automated research pipeline that re-checks
              vendor pricing on a schedule, supplemented by proposals buyers send
              us for benchmarking. Every figure carries the date it was last
              verified.
            </p>
            <p>
              No vendor pays to appear, to be positioned, or to review the report
              before publication. We resell one system, CBIZ Centrally HR, and it
              is labelled wherever it appears.
            </p>
          </div>
        </div>
      </section>

      <CTA
        title="Get the report"
        body="Create an account and the current edition is available immediately, along with the marketplace it is drawn from."
        primary={{ label: "Get started", href: "/sign-up" }}
        secondary={{ label: "How we make money", href: "/transparency" }}
      />
    </>
  );
}
