import { TOOLS, VENDORS } from "@/designs/_content";
import { getMarketingPageMetadata } from "@/lib/site-metadata";
import { CTA, PageHero, SectionHead } from "../../_site/PageParts";

export const metadata = getMarketingPageMetadata(
  "/platform",
  "Platform — MatchMaker HR",
  "The marketplace, requirements builder, scorecards, project plans, team collaboration and advisor access that run an HRIS evaluation end to end.",
);

const CAPABILITIES = [
  {
    k: "COVERAGE",
    h: "52 systems, profiled the same way",
    p: "Every system is scored against the same criteria, so a comparison means something. No sponsored placements and no vendor-written blurbs.",
  },
  {
    k: "FRESHNESS",
    h: "A verification date on every figure",
    p: "Pricing is re-checked on a schedule by an automated pipeline. Each profile shows when it was last confirmed, so you know how much weight it carries.",
  },
  {
    k: "FIT",
    h: "Ranked against your requirements",
    p: "Scores are computed from what you told us you need, not from a generic quality rating. Change a requirement and the ranking moves.",
  },
];

export default function PlatformPage() {
  return (
    <>
      <PageHero
        eyebrow="The platform"
        title="Everything an HRIS evaluation needs, instrumented."
        lede="Most buying committees run this process on spreadsheets and vendor decks. The platform replaces both with shared requirements, verified pricing, and scorecards your whole team works from."
      />

      <section className="pu-sec">
        <div className="pu-wrap">
          <SectionHead
            eyebrow="Six tools"
            title="One dashboard, six instruments"
            sub="Each one solves a step buyers normally improvise. They work independently, and they share the same underlying requirements."
          />
          <div className="pu-g3">
            {TOOLS.map((t, i) => (
              <div className="pu-cell" key={t.key}>
                <div className="pu-cell-k">{String(i + 1).padStart(2, "0")}</div>
                <h3>{t.name}</h3>
                <p>{t.blurb}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="pu-sec pu-sec-surface">
        <div className="pu-wrap">
          <SectionHead
            eyebrow="The marketplace"
            title="What makes the data worth trusting"
          />
          <div className="pu-cards pu-cards-3">
            {CAPABILITIES.map((c) => (
              <article className="pu-pcard" key={c.k}>
                <div className="pu-cell-k">{c.k}</div>
                <h3>{c.h}</h3>
                <p>{c.p}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="pu-sec">
        <div className="pu-wrap">
          <SectionHead
            eyebrow="Covered"
            title="Systems in the marketplace"
            sub="A selection of what is profiled today. The full list is available once you have an account."
          />
          <div className="pu-vwall-list">
            {VENDORS.map((v) => (
              <span className="pu-vchip" key={v}>
                {v}
              </span>
            ))}
            <span className="pu-vchip pu-vchip-more">+ 36 more</span>
          </div>
        </div>
      </section>

      <CTA
        title="Open the marketplace"
        body="Create an account to see verified pricing, capability scores and fit rankings across all 52 systems."
        primary={{ label: "Get started", href: "/sign-up" }}
        secondary={{ label: "How we make money", href: "/transparency" }}
      />
    </>
  );
}
