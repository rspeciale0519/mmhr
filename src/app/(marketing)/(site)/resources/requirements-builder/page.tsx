import type { Metadata } from "next";

import { CTA, PageHero, SectionHead } from "../../../_site/PageParts";

export const metadata: Metadata = {
  title: "Requirements Builder — MatchMaker HR",
  description:
    "Tag around 200 HRIS capabilities as must-have, nice-to-have or irrelevant. Drives every match score, and exports for your RFP.",
};

const STEPS = [
  {
    h: "Everyone answers independently",
    p: "HR, finance, IT and the executives who sign all work through the same list on their own, before anyone has seen a demo.",
  },
  {
    h: "Disagreements surface as data",
    p: "Where functions have tagged the same capability differently, you see it as a conflict to resolve rather than an argument in a meeting.",
  },
  {
    h: "Weights turn it into a ranking",
    p: "Agreed weights per criterion produce a score for every system in the marketplace, computed from your requirements rather than a generic rating.",
  },
  {
    h: "Export for the RFP",
    p: "The finished list goes out as a structured document vendors can respond to line by line.",
  },
];

export default function RequirementsBuilderPage() {
  return (
    <>
      <PageHero
        eyebrow="Resources · Tool"
        title="Decide what you need before anyone shows you a demo."
        lede="Almost every bad HRIS selection starts the same way: a committee sees an impressive interface, and the requirements quietly get rewritten to justify it. Doing requirements first is the cheapest safeguard there is."
      />

      <section className="pu-sec">
        <div className="pu-wrap">
          <SectionHead
            eyebrow="Sequence"
            title="How it works"
            sub="The order is the point — independent answers before group discussion is what keeps the loudest voice from setting the criteria."
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
          <SectionHead eyebrow="Coverage" title="What gets tagged" />
          <div className="pu-tablewrap">
            <table className="pu-table">
              <thead>
                <tr>
                  <th scope="col">Area</th>
                  <th scope="col">Examples of what you tag</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Payroll</td>
                  <td>Multi-state, off-cycle runs, retroactive adjustments, garnishments</td>
                </tr>
                <tr>
                  <td>Benefits</td>
                  <td>Open enrolment, carrier feeds, ACA reporting, dependent verification</td>
                </tr>
                <tr>
                  <td>Time & attendance</td>
                  <td>Shift differentials, accruals, geofenced clock-in, union rules</td>
                </tr>
                <tr>
                  <td>Talent</td>
                  <td>Applicant tracking, onboarding, reviews, succession planning</td>
                </tr>
                <tr>
                  <td>International</td>
                  <td>Entities, currencies, local statutory reporting, EOR handoff</td>
                </tr>
                <tr>
                  <td>Platform</td>
                  <td>SSO, API access, reporting depth, permission granularity</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <CTA
        title="Build your requirements"
        body="Free, and useful even if you never run the rest of your evaluation with us — the export is yours."
        primary={{ label: "Get started", href: "/sign-up" }}
        secondary={{ label: "See the platform", href: "/platform" }}
      />
    </>
  );
}
