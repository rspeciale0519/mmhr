import type { Metadata } from "next";

import { CTA, PageHero, SectionHead } from "../../_site/PageParts";

export const metadata: Metadata = {
  title: "Advisory services — MatchMaker HR",
  description:
    "What a dedicated HRIS advisor does: requirements facilitation, shortlist review, demo support, proposal benchmarking and negotiation guidance.",
};

const SERVICES = [
  {
    k: "01",
    h: "Requirements facilitation",
    p: "A working session with your committee to turn vague needs into tagged, weighted requirements everyone has signed off on.",
    for: "Best before you have spoken to any vendor.",
  },
  {
    k: "02",
    h: "Shortlist review",
    p: "We go through the ranked marketplace with you, explain why each system placed where it did, and challenge the ones you are drawn to for the wrong reasons.",
    for: "Best once requirements are locked.",
  },
  {
    k: "03",
    h: "Demo support",
    p: "An advisor sits in, asks the questions that move a demo off its rehearsed path, and scores alongside your team.",
    for: "Best during vendor demos.",
  },
  {
    k: "04",
    h: "Proposal benchmarking",
    p: "Send us the quote. You get what comparable companies actually paid, which line items are unusual, and where the vendor has room to move.",
    for: "Best before you counter.",
  },
  {
    k: "05",
    h: "Negotiation guidance",
    p: "We help you build the counter-position and brief whoever is taking the call. We do not negotiate on your behalf — you keep the relationship.",
    for: "Best between counter and signature.",
  },
  {
    k: "06",
    h: "Implementation readiness",
    p: "A phased plan with owners, dates and dependencies, plus the questions to settle with your implementation partner before kickoff.",
    for: "Best after signature.",
  },
];

export default function ServicesPage() {
  return (
    <>
      <PageHero
        eyebrow="Advisory services"
        title="A dedicated expert who has run hundreds of these."
        lede="The platform handles the structure. An advisor handles the judgement calls — which trade-offs matter, which vendor answer was evasive, and whether the price in front of you is a good one."
      />

      <section className="pu-sec">
        <div className="pu-wrap">
          <SectionHead
            eyebrow="What we do"
            title="Six ways an advisor earns their place"
            sub="Included at no cost. Use all of them or none — the platform works on its own."
          />
          <div className="pu-g3">
            {SERVICES.map((s) => (
              <div className="pu-cell" key={s.k}>
                <div className="pu-cell-k">{s.k}</div>
                <h3>{s.h}</h3>
                <p>{s.p}</p>
                <p style={{ marginTop: 12, fontSize: 13, opacity: 0.78 }}>{s.for}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="pu-sec pu-sec-surface">
        <div className="pu-wrap">
          <SectionHead eyebrow="Boundaries" title="What an advisor will not do" />
          <div className="pu-prose">
            <p>
              <strong>We do not negotiate for you.</strong> You keep the vendor
              relationship, because you are the one who has to live with it. We
              give you the benchmark and the counter-position; you make the call.
            </p>
            <p>
              <strong>We do not implement.</strong> Implementation is a distinct
              discipline and we would be worse at it than the partners who do it
              full time. We will help you pick one and tell you what to pin down
              before kickoff.
            </p>
            <p>
              <strong>We do not pretend our own system is neutral.</strong> We
              resell CBIZ Centrally HR. When it appears in your shortlist it is
              labelled, and an advisor will tell you plainly when it is the wrong
              answer for you.
            </p>
          </div>
        </div>
      </section>

      <CTA
        title="Talk to an advisor"
        body="No cost, no obligation, and no commitment to run your evaluation with us."
        primary={{ label: "Contact us", href: "/contact" }}
        secondary={{ label: "See the platform", href: "/platform" }}
      />
    </>
  );
}
