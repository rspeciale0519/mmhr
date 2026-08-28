import type { Metadata } from "next";

import { PageHero, SectionHead } from "../../_site/PageParts";

export const metadata: Metadata = {
  title: "Contact — MatchMaker HR",
  description:
    "Talk to an HRIS advisor, send a proposal for benchmarking, or ask a question about the broker model.",
};

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
    p: "Reasonable. Ask us anything about the commission, the flat rate, or the CBIZ Centrally HR affiliation.",
  },
];

// The form is not wired to a handler yet. Keep every control disabled so
// personal data cannot enter a query string, browser history, or access log.
export default function ContactPage() {
  return (
    <>
      <PageHero
        eyebrow="Contact"
        title="Talk to an advisor."
        lede="No cost, and no expectation that you run your selection with us. Plenty of the conversations we have are one-off second opinions on a quote."
      />

      <section className="pu-sec">
        <div className="pu-wrap pu-contact">
          <div>
            <SectionHead title="Send us a note" />
            <form className="pu-fieldset" aria-describedby="contact-form-status">
              <fieldset className="contents" disabled>
                <div className="pu-field">
                  <label htmlFor="c-name">Full name</label>
                  <input className="pu-input" id="c-name" name="name" required />
                </div>
                <div className="pu-field">
                  <label htmlFor="c-company">Company</label>
                  <input
                    className="pu-input"
                    id="c-company"
                    name="company"
                    required
                  />
                </div>
                <div className="pu-field">
                  <label htmlFor="c-email">Work email</label>
                  <input
                    className="pu-input"
                    id="c-email"
                    name="email"
                    type="email"
                    required
                  />
                </div>
                <div className="pu-field">
                  <label htmlFor="c-size">Company size</label>
                  <select
                    className="pu-input"
                    id="c-size"
                    name="size"
                    defaultValue=""
                  >
                    <option value="" disabled>
                      Select a range
                    </option>
                    <option>Under 100</option>
                    <option>100–500</option>
                    <option>500–1,000</option>
                    <option>1,000–5,000</option>
                    <option>Over 5,000</option>
                  </select>
                </div>
                <div className="pu-field">
                  <label htmlFor="c-msg">What can we help with?</label>
                  <textarea
                    className="pu-input"
                    id="c-msg"
                    name="message"
                    rows={5}
                  />
                </div>
                <button className="pu-btn pu-solid pu-lg" type="submit">
                  Send
                </button>
              </fieldset>
              <p className="pu-fine" id="contact-form-status" role="status">
                Online contact is not active yet. Do not enter personal
                information.
              </p>
              <p className="pu-fine">
                We use your details to reply and to verify you are a buyer rather
                than a competitor. We never sell them.
              </p>
            </form>
          </div>

          <aside>
            <SectionHead title="What people contact us about" />
            <div className="pu-cards">
              {REASONS.map((r) => (
                <article className="pu-pcard" key={r.k}>
                  <div className="pu-cell-k">{r.k}</div>
                  <h3>{r.h}</h3>
                  <p>{r.p}</p>
                </article>
              ))}
            </div>
          </aside>
        </div>
      </section>
    </>
  );
}
