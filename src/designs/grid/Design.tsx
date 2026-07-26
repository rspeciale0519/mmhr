import { JetBrains_Mono, Schibsted_Grotesk } from "next/font/google";

import { ADVANTAGES, CASES, NAV, STATS, TOOLS, TRUST, VENDORS } from "../_content";
import "./styles.css";

const sans = Schibsted_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});
const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
});

export default function Grid() {
  return (
    <div className={`gr ${sans.className} ${mono.variable}`}>
      <header className="gr-nav">
        <div className="gr-wrap gr-nav-in">
          <div className="gr-logo">MatchMaker HR</div>
          <nav className="gr-nav-links">
            {NAV.map((n) => (
              <span key={n}>{n}</span>
            ))}
          </nav>
          <div className="gr-nav-cta">
            <button className="gr-btn gr-line">Sign in</button>
            <button className="gr-btn gr-solid">Get started</button>
          </div>
        </div>
      </header>

      {/* SIGNATURE: the construction grid, left visible */}
      <section className="gr-hero">
        <div className="gr-cols" aria-hidden="true">
          {Array.from({ length: 12 }, (_, i) => (
            <span key={i} />
          ))}
        </div>

        <div className="gr-wrap gr-hero-in">
          <div className="gr-hero-copy">
            <div className="gr-tag">
              <i />
              <span className="gr-lbl">Buyer-side HRIS brokerage</span>
            </div>
            <h1 className="gr-h1">A method, not a sales pitch.</h1>
            <p className="gr-lede">
              Requirements in. Fifty-two systems scored against them. Verified
              pricing, a committee that agrees, and a proposal we&rsquo;ve read
              before you sign it.
            </p>

            <form className="gr-form" action="#">
              <input
                className="gr-input"
                type="email"
                placeholder="Work email"
                aria-label="Work email"
              />
              <button className="gr-btn gr-solid gr-lg" type="submit">
                Start
              </button>
            </form>
            <p className="gr-fine">Free · Vendor-funded · No sales calls</p>
          </div>

          <div className="gr-figs">
            <div className="gr-fig">
              <span className="gr-fig-n">52</span>
              <span className="gr-fig-t">
                <b>Systems tracked</b>
                Pricing and capability re-verified on a schedule, not when
                someone remembers.
              </span>
            </div>
            <div className="gr-fig">
              <span className="gr-fig-n red">1</span>
              <span className="gr-fig-t">
                <b>Commission rate</b>
                The same from every vendor on the list. Steering you cannot pay
                us more.
              </span>
            </div>
            <div className="gr-fig">
              <span className="gr-fig-n">$0</span>
              <span className="gr-fig-t">
                <b>What you pay</b>
                Not a fee, not a subscription, not passed through in the vendor
                price.
              </span>
            </div>
          </div>
        </div>
      </section>

      <div className="gr-wrap gr-wall">
        <span className="gr-lbl">Covered</span>
        {VENDORS.slice(0, 13).map((v) => (
          <span className="gr-wall-v" key={v}>
            {v}
          </span>
        ))}
      </div>

      <section className="gr-sec">
        <div className="gr-wrap">
          <div className="gr-sec-h">
            <span className="gr-lbl">01 / Platform</span>
            <h2 className="gr-h2">Six tools, used in order</h2>
            <p className="gr-sec-note">
              Everything a consultant brings to a selection, minus the invoice.
            </p>
          </div>
          <div className="gr-tools">
            {TOOLS.map((t, i) => (
              <article className="gr-tool" key={t.key}>
                <div className="gr-tool-n">{String(i + 1).padStart(2, "0")}</div>
                <h3>{t.name}</h3>
                <p>{t.blurb}</p>
                <small>{t.detail}</small>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="gr-sec gr-off">
        <div className="gr-wrap">
          <div className="gr-sec-h">
            <span className="gr-lbl">02 / Advantage</span>
            <h2 className="gr-h2">Why a broker beats a salesperson</h2>
            <p className="gr-sec-note">
              They do this every day. You do it twice a career.
            </p>
          </div>

          {ADVANTAGES.map((a, i) => (
            <div className="gr-adv" key={a.title}>
              <span className="gr-lbl gr-adv-k">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="gr-adv-copy">
                <h3>{a.title}</h3>
                <p>
                  <b>{a.lead}</b> {a.body}
                </p>
                <ul className="gr-pts">
                  {a.points.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </div>
              <div className="gr-panel">
                {i === 0 ? (
                  <>
                    <div className="gr-panel-h">Pricing / per emp / mo</div>
                    {[
                      ["Rippling", "8–12"],
                      ["Paylocity", "7–11"],
                      ["BambooHR", "6–9"],
                      ["Workday", "18–30"],
                    ].map(([k, v]) => (
                      <div className="gr-prow" key={k}>
                        <span>{k}</span>
                        <span>{v}</span>
                      </div>
                    ))}
                  </>
                ) : i === 1 ? (
                  <>
                    <div className="gr-panel-h">Scorecard / payroll depth</div>
                    {[
                      ["Dana — HR", "92"],
                      ["Marcus — finance", "78"],
                      ["Priya — IT", "85"],
                    ].map(([k, v]) => (
                      <div className="gr-prow" key={k}>
                        <span>{k}</span>
                        <span>{v}</span>
                      </div>
                    ))}
                    <div className="gr-prow tot">
                      <span>Committee</span>
                      <span>85</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="gr-panel-h">Proposal / 3-year term</div>
                    <div className="gr-prow">
                      <span>As quoted</span>
                      <span>388,800</span>
                    </div>
                    <div className="gr-prow">
                      <span>Unused modules</span>
                      <span>−55,200</span>
                    </div>
                    <div className="gr-prow">
                      <span>Benchmark</span>
                      <span>−63,300</span>
                    </div>
                    <div className="gr-prow tot">
                      <span>Target</span>
                      <span>304,300</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="gr-sec">
        <div className="gr-wrap">
          <div className="gr-sec-h">
            <span className="gr-lbl">03 / Terms</span>
            <h2 className="gr-h2">The commission model, in three lines</h2>
          </div>
          <div className="gr-trust">
            {TRUST.map((t) => (
              <article className="gr-tc" key={t.title}>
                <h3>{t.title}</h3>
                <p>{t.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="gr-sec">
        <div className="gr-wrap gr-stats">
          {STATS.map((s) => (
            <div className="gr-st" key={s.label}>
              <div className="gr-st-n">{s.n}</div>
              <div className="gr-st-l">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="gr-sec">
        <div className="gr-wrap">
          <div className="gr-sec-h">
            <span className="gr-lbl">04 / Evidence</span>
            <h2 className="gr-h2">Selections we ran</h2>
          </div>
          <div className="gr-cases">
            {CASES.map((c) => (
              <article className="gr-case" key={c.title}>
                <div className="gr-case-n">{c.stat}</div>
                <div className="gr-case-nl">{c.statLabel}</div>
                <h3>{c.title}</h3>
                <p>{c.body}</p>
                <span className="gr-more">Read</span>
              </article>
            ))}
          </div>
        </div>
      </section>

      <div className="gr-wrap gr-news">
        <div className="gr-news-c">
          <h2>The HRIS Download</h2>
          <p>
            Pricing moves, vendor changes, and what buyers actually chose.
            Monthly.
          </p>
        </div>
        <form className="gr-form gr-news-f" action="#" style={{ maxWidth: "none" }}>
          <input
            className="gr-input"
            type="email"
            placeholder="Work email"
            aria-label="Work email for newsletter"
          />
          <button className="gr-btn gr-solid gr-lg" type="submit">
            Subscribe
          </button>
        </form>
      </div>

      <footer className="gr-foot">
        <div className="gr-wrap">
          <div className="gr-fgrid">
            <div className="gr-fbrand">
              <div className="gr-logo">MatchMaker HR</div>
              <p>
                Buyer-side HRIS brokerage. Free to buyers, paid the same rate by
                every vendor — and we say so when we&rsquo;re one of them.
              </p>
            </div>
            <div className="gr-fc">
              <h4>Buyers</h4>
              <ul>
                <li>Marketplace</li>
                <li>Requirements</li>
                <li>Advisory</li>
                <li>Cases</li>
              </ul>
            </div>
            <div className="gr-fc">
              <h4>Why us</h4>
              <ul>
                <li>Broker model</li>
                <li>How we&rsquo;re paid</li>
                <li>Methodology</li>
                <li>FAQ</li>
              </ul>
            </div>
            <div className="gr-fc">
              <h4>More</h4>
              <ul>
                <li>Blog</li>
                <li>Landscape Report</li>
                <li>Partners</li>
                <li>Contact</li>
              </ul>
            </div>
          </div>
          <div className="gr-fbot">
            <span>© 2026 MatchMaker HR</span>
            <span>Privacy · Terms · Commission disclosure</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
