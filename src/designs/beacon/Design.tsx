import { Manrope, Sora } from "next/font/google";

import { ADVANTAGES, CASES, NAV, STATS, TOOLS, TRUST, VENDORS } from "../_content";
import "./styles.css";

const display = Sora({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-display",
});
const body = Manrope({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

export default function Beacon() {
  return (
    <div className={`b ${body.className} ${display.variable}`}>
      {/* nav */}
      <header className="b-nav">
        <div className="b-wrap b-nav-in">
          <div className="b-logo">
            <span className="b-mark">M</span>
            MatchMaker HR
          </div>
          <nav className="b-links">
            {NAV.map((n) => (
              <span key={n}>{n}</span>
            ))}
          </nav>
          <button className="b-btn b-ghost">Sign in</button>
          <button className="b-btn b-primary">Get started</button>
        </div>
      </header>

      {/* hero */}
      <section className="b-hero">
        <div className="b-wrap b-hero-in">
          <div>
            <div className="b-kick">Free for buyers · Always</div>
            <h1 className="b-h1">
              Buy your next HRIS with <em>someone on your side</em>.
            </h1>
            <p className="b-lede">
              You&rsquo;ll do this twice in your career. Your advisor has done it
              hundreds of times — and gets paid the same no matter which system
              you choose.
            </p>

            <form className="b-form" action="#">
              <input
                className="b-input"
                type="email"
                placeholder="Your work email"
                aria-label="Work email"
              />
              <button className="b-btn b-primary b-lg" type="submit">
                Meet your advisor
              </button>
            </form>
            <p className="b-micro">
              No fee, no upsell, no commitment. Cancel the conversation any time.
            </p>
          </div>

          {/* SIGNATURE: the advisor thread */}
          <div className="b-thread">
            <div className="b-thread-top">
              <span className="b-av">DK</span>
              <span className="b-who">
                <strong>Dana Keller</strong>
                <span>Your advisor · 11 yrs in HRIS</span>
              </span>
              <span className="b-live">
                <i />
                Online
              </span>
            </div>

            <div className="b-msgs">
              <div className="b-msg b-msg-you">
                Paycom quoted us $161k/yr for 240 people. Is that normal?
              </div>
              <div className="b-msg b-msg-adv">
                It&rsquo;s about <b>30% above</b>{" "}
                what companies your size paid last quarter. Two of the modules in
                there almost nobody turns on. Send me the PDF and I&rsquo;ll mark
                it up.
              </div>
              <div className="b-msg b-msg-you">Just sent it 🙏</div>
            </div>

            <div className="b-quote">
              <div className="b-quote-h">Proposal review · 240 employees</div>
              <div className="b-qline">
                <span>As quoted, year 1</span>
                <b>$161,400</b>
              </div>
              <div className="b-qline">
                <span>Modules you won&rsquo;t use</span>
                <b>−$18,400</b>
              </div>
              <div className="b-qline win">
                <span>Benchmark says you should pay</span>
                <b>$124,100</b>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* vendor wall */}
      <section className="b-wall">
        <div className="b-wall-l">Every system worth considering — scored the same way</div>
        <div className="b-wall-mask">
          <div className="b-wall-row">
            {[...VENDORS, ...VENDORS].map((v, i) => (
              <span className="b-vlogo" key={`${v}-${i}`}>
                {v}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* tools */}
      <section className="b-sec">
        <div className="b-wrap">
          <div className="b-head">
            <div className="b-eye">The platform</div>
            <h2 className="b-h2">Everything a consultant brings. None of the invoice.</h2>
            <p className="b-sub">
              Six tools your whole buying committee works from — and an advisor
              who actually reads the proposals.
            </p>
          </div>
          <div className="b-tools">
            {TOOLS.map((t, i) => (
              <article className="b-tool" key={t.key}>
                <div className="b-tico">{String(i + 1).padStart(2, "0")}</div>
                <h3>{t.name}</h3>
                <p>{t.blurb}</p>
                <small>{t.detail}</small>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* advantages */}
      <section className="b-sec b-sand">
        <div className="b-wrap">
          <div className="b-head">
            <div className="b-eye">The broker advantage</div>
            <h2 className="b-h2">The other side of the table has done this a thousand times</h2>
            <p className="b-sub">So has yours, now.</p>
          </div>

          {ADVANTAGES.map((a, i) => (
            <div className="b-adv" key={a.title}>
              <div className="b-adv-copy">
                <h3>{a.title}</h3>
                <p>
                  <b>{a.lead}</b> {a.body}
                </p>
                <ul className="b-pts">
                  {a.points.map((p) => (
                    <li key={p}>
                      <span className="b-tick">✓</span>
                      {p}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="b-panel">
                {i === 0 ? (
                  <>
                    <div className="b-panel-h">Your matches · 240 employees</div>
                    {[
                      ["Rippling", 94, false],
                      ["CBIZ Centrally HR", 91, true],
                      ["Paylocity", 87, false],
                      ["BambooHR", 79, false],
                    ].map(([name, fit, feat]) => (
                      <div className="b-prow" key={String(name)}>
                        <span>
                          {String(name)}
                          {feat ? <span className="b-feat-tag">Ours</span> : null}
                        </span>
                        <span>
                          <span className="b-mini">
                            <i style={{ width: `${fit}%` }} />
                          </span>
                          {String(fit)}%
                        </span>
                      </div>
                    ))}
                  </>
                ) : i === 1 ? (
                  <>
                    <div className="b-panel-h">Scorecard · who scored what</div>
                    {[
                      ["Dana · HR", "92"],
                      ["Marcus · Finance", "78"],
                      ["Priya · IT", "85"],
                      ["Committee average", "85"],
                    ].map(([k, v]) => (
                      <div className="b-prow" key={k}>
                        <span>{k}</span>
                        <span>{v}</span>
                      </div>
                    ))}
                  </>
                ) : (
                  <>
                    <div className="b-panel-h">Advisor · this week</div>
                    {[
                      ["Proposals reviewed", "3"],
                      ["Avg. reply time", "2h 10m"],
                      ["Negotiation calls", "1"],
                      ["Saved vs. first quote", "$37,300"],
                    ].map(([k, v]) => (
                      <div className="b-prow" key={k}>
                        <span>{k}</span>
                        <span>{v}</span>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* trust */}
      <section className="b-sec">
        <div className="b-wrap">
          <div className="b-head">
            <div className="b-eye">Free &amp; trusted</div>
            <h2 className="b-h2">How we can promise this and mean it</h2>
          </div>
          <div className="b-trust">
            {TRUST.map((t, i) => (
              <article className="b-tcard" key={t.title}>
                <div className="b-tnum">No. {i + 1}</div>
                <h3>{t.title}</h3>
                <p>{t.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* stats */}
      <section className="b-wrap" style={{ paddingBottom: 96 }}>
        <div className="b-stats">
          {STATS.map((s) => (
            <div key={s.label}>
              <div className="b-stat-n">{s.n}</div>
              <div className="b-stat-l">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* cases */}
      <section className="b-sec b-sand">
        <div className="b-wrap">
          <div className="b-head">
            <div className="b-eye">Customer stories</div>
            <h2 className="b-h2">People who stopped being sold to</h2>
          </div>
          <div className="b-cases">
            {CASES.map((c) => (
              <article className="b-case" key={c.title}>
                <div className="b-case-n">{c.stat}</div>
                <div className="b-case-nl">{c.statLabel}</div>
                <h3>{c.title}</h3>
                <p>{c.body}</p>
                <span className="b-read">Read the story →</span>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* newsletter */}
      <section className="b-wrap" style={{ padding: "96px 32px" }}>
        <div className="b-news">
          <div>
            <h2>The HRIS Download</h2>
            <p>
              Pricing moves, vendor gossip, and what buyers are actually picking.
              Monthly. Unsubscribe whenever.
            </p>
          </div>
          <form className="b-form" action="#" style={{ maxWidth: "none" }}>
            <input
              className="b-input"
              type="email"
              placeholder="Your work email"
              aria-label="Work email for newsletter"
            />
            <button className="b-btn b-primary b-lg" type="submit">
              Subscribe
            </button>
          </form>
        </div>
      </section>

      {/* footer */}
      <footer className="b-foot">
        <div className="b-wrap">
          <div className="b-fgrid">
            <div>
              <div className="b-logo">
                <span className="b-mark">M</span>
                MatchMaker HR
              </div>
              <p>
                Buyer-side HRIS brokerage. Free for buyers. Providers pay a
                commission or referral fee. Terms can vary by provider.
              </p>
            </div>
            <div className="b-fcol">
              <h4>For buyers</h4>
              <ul>
                <li>HRIS Marketplace</li>
                <li>Requirements Builder</li>
                <li>Advisory services</li>
                <li>Case studies</li>
              </ul>
            </div>
            <div className="b-fcol">
              <h4>Why us</h4>
              <ul>
                <li>Broker model</li>
                <li>How we make money</li>
                <li>Scoring methodology</li>
                <li>FAQ</li>
              </ul>
            </div>
            <div className="b-fcol">
              <h4>Resources</h4>
              <ul>
                <li>Blog</li>
                <li>HRIS Landscape Report</li>
                <li>Partner finder</li>
                <li>Contact</li>
              </ul>
            </div>
          </div>
          <div className="b-fbot">
            <span>© 2026 MatchMaker HR</span>
            <span>Privacy · Terms · Commission disclosure</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
