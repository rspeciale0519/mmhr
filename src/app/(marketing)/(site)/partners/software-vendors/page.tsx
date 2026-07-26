import type { Metadata } from "next";

import { CTA, PageHero, SectionHead } from "../../../_site/PageParts";

export const metadata: Metadata = {
  title: "For software vendors — MatchMaker HR",
  description:
    "How HRIS vendors appear in the marketplace, what the flat commission means, and why placement cannot be bought.",
};

export default function SoftwareVendorsPage() {
  return (
    <>
      <PageHero
        eyebrow="Partners · Software vendors"
        title="Qualified buyers who already know what they need."
        lede="Every company we send you has tagged around 200 requirements, agreed them across a buying committee, and seen verified pricing before the first call. The conversations start further along."
      />

      <section className="pu-sec">
        <div className="pu-wrap">
          <SectionHead
            eyebrow="The arrangement"
            title="What partnering actually involves"
            sub="Deliberately narrow. There is no tiering, no premium placement, and nothing to negotiate about visibility."
          />
          <ul className="pu-checks">
            <li>
              <i aria-hidden="true" />
              <span>
                <strong>A flat commission on closed business</strong> — the same
                rate we take from every other vendor in the marketplace.
              </span>
            </li>
            <li>
              <i aria-hidden="true" />
              <span>
                <strong>Placement cannot be bought.</strong> Ranking is computed
                from buyer requirements and verified data. There is no paid tier,
                because one would destroy the reason buyers trust the ranking.
              </span>
            </li>
            <li>
              <i aria-hidden="true" />
              <span>
                <strong>A right of reply on your profile.</strong> If our data is
                wrong or stale, tell us and we will re-verify. Accuracy is the
                product.
              </span>
            </li>
            <li>
              <i aria-hidden="true" />
              <span>
                <strong>Buyers arrive scoped.</strong> Requirements, headcount,
                timeline and budget range are established before introduction.
              </span>
            </li>
          </ul>
        </div>
      </section>

      <section className="pu-sec pu-sec-surface">
        <div className="pu-wrap">
          <SectionHead title="What we will not do" />
          <div className="pu-prose">
            <p>
              We will not take a higher rate from you than from a competitor, sell
              you a placement boost, or suppress a capability gap in your profile.
              All three would make the marketplace worthless to the buyers it
              exists for, and a marketplace buyers do not trust is worth nothing to
              you either.
            </p>
            <p>
              We also disclose that we resell one system, CBIZ Centrally HR. It is
              labelled wherever it appears and competes on the same data as your
              product does.
            </p>
          </div>
        </div>
      </section>

      <CTA
        title="Talk to our partnerships team"
        body="We will walk you through the data we hold on your product and how the commission works."
        primary={{ label: "Contact us", href: "/contact" }}
        secondary={{ label: "How we make money", href: "/transparency" }}
      />
    </>
  );
}
