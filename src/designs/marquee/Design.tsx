import { Epilogue, Syne } from "next/font/google";

import { ADVANTAGES, CASES, NAV, STATS, TOOLS, TRUST, VENDORS } from "../_content";
import "./styles.css";

const display = Syne({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-display",
});
const body = Epilogue({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

const RECEIPTS = [
  { name: "Rippling", fit: 94, ours: false },
  { name: "CBIZ Centrally HR", fit: 91, ours: true },
  { name: "Paylocity", fit: 87, ours: false },
  { name: "BambooHR", fit: 79, ours: false },
];

export default function Marquee() {
  return (
    <div className={`mq ${body.className} ${display.variable}`}>
      <header className="mq-nav">
        <div className="mq-wrap mq-nav-in">
          <div className="mq-logo">MatchMaker HR</div>
          <nav className="mq-links">
            {NAV.map((n) => (
              <span key={n}>{n}</span>
            ))}
          </nav>
          <button className="mq-btn mq-ghost">Sign in</button>
          <button className="mq-btn mq-solid">Get started</button>
        </div>
      </header>

      {/* SIGNATURE: shout, then receipts */}
      <section className="mq-wrap mq-hero">
        <div className="mq-eyebrow">Free · The vendor pays us, never you</div>
        <h1 className="mq-h1">
          Stop being <em>sold to</em>. Start buying.
        </h1>

        <div className="mq-under">
          <div>
            <p className="mq-lede">
              Fifty-two systems, scored against what your company actually needs.
              Verified pricing. An advisor who reads the proposal before you sign
              it. None of it costs you anything.
            </p>
            <form className="mq-form" action="#">
              <input
                className="mq-input"
                type="email"
                placeholder="Your work email"
                aria-label="Work email"
              />
              <button className="mq-btn mq-solid mq-lg" type="submit">
                See my matches
              </button>
            </form>
            <p className="mq-fine">Four minutes. No sales calls unless you ask.</p>
          </div>

          <div className="mq-receipt">
            <div className="mq-receipt-h">
              <span>Your matches</span>
              <span>240 emp</span>
            </div>
            {RECEIPTS.map((r) => (
              <div className="mq-rrow" key={r.name}>
                <span className="mq-rname">
                  {r.name}
                  {r.ours ? <span className="mq-tag">ours</span> : null}
                </span>
                <span className="mq-fit">
                  <span className="mq-bar">
                    <i style={{ width: `${r.fit}%` }} />
                  </span>
                  {r.fit}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mq-band">
        <div className="mq-band-mask">
          <div className="mq-band-row">
            {[...VENDORS, ...VENDORS].map((v, i) => (
              <span
                key={`${v}-${i}`}
                style={{ display: "inline-flex", alignItems: "center", gap: 40 }}
              >
                <span className="mq-band-v">{v}</span>
                <span className="mq-band-dot" />
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="mq-sec mq-white">
        <div className="mq-wrap">
          <h2 className="mq-h2">Six tools. One process. Zero invoices.</h2>
          <p className="mq-sub">
            Everything a consultant would bring to an HRIS selection — and you
            keep all of it when you&rsquo;re done.
          </p>
          <div className="mq-tools">
            {TOOLS.map((t, i) => (
              <article className="mq-tool" key={t.key}>
                <div className="mq-tool-n">{String(i + 1).padStart(2, "0")}</div>
                <h3>{t.name}</h3>
                <p>{t.blurb}</p>
                <small>{t.detail}</small>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mq-sec">
        <div className="mq-wrap">
          <h2 className="mq-h2">They&rsquo;ve done this a thousand times. Now so have you.</h2>
          <p className="mq-sub">
            The people selling to you close HRIS deals every day. You&rsquo;ll do
            it twice in your career. We even that up.
          </p>

          {ADVANTAGES.map((a, i) => (
            <div className="mq-adv" key={a.title}>
              <div className="mq-adv-copy">
                <h3>{a.title}</h3>
                <p>
                  <b>{a.lead}</b> {a.body}
                </p>
                <ul className="mq-pts">
                  {a.points.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </div>

              <div className="mq-panel">
                {i === 0 ? (
                  <>
                    <div className="mq-panel-h">Verified pricing · per emp / mo</div>
                    {[
                      ["Rippling", "$8–12"],
                      ["Paylocity", "$7–11"],
                      ["BambooHR", "$6–9"],
                      ["Workday", "$18–30"],
                    ].map(([k, v]) => (
                      <div className="mq-prow" key={k}>
                        <span>{k}</span>
                        <span>{v}</span>
                      </div>
                    ))}
                  </>
                ) : i === 1 ? (
                  <>
                    <div className="mq-panel-h">Scorecard · payroll depth</div>
                    {[
                      ["Dana — HR", "92"],
                      ["Marcus — finance", "78"],
                      ["Priya — IT", "85"],
                    ].map(([k, v]) => (
                      <div className="mq-prow" key={k}>
                        <span>{k}</span>
                        <span>{v}</span>
                      </div>
                    ))}
                    <div className="mq-prow tot">
                      <span>Committee</span>
                      <span>85</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="mq-panel-h">Proposal review · 3-year term</div>
                    <div className="mq-prow">
                      <span>As quoted</span>
                      <span>$388,800</span>
                    </div>
                    <div className="mq-prow">
                      <span>Modules you won&rsquo;t use</span>
                      <span>−$55,200</span>
                    </div>
                    <div className="mq-prow">
                      <span>Benchmark adjustment</span>
                      <span>−$63,300</span>
                    </div>
                    <div className="mq-prow tot">
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

      <section className="mq-sec mq-white">
        <div className="mq-wrap">
          <h2 className="mq-h2">Free isn&rsquo;t a gimmick. Here&rsquo;s the mechanism.</h2>
          <p className="mq-sub">
            The provider you choose pays us a commission or referral fee. Terms can
            vary by provider, so we disclose them before you decide.
          </p>
          <div className="mq-trust">
            {TRUST.map((t, i) => (
              <article className="mq-tc" key={t.title}>
                <div className="mq-tc-n">{String(i + 1).padStart(2, "0")}</div>
                <h3>{t.title}</h3>
                <p>{t.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <div className="mq-wrap">
        <div className="mq-stats">
          {STATS.map((s) => (
            <div key={s.label}>
              <div className="mq-st-n">{s.n}</div>
              <div className="mq-st-l">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      <section className="mq-sec">
        <div className="mq-wrap">
          <h2 className="mq-h2">People who stopped being sold to</h2>
          <p className="mq-sub">Three selections, run the way they should be.</p>
          <div className="mq-cases">
            {CASES.map((c) => (
              <article className="mq-case" key={c.title}>
                <div className="mq-case-n">{c.stat}</div>
                <div className="mq-case-nl">{c.statLabel}</div>
                <h3>{c.title}</h3>
                <p>{c.body}</p>
                <span className="mq-more">Read the story →</span>
              </article>
            ))}
          </div>
        </div>
      </section>

      <div className="mq-wrap" style={{ paddingBottom: 92 }}>
        <div className="mq-news">
          <div>
            <h2>The HRIS Download</h2>
            <p>
              Pricing moves, vendor gossip, and what buyers actually picked.
              Monthly. Unsubscribe whenever.
            </p>
          </div>
          <form className="mq-form" action="#" style={{ maxWidth: "none" }}>
            <input
              className="mq-input"
              type="email"
              placeholder="Your work email"
              aria-label="Work email for newsletter"
            />
            <button className="mq-btn mq-solid mq-lg" type="submit">
              Subscribe
            </button>
          </form>
        </div>
      </div>

      <footer className="mq-foot">
        <div className="mq-wrap">
          <div className="mq-fgrid">
            <div>
              <div className="mq-logo">MatchMaker HR</div>
              <p>
                Buyer-side HRIS brokerage. Free for buyers. Providers pay a
                commission or referral fee. Terms can vary by provider.
              </p>
            </div>
            <div className="mq-fc">
              <h4>For buyers</h4>
              <ul>
                <li>HRIS Marketplace</li>
                <li>Requirements Builder</li>
                <li>Advisory services</li>
                <li>Case studies</li>
              </ul>
            </div>
            <div className="mq-fc">
              <h4>Why us</h4>
              <ul>
                <li>Broker model</li>
                <li>How we make money</li>
                <li>Scoring methodology</li>
                <li>FAQ</li>
              </ul>
            </div>
            <div className="mq-fc">
              <h4>Resources</h4>
              <ul>
                <li>Blog</li>
                <li>HRIS Landscape Report</li>
                <li>Partner finder</li>
                <li>Contact</li>
              </ul>
            </div>
          </div>
          <div className="mq-fbot">
            <span>© 2026 MatchMaker HR</span>
            <span>Privacy · Terms · Commission disclosure</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
