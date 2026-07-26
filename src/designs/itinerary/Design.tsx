import { DM_Sans, Space_Grotesk, Space_Mono } from "next/font/google";

import { ADVANTAGES, CASES, NAV, STATS, TOOLS, TRUST, VENDORS } from "../_content";
import "./styles.css";

const display = Space_Grotesk({ subsets: ["latin"], weight: ["500", "600", "700"] });
const body = DM_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-body" });
const mono = Space_Mono({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-mono" });

/**
 * Buying HRIS software has a real, ordered sequence — RFP, shortlist, demos,
 * negotiation, contract — so a boarding-pass / departure-board metaphor is
 * earned rather than decorative. The pass marks the buyer's current stop;
 * the board below shows the whole route with that stop lit up.
 */
const STAGES = [
  { code: "01", name: "RFP SENT", status: "ON TIME", active: false },
  { code: "02", name: "SHORTLIST (5)", status: "ON TIME", active: false },
  { code: "03", name: "DEMOS SCHEDULED", status: "ON TIME", active: false },
  { code: "04", name: "NEGOTIATION", status: "YOU ARE HERE", active: true },
  { code: "05", name: "CONTRACT SIGNED", status: "—", active: false },
] as const;

export default function Itinerary() {
  return (
    <div className={`it ${display.className} ${body.variable} ${mono.variable}`}>
      <header className="it-nav">
        <div className="it-wrap it-nav-in">
          <div className="it-logo">MatchMaker HR</div>
          <nav className="it-links">
            {NAV.map((n) => (
              <span key={n}>{n}</span>
            ))}
          </nav>
          <button className="it-btn it-ghost">Sign in</button>
          <button className="it-btn it-solid">Get started</button>
        </div>
      </header>

      <section className="it-wrap it-hero">
        <div className="it-hero-copy">
          <span className="it-eyebrow">BUYER-SIDE HRIS BROKERAGE</span>
          <h1 className="it-h1">Boarding starts the moment you request a demo.</h1>
          <p className="it-lede">
            Five real stops between an RFP and a signed contract. We&rsquo;re the advisor
            sitting next to you at every one &mdash; not the vendor working the gate.
          </p>

          <form className="it-form" action="#">
            <input
              className="it-input"
              type="email"
              placeholder="Work email"
              aria-label="Work email"
            />
            <button className="it-btn it-solid it-lg" type="submit">
              Start boarding
            </button>
          </form>
          <p className="it-fine">
            Free. The vendor pays our commission &mdash; the same rate whichever one you
            choose.
          </p>
        </div>

        <div className="it-hero-side">
          {/* SIGNATURE: the boarding pass */}
          <div className="it-pass">
            <div className="it-pass-main">
              <div className="it-pass-top">
                <span className="it-pass-brand">MATCHMAKER HR</span>
                <span className="it-pass-seat">SEAT &middot; NEGOTIATOR 1A</span>
              </div>

              <div className="it-cities">
                <div className="it-city">
                  <span className="it-city-k">FROM</span>
                  <span className="it-city-v">RFP SENT</span>
                </div>
                <span className="it-city-arrow" aria-hidden="true">
                  &rarr;
                </span>
                <div className="it-city it-city-to">
                  <span className="it-city-k">TO</span>
                  <span className="it-city-v">CONTRACT SIGNED</span>
                </div>
              </div>

              <div className="it-pass-fields">
                <span>PASSENGER &middot; YOU</span>
                <span>GATE &middot; YOUR ADVISOR</span>
                <span>REF &middot; MMHR-2291</span>
                <span>GROUP &middot; SHORTLIST</span>
              </div>
            </div>

            <div className="it-perf" aria-hidden="true">
              <span className="it-notch it-notch-l" />
              <span className="it-notch it-notch-r" />
            </div>

            <div className="it-pass-stub">
              <span>Benchmark your quote &rarr;</span>
            </div>
          </div>

          {/* Departure board */}
          <div className="it-board" role="table" aria-label="Buyer journey status">
            <div className="it-board-head">DEPARTURES &middot; YOUR ROUTE</div>
            {STAGES.map((s) => (
              <div
                className={`it-board-row${s.active ? " active" : ""}`}
                key={s.code}
              >
                <span className="it-board-code">{s.code}</span>
                <span className="it-board-name">{s.name}</span>
                <span className="it-board-status">{s.status}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="it-wrap it-wall">
        <span className="it-eyebrow">Carriers we fly</span>
        {VENDORS.slice(0, 12).map((v) => (
          <span className="it-wall-v" key={v}>
            {v}
          </span>
        ))}
        <span className="it-wall-v">+ 40 more</span>
      </div>

      <section className="it-sec">
        <div className="it-wrap">
          <div className="it-sec-h">
            <span className="it-eyebrow">Onboard amenities</span>
            <h2 className="it-h2">Everything you need for the flight</h2>
          </div>
          <div className="it-tools">
            {TOOLS.map((t, i) => (
              <article className="it-tool" key={t.key}>
                <div className="it-tool-n">{String(i + 1).padStart(2, "0")}</div>
                <h3>{t.name}</h3>
                <p>{t.blurb}</p>
                <small>{t.detail}</small>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="it-sec it-off">
        <div className="it-wrap">
          <div className="it-sec-h">
            <span className="it-eyebrow">The broker advantage</span>
            <h2 className="it-h2">A companion who&rsquo;s flown this route before</h2>
          </div>
          <div className="it-advs">
            {ADVANTAGES.map((a) => (
              <article className="it-adv" key={a.title}>
                <h3>{a.title}</h3>
                <p className="it-adv-lead">{a.lead}</p>
                <p>{a.body}</p>
                <ul className="it-pts">
                  {a.points.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="it-sec">
        <div className="it-wrap">
          <div className="it-sec-h">
            <span className="it-eyebrow">Method</span>
            <h2 className="it-h2">The same fare, every carrier</h2>
          </div>
          <div className="it-trust">
            {TRUST.map((t) => (
              <article className="it-tc" key={t.title}>
                <h3>{t.title}</h3>
                <p>{t.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <div className="it-wrap">
        <div className="it-stats">
          {STATS.map((s) => (
            <div key={s.label}>
              <div className="it-st-n">{s.n}</div>
              <div className="it-st-l">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      <section className="it-sec it-off">
        <div className="it-wrap">
          <div className="it-sec-h">
            <span className="it-eyebrow">Flight logs</span>
            <h2 className="it-h2">Completed itineraries</h2>
          </div>
          <div className="it-cases">
            {CASES.map((c) => (
              <article className="it-case" key={c.title}>
                <div className="it-case-n">{c.stat}</div>
                <div className="it-case-nl">{c.statLabel}</div>
                <h3>{c.title}</h3>
                <p>{c.body}</p>
                <span className="it-more">Flight log &rarr;</span>
              </article>
            ))}
          </div>
        </div>
      </section>

      <div className="it-wrap it-news">
        <div>
          <h2>The Departure Board</h2>
          <p>Where HRIS pricing is headed this month, in your inbox.</p>
        </div>
        <form className="it-form it-news-form" action="#">
          <input
            className="it-input"
            type="email"
            placeholder="Work email"
            aria-label="Work email for newsletter"
          />
          <button className="it-btn it-solid it-lg" type="submit">
            Subscribe
          </button>
        </form>
      </div>

      <footer className="it-foot">
        <div className="it-wrap">
          <div className="it-fgrid">
            <div>
              <div className="it-logo">MatchMaker HR</div>
              <p>
                Buyer-side HRIS brokerage. Free to buyers, paid the same rate by every
                vendor &mdash; and we say so when we&rsquo;re one of them.
              </p>
            </div>
            <div className="it-fc">
              <h4>For buyers</h4>
              <ul>
                <li>HRIS Marketplace</li>
                <li>Requirements Builder</li>
                <li>Advisory services</li>
                <li>Case studies</li>
              </ul>
            </div>
            <div className="it-fc">
              <h4>Why us</h4>
              <ul>
                <li>Broker model</li>
                <li>How we make money</li>
                <li>Scoring methodology</li>
                <li>FAQ</li>
              </ul>
            </div>
            <div className="it-fc">
              <h4>Resources</h4>
              <ul>
                <li>Blog</li>
                <li>HRIS Landscape Report</li>
                <li>Partner finder</li>
                <li>Contact</li>
              </ul>
            </div>
          </div>
          <div className="it-fbot">
            <span>&copy; 2026 MatchMaker HR</span>
            <span>Privacy &middot; Terms &middot; Commission disclosure</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
