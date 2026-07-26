import type { Metadata } from "next";

import { TRUST } from "@/designs/_content";
import { CTA, PageHero, SectionHead } from "../../_site/PageParts";

export const metadata: Metadata = {
  title: "Broker model — MatchMaker HR",
  description:
    "How a buyer-side HRIS brokerage works: who pays us, why the rate is identical across every vendor, and how scoring is kept honest.",
};

const STEPS = [
  {
    h: "You tell us what you need",
    p: "Requirements first, vendors second. Around 200 HRIS capabilities get tagged must-have, nice-to-have or irrelevant by the people who will actually use the system.",
  },
  {
    h: "We rank the market against it",
    p: "Every system is scored on the same verified data. The ranking is computed from your requirements, so it is yours rather than a generic top-ten list.",
  },
  {
    h: "You evaluate with real structure",
    p: "Shared scorecards, an expert question bank, and demo scoring your whole committee fills in independently. Disagreements surface as data instead of as a meeting.",
  },
  {
    h: "We review the proposal before you sign",
    p: "Send us the quote. We benchmark it against what comparable companies paid, flag unusual terms, and tell you where there is room to move.",
  },
  {
    h: "The vendor pays our commission",
    p: "At the same rate, whichever system you chose. Nothing is added to your price and nothing changes hands between you and us.",
  },
];

const COMPARISON = [
  {
    model: "MatchMaker HR",
    paid: "Vendor, flat rate across all vendors",
    incentive: "Get the fit right — the fee is identical either way",
  },
  {
    model: "Percentage-of-contract referrer",
    paid: "Vendor, as a share of contract value",
    incentive: "Steer toward the most expensive system",
  },
  {
    model: "Single-vendor reseller",
    paid: "One vendor only",
    incentive: "Recommend that vendor regardless of fit",
  },
  {
    model: "Paid consultancy",
    paid: "You, by the hour or by project",
    incentive: "Neutral, but the cost lands on the buyer",
  },
];

export default function BrokerModelPage() {
  return (
    <>
      <PageHero
        eyebrow="The broker model"
        title="Free to you, because the incentive is built to be boring."
        lede="Buyer-side brokerage only works if the broker cannot profit from steering you. Ours cannot: the commission is the same rate from every vendor in the marketplace, so the only thing left to optimise is whether the recommendation is right."
      />

      <section className="pu-sec">
        <div className="pu-wrap">
          <SectionHead
            eyebrow="Sequence"
            title="How a selection actually runs"
            sub="These steps are ordered because the order matters — requirements before vendors is what keeps the rest of the process honest."
          />
          <div className="pu-steps">
            {STEPS.map((s, i) => (
              <div className="pu-step" key={s.h}>
                <div className="pu-step-n">{String(i + 1).padStart(2, "0")}</div>
                <div>
                  <h3>{s.h}</h3>
                  <p>{s.p}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="pu-sec pu-sec-surface">
        <div className="pu-wrap">
          <SectionHead
            eyebrow="Comparison"
            title="Who pays, and what that buys them"
            sub="Every advisory model has an incentive. The question is only whether it points at your interests or away from them."
          />
          <div className="pu-tablewrap">
            <table className="pu-table">
              <thead>
                <tr>
                  <th scope="col">Model</th>
                  <th scope="col">Who pays</th>
                  <th scope="col">Built-in incentive</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map((row) => (
                  <tr key={row.model}>
                    <td>{row.model}</td>
                    <td>{row.paid}</td>
                    <td>{row.incentive}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="pu-sec">
        <div className="pu-wrap">
          <SectionHead eyebrow="Method" title="The three commitments" />
          <div className="pu-cards pu-cards-3">
            {TRUST.map((t, i) => (
              <article className="pu-pcard" key={t.title}>
                <div className="pu-cell-k">M.{String(i + 1).padStart(2, "0")}</div>
                <h3>{t.title}</h3>
                <p>{t.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <CTA
        title="Read the full commission disclosure"
        body="Rates, the CBIZ Centrally HR affiliation, and what we do when our own system is in your shortlist."
        primary={{ label: "How we make money", href: "/transparency" }}
        secondary={{ label: "Get started", href: "/sign-up" }}
      />
    </>
  );
}
