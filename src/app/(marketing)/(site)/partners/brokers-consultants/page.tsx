import { getMarketingPageMetadata } from "@/lib/site-metadata";
import { CTA, PageHero, SectionHead } from "../../../_site/PageParts";

export const metadata = getMarketingPageMetadata(
  "/partners/brokers-consultants",
  "For brokers & consultants — MatchMaker HR",
  "Refer HRIS selection work to a specialist team, or use our verified pricing data inside your own advisory engagements.",
);

const WAYS = [
  {
    k: "01",
    h: "Refer the selection",
    p: "Hand the HRIS evaluation to us and stay in the loop. Your client does not pay MMHR a fee, and you keep the relationship you already have with them.",
  },
  {
    k: "02",
    h: "Co-advise",
    p: "You run the client relationship and the change management; we bring the market data, the scoring and the proposal benchmarking.",
  },
  {
    k: "03",
    h: "Use the data",
    p: "Benefits brokers and HR consultancies use our verified pricing inside their own engagements rather than rebuilding a research function.",
  },
];

export default function BrokersConsultantsPage() {
  return (
    <>
      <PageHero
        eyebrow="Partners · Brokers & consultants"
        title="HRIS selection, without building a research team for it."
        lede="Benefits brokers, PEOs and HR consultancies get asked about systems constantly. Keeping current pricing on 52 platforms is a full-time function — this is a way to answer well without staffing one."
      />

      <section className="pu-sec">
        <div className="pu-wrap">
          <SectionHead
            eyebrow="Three ways in"
            title="How partners work with us"
            sub="Pick whichever fits your practice. None require your client to pay MMHR a fee."
          />
          <div className="pu-g3">
            {WAYS.map((w) => (
              <div className="pu-cell" key={w.k}>
                <div className="pu-cell-k">{w.k}</div>
                <h3>{w.h}</h3>
                <p>{w.p}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="pu-sec pu-sec-surface">
        <div className="pu-wrap">
          <SectionHead title="Why the neutrality matters to you" />
          <div className="pu-prose">
            <p>
              If you refer a client to an advisor whose fee scales with contract
              value, and they end up over-buying, that lands on your
              relationship rather than ours.
            </p>
            <p>
              Providers may use different commission or referral arrangements. We
              disclose the relevant arrangement, and our recommendations follow
              the client&rsquo;s requirements and verified data. That is the property
              worth checking in any referral partner, including this one — the{" "}
              <a href="/transparency">full disclosure is here</a>.
            </p>
          </div>
        </div>
      </section>

      <CTA
        title="Become a referral partner"
        body="Tell us about your practice and the clients you advise, and we will set up the arrangement."
        primary={{ label: "Contact us", href: "/contact" }}
        secondary={{ label: "Broker model", href: "/broker-model" }}
      />
    </>
  );
}
