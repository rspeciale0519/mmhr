import { getMarketingPageMetadata } from "@/lib/site-metadata";
import { CTA, PageHero, SectionHead } from "../../../_site/PageParts";

export const metadata = getMarketingPageMetadata(
  "/resources/partner-finder",
  "HR service partner finder — MatchMaker HR",
  "Find implementation partners, benefits brokers, payroll bureaux and fractional HR support, filtered by system and region.",
);

const CATEGORIES = [
  {
    k: "IMPLEMENTATION",
    h: "Implementation partners",
    p: "The firms that actually configure and migrate. Filtered by the system you selected and by whether they have done your industry before.",
  },
  {
    k: "BENEFITS",
    h: "Benefits brokers",
    p: "Independent brokers for medical, dental and ancillary lines, where the HRIS decision and the benefits decision interact.",
  },
  {
    k: "PAYROLL",
    h: "Payroll bureaux",
    p: "Managed payroll providers for companies that want the system without running it in house.",
  },
  {
    k: "FRACTIONAL",
    h: "Fractional HR",
    p: "Interim and part-time HR leadership, which is often who ends up owning an implementation at smaller companies.",
  },
];

export default function PartnerFinderPage() {
  return (
    <>
      <PageHero
        eyebrow="Resources · Directory"
        title="The people who make the system actually work."
        lede="Picking the platform is roughly half the decision. Who implements it, and who runs it afterwards, decides whether the thing you bought resembles the thing you were shown."
      />

      <section className="pu-sec">
        <div className="pu-wrap">
          <SectionHead eyebrow="Categories" title="What you can search" />
          <div className="pu-g2">
            {CATEGORIES.map((c) => (
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
          <SectionHead title="How partners are listed" />
          <div className="pu-prose">
            <p>
              Listings are not paid. Partners appear because buyers we have worked
              with have used them and reported back, and they are filtered by the
              systems they have genuinely delivered rather than the ones they list
              on their website.
            </p>
            <p>
              Ask us about any referral arrangement before you proceed. If a
              partner is wrong for your project, an advisor will say so — the same
              as with the systems themselves.
            </p>
          </div>
        </div>
      </section>

      <CTA
        title="Find a partner"
        body="Search the directory by system, region and specialism once you have an account."
        primary={{ label: "Get started", href: "/sign-up" }}
        secondary={{ label: "Advisory services", href: "/services" }}
      />
    </>
  );
}
