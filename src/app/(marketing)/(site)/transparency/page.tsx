import { getMarketingPageMetadata } from "@/lib/site-metadata";
import { CTA, PageHero, SectionHead } from "../../_site/PageParts";

export const metadata = getMarketingPageMetadata(
  "/transparency",
  "How we make money — MatchMaker HR",
  "Full disclosure of provider commission or referral arrangements and our reseller affiliation with CBIZ Centrally HR.",
);

export default function TransparencyPage() {
  return (
    <>
      <PageHero
        eyebrow="Commission disclosure"
        title="How we make money."
        lede="You are about to take advice from someone paid by the companies they are recommending. That deserves a straight answer, so here is the whole arrangement."
      />

      <section className="pu-sec">
        <div className="pu-wrap">
          <div className="pu-prose">
            <h2>Who pays us</h2>
            <p>
              The provider you select pays us under a commission or referral
              arrangement. Customers do not pay MMHR a fee or subscription.
            </p>

            <h2>Provider arrangements can differ</h2>
            <p>
              The arrangement can differ by provider. We disclose the relevant
              arrangement, and recommendations follow your requirements and
              verified data.
            </p>
            <p>
              Payment terms do not set rankings or scores. Ask us about the
              arrangement for any provider you are considering.
            </p>

            <h2>We resell one system, and we say so</h2>
            <p>
              We are a reseller of <strong>CBIZ Centrally HR</strong>. When it
              appears anywhere in the marketplace, in a ranking, or in a shortlist,
              it is labelled as ours.
            </p>
            <p>It is held to the same treatment as everything else:</p>
            <ul>
              <li>Scored against the same criteria and the same verified data.</li>
              <li>
                Ranked by fit to your requirements, with no placement boost of any
                kind.
              </li>
              <li>
                Excluded by an advisor, out loud, when it is the wrong answer for
                you.
              </li>
            </ul>

            <h2>What we do with your data</h2>
            <p>
              Registration asks for your name, company, work email and direct
              phone. Vendor pricing is commercially sensitive and shared with us on
              the understanding that it reaches genuine buyers rather than
              competitors — registration is how we honour that.
            </p>
            <p>
              We pass your details to a vendor only when you ask us to, or when you
              request a quote that requires it. See the{" "}
              <a href="/privacy">privacy policy</a> for the full detail.
            </p>

            <h2>What we will not do</h2>
            <ul>
              <li>Sell your contact details as leads.</li>
              <li>Accept payment for placement, ranking or visibility.</li>
              <li>Change rankings because a provider pays us.</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="pu-sec pu-sec-surface">
        <div className="pu-wrap">
          <SectionHead
            eyebrow="Check us on it"
            title="How to hold us to this"
            sub="Ask any advisor these questions directly. If an answer is ever evasive, that is a reportable problem and we want to know."
          />
          <ul className="pu-checks">
            <li>
              <i aria-hidden="true" />
              &ldquo;Do you earn more if I pick this vendor over that one?&rdquo;
            </li>
            <li>
              <i aria-hidden="true" />
              &ldquo;Is any system in this shortlist one you resell?&rdquo;
            </li>
            <li>
              <i aria-hidden="true" />
              &ldquo;What would make you tell me not to buy anything at all?&rdquo;
            </li>
          </ul>
        </div>
      </section>

      <CTA
        title="Any part of this unclear?"
        body="Ask us directly. We would rather answer an uncomfortable question than have you wonder about it."
        primary={{ label: "Contact us", href: "/contact" }}
        secondary={{ label: "Read the FAQ", href: "/faq" }}
      />
    </>
  );
}
