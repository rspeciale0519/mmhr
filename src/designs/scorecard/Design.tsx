import localFont from "next/font/local";

import "./styles.css";

const retainedScorecardSans = localFont({
  src: [
    { path: "../../assets/fonts/instrument-sans/instrument-sans-normal-400-700-latin.woff2", weight: "400 700", style: "normal" },
  ],
  display: "swap",
  variable: "--font-sans-d1",
});
const sans = retainedScorecardSans;
const retainedScorecardMono = localFont({
  src: [
    { path: "../../assets/fonts/ibm-plex-mono/ibm-plex-mono-normal-400-latin.woff2", weight: "400", style: "normal" },
    { path: "../../assets/fonts/ibm-plex-mono/ibm-plex-mono-normal-500-latin.woff2", weight: "500", style: "normal" },
    { path: "../../assets/fonts/ibm-plex-mono/ibm-plex-mono-normal-600-latin.woff2", weight: "600", style: "normal" },
  ],
  display: "swap",
  variable: "--font-mono",
});
const mono = retainedScorecardMono;

/** Placeholder figures for layout evaluation — not claims. */
const MATCHES = [
  { name: "Rippling", note: "HR + IT + Finance", fit: 94, price: "$8–12", featured: false },
  { name: "CBIZ Centrally HR", note: "White-labelled UKG Ready", fit: 91, price: "$9–14", featured: true },
  { name: "Paylocity", note: "Mid-market payroll + HR", fit: 87, price: "$7–11", featured: false },
  { name: "BambooHR", note: "Core HR, light payroll", fit: 79, price: "$6–9", featured: false },
  { name: "Workday", note: "Enterprise suite", fit: 61, price: "$18–30", featured: false },
];

export default function Scorecard() {
  return (
    <div className={`d1 ${sans.className} ${mono.variable}`}>
      <div className="d1-wrap">
        <nav className="d1-nav">
          <div className="d1-logo">MatchMaker HR</div>
          <div className="d1-nav-links">
            <span>Platform</span>
            <span>How we&rsquo;re free</span>
            <span>Case studies</span>
            <span>Sign in</span>
          </div>
        </nav>

        <section className="d1-hero">
          <div>
            <div className="d1-eyebrow">HRIS selection, buyer-side</div>
            <h1 className="d1-h1">
              See how every HRIS scores against your requirements &mdash; before
              you take a single call.
            </h1>
            <p className="d1-sub">
              Tell us how your company actually works. We score all 50+ systems
              against it, show you verified pricing, and stay in your corner
              through the negotiation.
            </p>

            <form className="d1-form" action="#">
              <input
                className="d1-input"
                type="email"
                placeholder="Work email"
                aria-label="Work email"
              />
              <button className="d1-btn" type="submit">
                Get my matches
              </button>
            </form>
            <p className="d1-fineprint">
              Free for buyers. Providers pay a commission or referral fee. Terms
              can vary by provider.
            </p>
          </div>

          {/* Signature: the hero is the artifact the product produces. */}
          <div className="d1-card">
            <div className="d1-card-head">
              <div className="d1-card-title">Your matches</div>
              <div className="d1-card-meta">240 EMPLOYEES · MULTI-STATE · PAYROLL + BENEFITS + TIME</div>
            </div>
            <table className="d1-table">
              <thead>
                <tr>
                  <th>Vendor</th>
                  <th className="num">Fit</th>
                  <th className="num">$/emp/mo</th>
                </tr>
              </thead>
              <tbody>
                {MATCHES.map((m) => (
                  <tr key={m.name} className={m.featured ? "d1-featured" : undefined}>
                    <td>
                      <div className="d1-vendor">
                        {m.name}
                        {m.featured ? <span className="d1-tag">Our solution</span> : null}
                      </div>
                      <div className="d1-vendor-sub">{m.note}</div>
                    </td>
                    <td className="num">
                      <span className="d1-bar">
                        <span style={{ width: `${m.fit}%` }} />
                      </span>
                      <span className="d1-pct">{m.fit}%</span>
                    </td>
                    <td className="num">{m.price}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="d1-card-foot">
              Pricing verified within the last 30 days. Centrally HR is our own
              solution &mdash; labelled every time it appears.
            </div>
          </div>
        </section>
      </div>

      <div className="d1-wrap">
        <section className="d1-band">
          <div className="d1-band-head">
            <h2 className="d1-h2">Why this costs you nothing</h2>
            <p>
              The provider pays us a commission or referral fee when you buy. Terms
              can vary by provider, and we disclose them before you decide.
            </p>
          </div>
          <div className="d1-grid">
            <div className="d1-tile">
              <span className="d1-tile-k">01 / REQUIREMENTS</span>
              <h3>Say what you actually need</h3>
              <p>
                Tag ~200 HRIS features as must-have, nice-to-have, or irrelevant.
                Your answers drive every score you see.
              </p>
            </div>
            <div className="d1-tile">
              <span className="d1-tile-k">02 / EVALUATION</span>
              <h3>Score demos as they happen</h3>
              <p>
                Weighted scorecards your whole team fills in live, with the
                questions worth asking already written.
              </p>
            </div>
            <div className="d1-tile">
              <span className="d1-tile-k">03 / NEGOTIATION</span>
              <h3>Know what the price should be</h3>
              <p>
                Send us the proposal. We benchmark it against what comparable
                companies actually paid.
              </p>
            </div>
          </div>
        </section>

        <section className="d1-stats">
          <div>
            <div className="d1-stat-n">52</div>
            <div className="d1-stat-l">HRIS profiled and kept current</div>
          </div>
          <div>
            <div className="d1-stat-n">74</div>
            <div className="d1-stat-l">Net promoter score</div>
          </div>
          <div>
            <div className="d1-stat-n">310</div>
            <div className="d1-stat-l">Companies guided</div>
          </div>
          <div>
            <div className="d1-stat-n">$0</div>
            <div className="d1-stat-l">What buyers pay us</div>
          </div>
        </section>
      </div>
    </div>
  );
}
