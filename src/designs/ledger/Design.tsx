import { IBM_Plex_Mono, Karla, Spectral } from "next/font/google";

import "./styles.css";

const display = Spectral({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-display",
});
const body = Karla({ subsets: ["latin"] });
const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
});

/** Placeholder figures for layout evaluation — not claims. */
const LINES = [
  { item: "List price, 240 employees", year1: "129,600", term: "388,800" },
  { item: "Implementation (one-time)", year1: "34,000", term: "34,000" },
  { item: "Modules you were quoted but won't use", year1: "(18,400)", term: "(55,200)", out: true },
  { item: "Negotiated after benchmarking", year1: "(21,100)", term: "(63,300)", out: true },
];

export default function Ledger() {
  return (
    <div className={`d4 ${body.className} ${display.variable} ${mono.variable}`}>
      <div className="d4-wrap">
        <nav className="d4-nav">
          <div className="d4-logo">MatchMaker HR</div>
          <div className="d4-nav-links">
            <span>Platform</span>
            <span>How we&rsquo;re free</span>
            <span>Case studies</span>
            <span>Sign in</span>
          </div>
        </nav>

        <section className="d4-hero">
          <div>
            <div className="d4-kicker">Buyer-side HRIS brokerage</div>
            <h1 className="d4-h1">
              Know what the system should cost before the vendor tells you.
            </h1>
            <p className="d4-sub">
              We benchmark your quote against what comparable companies actually
              paid, strip out the modules you&rsquo;ll never turn on, and hand
              you the number to negotiate to.
            </p>

            <form className="d4-form" action="#">
              <input
                className="d4-input"
                type="email"
                placeholder="Work email"
                aria-label="Work email"
              />
              <button className="d4-btn" type="submit">
                Benchmark my quote
              </button>
            </form>
            <p className="d4-fine">
              Free for buyers. Providers pay a commission or referral fee. Terms
              can vary by provider.
            </p>
          </div>

          {/* Signature: the buyer's own ledger, in their own conventions. */}
          <div className="d4-ledger">
            <div className="d4-ledger-head">
              <div className="d4-ledger-title">Proposal review</div>
              <div className="d4-ledger-meta">240 EMP · 3-YR TERM</div>
            </div>
            <table className="d4-tbl">
              <thead>
                <tr>
                  <th>Line item</th>
                  <th>Year 1</th>
                  <th>3-yr term</th>
                </tr>
              </thead>
              <tbody>
                {LINES.map((l) => (
                  <tr key={l.item}>
                    <td>{l.item}</td>
                    <td className={l.out ? "d4-out" : undefined}>{l.year1}</td>
                    <td className={l.out ? "d4-out" : undefined}>{l.term}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>What you should pay</td>
                  <td>124,100</td>
                  <td>304,300</td>
                </tr>
              </tfoot>
            </table>
            <div className="d4-ledger-foot">
              Benchmarks drawn from verified pricing across 52 systems, refreshed
              monthly. Outflows in parentheses.
            </div>
          </div>
        </section>
      </div>

      <div className="d4-wrap">
        <section className="d4-band">
          <h2 className="d4-h2">How we&rsquo;re paid</h2>
          <p>
            The provider you choose pays us a commission or referral fee when you
            buy. Terms can vary by provider, so we disclose them before you decide.
          </p>
          <div className="d4-notes">
            <div className="d4-note">
              <div className="d4-note-k">Note 1</div>
              <h3>Provider terms, disclosed</h3>
              <p>
                We explain the applicable commission or referral arrangement before
                you decide.
              </p>
            </div>
            <div className="d4-note">
              <div className="d4-note-k">Note 2</div>
              <h3>One related party</h3>
              <p>
                We resell CBIZ Centrally HR. It is labelled wherever it appears
                and ranks on the same data as every other system.
              </p>
            </div>
            <div className="d4-note">
              <div className="d4-note-k">Note 3</div>
              <h3>No fee to the buyer</h3>
              <p>
                Not now, not at signature, not passed through in the price you
                pay the vendor.
              </p>
            </div>
          </div>
        </section>

        <section className="d4-stats">
          <div>
            <div className="d4-stat-n">$84.5k</div>
            <div className="d4-stat-l">Median 3-year saving</div>
          </div>
          <div>
            <div className="d4-stat-n">52</div>
            <div className="d4-stat-l">Systems benchmarked</div>
          </div>
          <div>
            <div className="d4-stat-n">310</div>
            <div className="d4-stat-l">Companies guided</div>
          </div>
          <div>
            <div className="d4-stat-n">74</div>
            <div className="d4-stat-l">Net promoter score</div>
          </div>
        </section>
      </div>
    </div>
  );
}
