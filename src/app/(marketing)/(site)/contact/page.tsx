import { getMarketingPageMetadata } from "@/lib/site-metadata";
import { PageHero, SectionHead } from "../../_site/PageParts";
import ContactForm from "./contact-form";

export const metadata = getMarketingPageMetadata(
  "/contact",
  "Contact — MatchMaker HR",
  "Talk to an HRIS advisor, send a proposal for benchmarking, or ask a question about the broker model.",
);

const REASONS = [
  {
    k: "BENCHMARK A QUOTE",
    h: "You have a proposal in hand",
    p: "Send it over and we will tell you what comparable companies paid, which terms are unusual, and where there is room to move. No obligation to run the rest of your evaluation with us.",
  },
  {
    k: "START AN EVALUATION",
    h: "You are early and scoping",
    p: "An advisor will walk you through requirements first. Most committees find this is where the real disagreements surface.",
  },
  {
    k: "ASK ABOUT THE MODEL",
    h: "You want to check our incentives",
    p: "Reasonable. Ask us about provider commission or referral arrangements, or the CBIZ Centrally HR affiliation.",
  },
];

export default function ContactPage() {
  return (
    <>
      <PageHero
        eyebrow="Contact"
        title="Talk to an advisor."
        lede="No cost, and no expectation that you run your selection with us. Plenty of the conversations we have are one-off second opinions on a quote."
      />

      <section className="co-cg" style={{ paddingBottom: 80 }}>
        <div className="co-gl co-card">
          <SectionHead title="Send us a note" />
          <ContactForm />
        </div>
        <aside>
          <SectionHead title="What people contact us about" />
          {REASONS.map((r) => (
            <article className="co-gl co-side-note" key={r.k}>
              <span className="co-lbl">{r.k}</span>
              <b>{r.h}</b>
              <p>{r.p}</p>
            </article>
          ))}
        </aside>
      </section>
    </>
  );
}
