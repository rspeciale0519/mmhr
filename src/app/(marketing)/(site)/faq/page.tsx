import type { Metadata } from "next";

import { FAQS } from "../../_site/data";
import { CTA, PageHero } from "../../_site/PageParts";

export const metadata: Metadata = {
  title: "FAQ — MatchMaker HR",
  description:
    "Common questions about cost, neutrality, our CBIZ Centrally HR affiliation, where pricing data comes from, and why registration is required.",
};

export default function FaqPage() {
  return (
    <>
      <PageHero
        eyebrow="FAQ"
        title="The questions worth asking a broker."
        lede="Most of these are about incentives, which is the right thing to be sceptical about. Answers are plain and the awkward ones are here too."
      />

      <section className="pu-sec">
        <div className="pu-wrap">
          {/* Native <details> rather than a JS accordion: it is keyboard
              accessible, works without hydration, and is findable by in-page
              search in most browsers. */}
          <div className="pu-faq">
            {FAQS.map((item) => (
              <details key={item.q}>
                <summary>{item.q}</summary>
                <p className="pu-faq-a">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <CTA
        title="Still have a question?"
        body="An advisor will answer it directly, with no expectation that you run your evaluation with us."
        primary={{ label: "Contact us", href: "/contact" }}
        secondary={{ label: "How we make money", href: "/transparency" }}
      />
    </>
  );
}
