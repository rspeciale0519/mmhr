import type { Metadata } from "next";

import { CTA, PageHero, SectionHead } from "../../_site/PageParts";

export const metadata: Metadata = {
  title: "About — MatchMaker HR",
  description:
    "Why a buyer-side HRIS brokerage exists, what we believe about the market, and how the company is structured to stay neutral.",
};

const BELIEFS = [
  {
    k: "01",
    h: "The information asymmetry is the product",
    p: "Vendors know what every comparable company paid. Buyers know what one vendor told them. Closing that gap is the entire job.",
  },
  {
    k: "02",
    h: "Requirements before vendors, always",
    p: "Every bad selection we have seen started with a demo instead of a requirement. Once a committee has seen a slick interface, the criteria get written to fit it.",
  },
  {
    k: "03",
    h: "Stale data is worse than no data",
    p: "A pricing benchmark from eighteen months ago will lose you money with more confidence than having no benchmark at all. Hence the verification date on every figure.",
  },
  {
    k: "04",
    h: "Say it when you are conflicted",
    p: "We resell one system. Pretending otherwise would be the fastest way to make everything else we say worthless.",
  },
];

export default function AboutPage() {
  return (
    <>
      <PageHero
        eyebrow="About"
        title="Built for the side of the table that has less information."
        lede="HRIS vendors have pricing data on every deal they have ever done. The company buying has one quote and a shortlist assembled from search results. MatchMaker HR exists to even that up."
      />

      <section className="pu-sec">
        <div className="pu-wrap">
          <div className="pu-prose">
            <h2>Why this company exists</h2>
            <p>
              An HRIS is usually a company&rsquo;s second- or third-largest
              software commitment, and most organisations buy one perhaps twice a
              decade. That combination — high stakes, low repetition — is exactly
              the situation where a market runs badly for buyers.
            </p>
            <p>
              The vendor on the other side of the call has run this conversation
              hundreds of times this year. They know the range, they know which
              objections are real, and they know what you are likely to accept.
              You do not have any of that, and there is no reason you should.
            </p>
            <p>
              Brokerage is a well-established answer in markets shaped like this —
              insurance, freight, commercial property. It had not really arrived in
              HR software, so we built it.
            </p>
          </div>
        </div>
      </section>

      <section className="pu-sec pu-sec-surface">
        <div className="pu-wrap">
          <SectionHead eyebrow="What we believe" title="Four things we run on" />
          <div className="pu-g2">
            {BELIEFS.map((b) => (
              <div className="pu-cell" key={b.k}>
                <div className="pu-cell-k">{b.k}</div>
                <h3>{b.h}</h3>
                <p>{b.p}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <CTA
        title="Work with us"
        body="Start an evaluation, or just send us a quote you would like a second opinion on."
        primary={{ label: "Get started", href: "/sign-up" }}
        secondary={{ label: "Contact us", href: "/contact" }}
      />
    </>
  );
}
