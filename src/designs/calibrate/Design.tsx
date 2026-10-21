import localFont from "next/font/local";

import { ADVANTAGES, CASES, NAV, STATS, TOOLS, TRUST, VENDORS } from "../_content";
import "./styles.css";

const retainedCalibrateBody = localFont({
  src: [
    { path: "../../assets/fonts/figtree/figtree-normal-400-700-latin.woff2", weight: "400 700", style: "normal" },
  ],
  display: "swap",
});
const body = retainedCalibrateBody;
const retainedCalibrateMono = localFont({
  src: [
    { path: "../../assets/fonts/overpass-mono/overpass-mono-normal-400-700-latin.woff2", weight: "400 700", style: "normal" },
  ],
  display: "swap",
  variable: "--font-mono",
});
const mono = retainedCalibrateMono;

export default function Calibrate() {
  return (
    <div className={`ca ${body.className} ${mono.variable}`}>
      <header className="ca-nav">
        <div className="ca-wrap ca-nav-in">
          <div className="ca-logo">MatchMaker HR</div>
          <nav className="ca-links">
            {NAV.map((n) => (
              <span key={n}>{n}</span>
            ))}
          </nav>
          <div className="ca-nav-cta">
            <button className="ca-btn ca-ghost">Sign in</button>
            <button className="ca-btn ca-solid">Get started</button>
          </div>
        </div>
      </header>

      <section className="ca-hero">
        <div className="ca-wrap ca-hero-in">
          <div className="ca-hero-copy">
            <div className="ca-eyebrow">
              <i />
              ONE INSTRUMENT READING
            </div>
            <h1 className="ca-h1">Your quote, calibrated against the market.</h1>
            <p className="ca-lede">
              One instrument reading: where your number actually sits, not a
              vendor&rsquo;s word for it.
            </p>

            <form className="ca-form" action="#">
              <input
                className="ca-input"
                type="email"
                placeholder="Work email"
                aria-label="Work email"
              />
              <button className="ca-btn ca-solid ca-lg" type="submit">
                Calibrate my quote
              </button>
            </form>
            <p className="ca-fine">
              Free for buyers. Providers pay a commission or referral fee. Terms
              can vary by provider.
            </p>
          </div>

          {/* SIGNATURE: the calibration gauge */}
          <div className="ca-gauge-card">
            <div className="ca-gauge-head">
              <span>READING 01 / QUOTE VS. MARKET</span>
            </div>

            <svg
              className="ca-gauge-svg"
              viewBox="0 0 200 115"
              role="img"
              aria-label="Gauge showing the buyer's quote 30 percent above the verified market median"
            >
              <path
                d="M20,100 A80,80 0 0 1 180,100"
                fill="none"
                stroke="var(--line)"
                strokeWidth="10"
                strokeLinecap="round"
              />

              {/* zone ticks: below market / market / above market */}
              <line x1="49.1" y1="49.1" x2="37.8" y2="37.8" className="ca-tick" />
              <line x1="100" y1="28" x2="100" y2="12" className="ca-tick" />
              <line x1="150.9" y1="49.1" x2="162.2" y2="37.8" className="ca-tick" />

              <text x="38" y="70" className="ca-tick-label">
                BELOW MARKET
              </text>
              <text x="100" y="46" className="ca-tick-label" textAnchor="middle">
                MARKET
              </text>
              <text x="162" y="70" className="ca-tick-label" textAnchor="end">
                ABOVE MARKET
              </text>

              {/* verified market median — sits left of the top-center point */}
              <line x1="86" y1="30" x2="82" y2="22" className="ca-median-tick" />
              <text x="78" y="17" className="ca-median-label">
                MEDIAN
              </text>

              {/* needle: +50deg clockwise from straight-up lands in the
                  right-hand ABOVE MARKET third of the arc */}
              <line
                x1="100"
                y1="100"
                x2="100"
                y2="25"
                className="ca-needle"
                transform="rotate(50 100 100)"
              />
              <circle cx="100" cy="100" r="5" className="ca-pivot" />
            </svg>

            <div className="ca-readout">
              <span className="ca-readout-pill">+30% vs. verified median</span>
              <span className="ca-readout-sub">
                Your quote: $161,400 · Verified median: $124,100
              </span>
            </div>
          </div>
        </div>
      </section>

      <div className="ca-wrap ca-wall">
        <span className="ca-wall-lbl">Calibrated against</span>
        {VENDORS.slice(0, 12).map((v) => (
          <span className="ca-wall-v" key={v}>
            {v}
          </span>
        ))}
        <span className="ca-wall-v ca-wall-more">+ 40 more</span>
      </div>

      <section className="ca-sec">
        <div className="ca-wrap">
          <div className="ca-sec-head">
            <span className="ca-eyebrow-sm">The instrument set</span>
            <h2 className="ca-h2">Six tools, one reading each</h2>
          </div>
          <div className="ca-tools">
            {TOOLS.map((t, i) => (
              <article className="ca-tool" key={t.key}>
                <div className="ca-tool-n">T.{String(i + 1).padStart(2, "0")}</div>
                <h3>{t.name}</h3>
                <p>{t.blurb}</p>
                <small>{t.detail}</small>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="ca-sec ca-off">
        <div className="ca-wrap">
          <div className="ca-sec-head">
            <span className="ca-eyebrow-sm">The broker advantage</span>
            <h2 className="ca-h2">Precision a vendor can&rsquo;t offer</h2>
          </div>
          <div className="ca-adv">
            {ADVANTAGES.map((a, i) => (
              <article className="ca-adv-item" key={a.title}>
                <div className="ca-adv-n">{String(i + 1).padStart(2, "0")}</div>
                <div className="ca-adv-body">
                  <h3>{a.title}</h3>
                  <p>
                    <b>{a.lead}</b> {a.body}
                  </p>
                  <ul className="ca-pts">
                    {a.points.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="ca-sec">
        <div className="ca-wrap">
          <div className="ca-sec-head">
            <span className="ca-eyebrow-sm">Method</span>
            <h2 className="ca-h2">How the reading stays honest</h2>
          </div>
          <div className="ca-trust">
            {TRUST.map((t) => (
              <article className="ca-trust-item" key={t.title}>
                <span className="ca-trust-mark" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="9" />
                    <line x1="12" y1="12" x2="12" y2="6" />
                    <circle cx="12" cy="12" r="1.4" fill="var(--iceblue)" stroke="none" />
                  </svg>
                </span>
                <h3>{t.title}</h3>
                <p>{t.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="ca-sec ca-off">
        <div className="ca-wrap ca-stats">
          {STATS.map((s) => (
            <div className="ca-st" key={s.label}>
              <div className="ca-st-n">{s.n}</div>
              <div className="ca-st-l">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="ca-sec">
        <div className="ca-wrap">
          <div className="ca-sec-head">
            <span className="ca-eyebrow-sm">Readings from real buyers</span>
            <h2 className="ca-h2">What calibration finds</h2>
          </div>
          <div className="ca-cases">
            {CASES.map((c) => (
              <article className="ca-case" key={c.title}>
                <div className="ca-case-n">{c.stat}</div>
                <div className="ca-case-nl">{c.statLabel}</div>
                <h3>{c.title}</h3>
                <p>{c.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <div className="ca-wrap ca-news">
        <div className="ca-news-copy">
          <h2>Recalibrated</h2>
          <p>One market reading a month, straight to your inbox.</p>
        </div>
        <form className="ca-form ca-news-form" action="#">
          <input
            className="ca-input"
            type="email"
            placeholder="Work email"
            aria-label="Work email for newsletter"
          />
          <button className="ca-btn ca-solid ca-lg" type="submit">
            Subscribe
          </button>
        </form>
      </div>

      <footer className="ca-foot">
        <div className="ca-wrap">
          <div className="ca-fgrid">
            <div className="ca-fbrand">
              <div className="ca-logo">MatchMaker HR</div>
              <p>
                Buyer-side HRIS brokerage. Free for buyers. Providers pay a
                commission or referral fee. Terms can vary by provider.
              </p>
            </div>
            <div className="ca-fc">
              <h4>For buyers</h4>
              <ul>
                <li>HRIS Marketplace</li>
                <li>Requirements Builder</li>
                <li>Advisory services</li>
                <li>Case studies</li>
              </ul>
            </div>
            <div className="ca-fc">
              <h4>Why us</h4>
              <ul>
                <li>Broker model</li>
                <li>How we make money</li>
                <li>Scoring methodology</li>
                <li>FAQ</li>
              </ul>
            </div>
            <div className="ca-fc">
              <h4>Resources</h4>
              <ul>
                <li>Blog</li>
                <li>HRIS Landscape Report</li>
                <li>Partner finder</li>
                <li>Contact</li>
              </ul>
            </div>
          </div>
          <div className="ca-fbot">
            <span>© 2026 MatchMaker HR</span>
            <span>Privacy · Terms · Commission disclosure</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
