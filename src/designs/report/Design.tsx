import localFont from "next/font/local";

import { ADVANTAGES, CASES, NAV, STATS, TOOLS, TRUST, VENDORS } from "../_content";
import "./styles.css";

const retainedReportSans = localFont({
  src: [
    { path: "../../assets/fonts/libre-franklin/libre-franklin-normal-400-700-latin.woff2", weight: "400 700", style: "normal" },
  ],
  display: "swap",
});
const sans = retainedReportSans;
const retainedReportMono = localFont({
  src: [
    { path: "../../assets/fonts/chivo-mono/chivo-mono-normal-400-500-latin.woff2", weight: "400 500", style: "normal" },
  ],
  display: "swap",
  variable: "--font-mono",
});
const mono = retainedReportMono;

/**
 * A price distribution for comparable companies, with the reader's own quote
 * marked. Placeholder shape — the real one is computed from verified pricing.
 * `h` is bar height (% of plot); `you` marks the reader's bucket.
 */
const DIST = [
  { h: 8 },
  { h: 20 },
  { h: 38 },
  { h: 62 },
  { h: 88 },
  { h: 100 },
  { h: 76 },
  { h: 52 },
  { h: 34 },
  { h: 44, you: true },
  { h: 18 },
  { h: 9 },
];

/**
 * The median is a price, so it sits at a position on the x-axis. Axis runs
 * $90k–$180k, median $124k → (124 − 90) / (180 − 90) ≈ 38% from the left.
 */
const MEDIAN_LEFT = 38;

export default function Report() {
  return (
    <div className={`re ${sans.className} ${mono.variable}`}>
      <header className="re-nav">
        <div className="re-wrap re-nav-in">
          <div className="re-logo">MatchMaker HR</div>
          <nav className="re-links">
            {NAV.map((n) => (
              <span key={n}>{n}</span>
            ))}
          </nav>
          <button className="re-btn re-line">Sign in</button>
          <button className="re-btn re-solid">Get started</button>
        </div>
      </header>

      <section className="re-wrap re-hero">
        <div>
          <span className="re-lbl">Buyer-side HRIS brokerage</span>
          {/* 30% is not a decoration: $161k against a $124k median is +29.8%.
              The chart, the headline, and the proposal panel below all have to
              agree, or the whole direction is undermined by its own numbers. */}
          <h1 className="re-h1">
            Your quote is <em>30% above</em> what companies your size actually
            paid.
          </h1>
          <p className="re-lede">
            We know, because we track what all 52 systems really cost — not the
            list price, the settled price. Send us your proposal and we&rsquo;ll
            show you exactly where it sits.
          </p>

          <form className="re-form" action="#">
            <input
              className="re-input"
              type="email"
              placeholder="Work email"
              aria-label="Work email"
            />
            <button className="re-btn re-solid re-lg" type="submit">
              Benchmark my quote
            </button>
          </form>
          <p className="re-fine">
            Free for buyers. Providers pay a commission or referral fee. Terms
            can vary by provider.
          </p>
        </div>

        {/* SIGNATURE: the distribution, with the reader's quote marked */}
        <figure className="re-chart">
          <div className="re-chart-h">
            <span className="re-chart-t">What comparable companies paid</span>
            <span className="re-lbl">n = 214</span>
          </div>
          <p className="re-chart-s">
            Mid-market HRIS, 200–300 employees, payroll + benefits + time.
            Settled annual cost, last 12 months.
          </p>

          <div className="re-plot">
            <div
              className="re-median"
              style={{ left: `${MEDIAN_LEFT}%` }}
              aria-hidden="true"
            >
              <span className="re-median-l">Median $124k</span>
            </div>

            {DIST.map((d, i) => (
              <div className={`re-col${d.you ? " you" : ""}`} key={i}>
                {d.you ? (
                  <span className="re-you-flag">Your quote $161k</span>
                ) : null}
                <i style={{ height: `${d.h}%` }} />
              </div>
            ))}
          </div>

          <div className="re-axis">
            <span>$90k</span>
            <span>$120k</span>
            <span>$150k</span>
            <span>$180k</span>
          </div>

          <figcaption className="re-chart-f">
            <span className="re-key">
              <i className="b" />
              Comparable companies
            </span>
            <span className="re-key">
              <i className="o" />
              Where your quote lands
            </span>
          </figcaption>
        </figure>
      </section>

      <div className="re-wrap re-wall">
        <span className="re-lbl">Tracked</span>
        {VENDORS.slice(0, 12).map((v) => (
          <span className="re-wall-v" key={v}>
            {v}
          </span>
        ))}
        <span className="re-wall-v">+ 40 more</span>
      </div>

      <section className="re-sec">
        <div className="re-wrap">
          <div className="re-sec-h">
            <span className="re-lbl">01 — The platform</span>
            <h2 className="re-h2">Six tools, one process</h2>
            <p className="re-sub">
              Requirements, scoring, planning, and a human who has run hundreds
              of these — all of it feeding the same data set.
            </p>
          </div>
          <div className="re-tools">
            {TOOLS.map((t, i) => (
              <article className="re-tool" key={t.key}>
                <div className="re-tool-n">
                  {String(i + 1).padStart(2, "0")} / {t.name.toUpperCase()}
                </div>
                <h3>{t.name}</h3>
                <p>{t.blurb}</p>
                <small>{t.detail}</small>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="re-sec re-off">
        <div className="re-wrap">
          <div className="re-sec-h">
            <span className="re-lbl">02 — The broker advantage</span>
            <h2 className="re-h2">A number is only as good as the data behind it</h2>
            <p className="re-sub">
              Every figure we show you traces back to a source and a capture
              date. Nothing is a vibe.
            </p>
          </div>

          {ADVANTAGES.map((a, i) => (
            <div className={`re-adv${i % 2 === 1 ? " flip" : ""}`} key={a.title}>
              <div className="re-adv-copy">
                <span className="re-lbl">Figure {i + 2}</span>
                <h3>{a.title}</h3>
                <p>
                  <b>{a.lead}</b> {a.body}
                </p>
                <ul className="re-pts">
                  {a.points.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </div>

              <div className="re-panel">
                {i === 0 ? (
                  <>
                    <div className="re-panel-h">Verified pricing · $/emp/mo</div>
                    {[
                      ["BambooHR", 30, "$6–9"],
                      ["Paylocity", 37, "$7–11"],
                      ["Rippling", 40, "$8–12"],
                      ["Workday", 100, "$18–30"],
                    ].map(([k, w, v]) => (
                      <div className="re-hrow" key={String(k)}>
                        <span>{String(k)}</span>
                        <span className="re-hbar">
                          <i style={{ width: `${w}%` }} />
                        </span>
                        <span className="re-hval">{String(v)}</span>
                      </div>
                    ))}
                  </>
                ) : i === 1 ? (
                  <>
                    <div className="re-panel-h">Scorecard · payroll depth</div>
                    {[
                      ["Dana — HR", 92, "92"],
                      ["Marcus — fin", 78, "78"],
                      ["Priya — IT", 85, "85"],
                      ["Committee", 85, "85"],
                    ].map(([k, w, v], j) => (
                      <div className="re-hrow" key={String(k)}>
                        <span>{String(k)}</span>
                        <span className={`re-hbar${j === 3 ? " o" : ""}`}>
                          <i style={{ width: `${w}%` }} />
                        </span>
                        <span className="re-hval">{String(v)}</span>
                      </div>
                    ))}
                  </>
                ) : (
                  <>
                    <div className="re-panel-h">Proposal review · 3-yr term</div>
                    <div className="re-prow">
                      <span>As quoted</span>
                      <span>$388,800</span>
                    </div>
                    <div className="re-prow">
                      <span>Modules never activated</span>
                      <span>−$55,200</span>
                    </div>
                    <div className="re-prow">
                      <span>Benchmark adjustment</span>
                      <span>−$63,300</span>
                    </div>
                    <div className="re-prow tot">
                      <span>What you should pay</span>
                      <span>$304,300</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="re-sec">
        <div className="re-wrap">
          <div className="re-sec-h">
            <span className="re-lbl">03 — Method</span>
            <h2 className="re-h2">How we are paid, and why it can&rsquo;t bias the data</h2>
          </div>
          <div className="re-trust">
            {TRUST.map((t, i) => (
              <article className="re-tc" key={t.title}>
                <span className="re-lbl">Note {i + 1}</span>
                <h3>{t.title}</h3>
                <p>{t.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <div className="re-wrap">
        <div className="re-stats">
          {STATS.map((s) => (
            <div key={s.label}>
              <div className="re-st-n">{s.n}</div>
              <div className="re-st-l">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      <section className="re-sec re-off">
        <div className="re-wrap">
          <div className="re-sec-h">
            <span className="re-lbl">04 — Evidence</span>
            <h2 className="re-h2">What the benchmark is worth in practice</h2>
          </div>
          <div className="re-cases">
            {CASES.map((c) => (
              <article className="re-case" key={c.title}>
                <div className="re-case-n">{c.stat}</div>
                <div className="re-case-nl">{c.statLabel}</div>
                <h3>{c.title}</h3>
                <p>{c.body}</p>
                <span className="re-more">Read →</span>
              </article>
            ))}
          </div>
        </div>
      </section>

      <div className="re-wrap re-news">
        <div>
          <h2>The HRIS Download</h2>
          <p>
            Pricing moves, vendor changes, and what buyers actually paid last
            month. Monthly, and mostly numbers.
          </p>
        </div>
        <form className="re-form" action="#" style={{ maxWidth: "none" }}>
          <input
            className="re-input"
            type="email"
            placeholder="Work email"
            aria-label="Work email for newsletter"
          />
          <button className="re-btn re-solid re-lg" type="submit">
            Subscribe
          </button>
        </form>
      </div>

      <footer className="re-foot">
        <div className="re-wrap">
          <div className="re-fgrid">
            <div>
              <div className="re-logo">MatchMaker HR</div>
              <p>
                Buyer-side HRIS brokerage. Free for buyers. Providers pay a
                commission or referral fee. Terms can vary by provider.
              </p>
            </div>
            <div className="re-fc">
              <h4>For buyers</h4>
              <ul>
                <li>HRIS Marketplace</li>
                <li>Requirements Builder</li>
                <li>Advisory services</li>
                <li>Case studies</li>
              </ul>
            </div>
            <div className="re-fc">
              <h4>Why us</h4>
              <ul>
                <li>Broker model</li>
                <li>How we make money</li>
                <li>Scoring methodology</li>
                <li>FAQ</li>
              </ul>
            </div>
            <div className="re-fc">
              <h4>Resources</h4>
              <ul>
                <li>Blog</li>
                <li>HRIS Landscape Report</li>
                <li>Partner finder</li>
                <li>Contact</li>
              </ul>
            </div>
          </div>
          <div className="re-fbot">
            <span>© 2026 MatchMaker HR</span>
            <span>Privacy · Terms · Commission disclosure</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
