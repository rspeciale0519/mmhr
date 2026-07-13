import { Plus_Jakarta_Sans } from "next/font/google";

import { ADVANTAGES, CASES, NAV, STATS, TOOLS, TRUST, VENDORS } from "../_content";
import "./styles.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const MATCHES = [
  { name: "Rippling", note: "HR + IT + Finance", fit: 94, price: "$8–12", feat: false },
  { name: "CBIZ Centrally HR", note: "White-labelled UKG Ready", fit: 91, price: "$9–14", feat: true },
  { name: "Paylocity", note: "Mid-market payroll + HR", fit: 87, price: "$7–11", feat: false },
  { name: "BambooHR", note: "Core HR, light payroll", fit: 79, price: "$6–9", feat: false },
];

export default function Harbor() {
  return (
    <div className={`h ${jakarta.className}`}>
      {/* nav */}
      <header className="h-nav">
        <div className="h-wrap h-nav-in">
          <div className="h-logo">
            <span className="h-mark">M</span>
            MatchMaker HR
          </div>
          <nav className="h-links">
            {NAV.map((n) => (
              <span key={n}>{n}</span>
            ))}
          </nav>
          <div className="h-nav-cta">
            <button className="h-btn h-btn-ghost">Sign in</button>
            <button className="h-btn h-btn-primary">Get started</button>
          </div>
        </div>
      </header>

      {/* hero */}
      <section className="h-hero">
        <div className="h-wrap h-hero-in">
          <div>
            <div className="h-pill">
              <b>FREE</b> The vendor pays us — never you
            </div>
            <h1 className="h-h1">
              The easiest way to buy <span>HR software</span>.
            </h1>
            <p className="h-lede">
              Research, evaluate, and select the right HRIS — with verified
              pricing, a scoring process your whole team can run, and an expert
              in your corner the entire way.
            </p>

            <form className="h-form" action="#">
              <input
                className="h-input"
                type="email"
                placeholder="Your work email"
                aria-label="Work email"
              />
              <button className="h-btn h-btn-primary h-btn-lg" type="submit">
                See my matches
              </button>
            </form>
            <p className="h-micro">
              <span className="h-dot" />
              Takes 4 minutes · No sales calls unless you ask for one
            </p>
          </div>

          {/* SIGNATURE: the product's real output, not a screenshot */}
          <div className="h-card">
            <div className="h-card-top">
              <span className="h-card-title">Your matches</span>
              <span className="h-chip">240 employees · Multi-state</span>
            </div>
            {MATCHES.map((m) => (
              <div className={`h-row${m.feat ? " h-row-feat" : ""}`} key={m.name}>
                <div className="h-vend">
                  <span>
                    {m.name}
                    {m.feat ? <span className="h-tagline">Our solution</span> : null}
                    <small>{m.note}</small>
                  </span>
                </div>
                <div className="h-meter">
                  <span className="h-track">
                    <i className="h-fill" style={{ width: `${m.fit}%` }} />
                  </span>
                  <span className="h-pct">{m.fit}%</span>
                </div>
                <div className="h-price">{m.price}</div>
              </div>
            ))}
            <div className="h-card-foot">
              Pricing verified within 30 days · per employee / month
            </div>
          </div>
        </div>
      </section>

      {/* vendor marquee */}
      <section className="h-marq">
        <div className="h-marq-l">Every system worth considering</div>
        <div className="h-track-wrap">
          <div className="h-marq-row">
            {[...VENDORS, ...VENDORS].map((v, i) => (
              <span className="h-vlogo" key={`${v}-${i}`}>
                {v}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* six tools */}
      <section className="h-sec">
        <div className="h-wrap">
          <div className="h-head-c">
            <div className="h-eye">The platform</div>
            <h2 className="h-h2">Six tools. One buying process.</h2>
            <p className="h-sub">
              Everything a consultant would bring to an HRIS selection — except
              you keep it, and it costs you nothing.
            </p>
          </div>
          <div className="h-tools">
            {TOOLS.map((t, i) => (
              <article className="h-tool" key={t.key}>
                <div className="h-tool-n">{String(i + 1).padStart(2, "0")}</div>
                <h3>{t.name}</h3>
                <p>{t.blurb}</p>
                <small>{t.detail}</small>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* broker advantage */}
      <section className="h-sec h-sec-tint">
        <div className="h-wrap">
          <div className="h-head-c">
            <div className="h-eye">The broker advantage</div>
            <h2 className="h-h2">Why buyers work with a broker</h2>
            <p className="h-sub">
              The people selling to you do this every day. You do it twice a
              career. We even that up.
            </p>
          </div>

          {ADVANTAGES.map((a, i) => (
            <div className="h-adv" key={a.title}>
              <div className="h-adv-copy">
                <h3>{a.title}</h3>
                <p>
                  <b>{a.lead}</b> {a.body}
                </p>
                <ul className="h-pts">
                  {a.points.map((p) => (
                    <li key={p}>
                      <span className="h-tick">✓</span>
                      {p}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="h-panel">
                {i === 0 ? (
                  <>
                    <div className="h-panel-h">Verified pricing · per emp / mo</div>
                    {[
                      ["Rippling", "$8–12"],
                      ["Paylocity", "$7–11"],
                      ["Workday", "$18–30"],
                      ["BambooHR", "$6–9"],
                    ].map(([k, v]) => (
                      <div className="h-panel-b" key={k}>
                        <span>{k}</span>
                        <span>{v}</span>
                      </div>
                    ))}
                  </>
                ) : i === 1 ? (
                  <>
                    <div className="h-panel-h">Scorecard · payroll depth</div>
                    {[
                      ["Dana (HR)", 92],
                      ["Marcus (Finance)", 78],
                      ["Priya (IT)", 85],
                      ["Team average", 85],
                    ].map(([k, v]) => (
                      <div className="h-panel-b" key={String(k)}>
                        <span>{k}</span>
                        <span>
                          <span className="h-bar-mini">
                            <i style={{ width: `${v}%` }} />
                          </span>
                          {v}
                        </span>
                      </div>
                    ))}
                  </>
                ) : (
                  <>
                    <div className="h-panel-h">Proposal review · 3-yr term</div>
                    {[
                      ["Quoted", "$388,800"],
                      ["Modules you won't use", "−$55,200"],
                      ["Benchmark adjustment", "−$63,300"],
                      ["What you should pay", "$304,300"],
                    ].map(([k, v]) => (
                      <div className="h-panel-b" key={k}>
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
      <section className="h-sec">
        <div className="h-wrap">
          <div className="h-head-c">
            <div className="h-eye">Free &amp; trusted</div>
            <h2 className="h-h2">You never pay us a cent</h2>
            <p className="h-sub">
              We&rsquo;re paid a commission by the vendor you choose — the same
              rate from every vendor on the list.
            </p>
          </div>
          <div className="h-trust">
            {TRUST.map((t, i) => (
              <article className="h-tcard" key={t.title}>
                <div className="h-tico">{["=", "0", "!"][i]}</div>
                <h3>{t.title}</h3>
                <p>{t.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* stats */}
      <section className="h-wrap" style={{ paddingBottom: 88 }}>
        <div className="h-stats">
          {STATS.map((s) => (
            <div key={s.label} style={{ position: "relative", zIndex: 1 }}>
              <div className="h-stat-n">{s.n}</div>
              <div className="h-stat-l">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* cases */}
      <section className="h-sec h-sec-tint">
        <div className="h-wrap">
          <div className="h-head-c">
            <div className="h-eye">Customer stories</div>
            <h2 className="h-h2">What it looks like when it works</h2>
          </div>
          <div className="h-cases">
            {CASES.map((c) => (
              <article className="h-case" key={c.title}>
                <div className="h-case-top">
                  <div className="h-case-n">{c.stat}</div>
                  <div className="h-case-nl">{c.statLabel}</div>
                </div>
                <div className="h-case-b">
                  <h3>{c.title}</h3>
                  <p>{c.body}</p>
                  <span className="h-read">Read the story →</span>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* newsletter */}
      <section className="h-wrap" style={{ padding: "88px 32px" }}>
        <div className="h-news">
          <div>
            <h2>The HRIS Download</h2>
            <p>
              What&rsquo;s actually changing in HR tech — pricing moves, vendor
              gossip, and what buyers are picking. Monthly, no fluff.
            </p>
          </div>
          <form className="h-form" action="#" style={{ maxWidth: "none" }}>
            <input
              className="h-input"
              type="email"
              placeholder="Your work email"
              aria-label="Work email for newsletter"
            />
            <button className="h-btn h-btn-primary h-btn-lg" type="submit">
              Subscribe
            </button>
          </form>
        </div>
      </section>

      {/* footer */}
      <footer className="h-foot">
        <div className="h-wrap">
          <div className="h-foot-grid">
            <div>
              <div className="h-logo">
                <span className="h-mark">M</span>
                MatchMaker HR
              </div>
              <p>
                Buyer-side HRIS brokerage. Free to buyers, paid the same rate by
                every vendor — and we tell you when we&rsquo;re one of them.
              </p>
            </div>
            <div className="h-fcol">
              <h4>For buyers</h4>
              <ul>
                <li>HRIS Marketplace</li>
                <li>Requirements Builder</li>
                <li>Advisory services</li>
                <li>Case studies</li>
              </ul>
            </div>
            <div className="h-fcol">
              <h4>Why us</h4>
              <ul>
                <li>Broker model</li>
                <li>How we make money</li>
                <li>Scoring methodology</li>
                <li>FAQ</li>
              </ul>
            </div>
            <div className="h-fcol">
              <h4>Resources</h4>
              <ul>
                <li>Blog</li>
                <li>HRIS Landscape Report</li>
                <li>Partner finder</li>
                <li>Contact</li>
              </ul>
            </div>
          </div>
          <div className="h-foot-bot">
            <span>© 2026 MatchMaker HR</span>
            <span>Privacy · Terms · Commission disclosure</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
