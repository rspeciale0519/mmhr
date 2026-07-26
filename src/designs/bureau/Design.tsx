import { Geist, Instrument_Serif } from "next/font/google";

import { ADVANTAGES, CASES, NAV, STATS, TOOLS, TRUST, VENDORS } from "../_content";
import "./styles.css";

const display = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-display",
});
const body = Geist({ subsets: ["latin"] });

const FIG = [
  { name: "Rippling", note: "HR + IT + finance", fit: 94, price: "$8–12", ours: false },
  { name: "CBIZ Centrally HR", note: "White-labelled UKG Ready", fit: 91, price: "$9–14", ours: true },
  { name: "Paylocity", note: "Mid-market payroll + HR", fit: 87, price: "$7–11", ours: false },
  { name: "BambooHR", note: "Core HR, light payroll", fit: 79, price: "$6–9", ours: false },
];

export default function Bureau() {
  return (
    <div className={`bu ${body.className} ${display.variable}`}>
      <header className="bu-mast">
        <div className="bu-wrap">
          <div className="bu-mast-top">
            <span>Buyer-side HRIS brokerage</span>
            <span>52 systems tracked · Pricing verified monthly · Free to buyers</span>
          </div>
          <div className="bu-mast-main">
            <div className="bu-logo">MatchMaker HR</div>
            <nav className="bu-nav">
              {NAV.map((n) => (
                <span key={n}>{n}</span>
              ))}
            </nav>
            <button className="bu-btn bu-outline">Sign in</button>
            <button className="bu-btn bu-solid">Get started</button>
          </div>
        </div>
      </header>

      <section className="bu-wrap bu-hero">
        <div>
          <div className="bu-slug">The brief</div>
          <h1 className="bu-h1">
            You will buy an HRIS twice. They sell one <i>every day</i>.
          </h1>
          <p className="bu-standfirst">
            We close that gap: verified pricing on 52 systems, a scoring process
            your committee can actually run, and an advisor who reads the
            proposal before you sign it.
          </p>

          <form className="bu-form" action="#">
            <input
              className="bu-input"
              type="email"
              placeholder="Work email"
              aria-label="Work email"
            />
            <button className="bu-btn bu-solid bu-lg" type="submit">
              Request the analysis
            </button>
          </form>
          <p className="bu-fine">
            Free to you. Every vendor pays us the same commission — including the
            one we resell.
          </p>
        </div>

        {/* SIGNATURE: the match table, presented as a published figure */}
        <figure className="bu-fig">
          <div className="bu-fig-head">
            <span className="bu-fig-n">Fig. 1</span>
            <span className="bu-fig-t">Fit against your requirements</span>
            <span className="bu-fig-spec">240 emp · multi-state</span>
          </div>
          <table className="bu-tbl">
            <thead>
              <tr>
                <th>System</th>
                <th className="r">Fit</th>
                <th className="r">$ / emp / mo</th>
              </tr>
            </thead>
            <tbody>
              {FIG.map((r) => (
                <tr key={r.name}>
                  <td>
                    <span className="bu-vend">
                      {r.name}
                      {r.ours ? <span className="bu-ours">our solution</span> : null}
                      <small>{r.note}</small>
                    </span>
                  </td>
                  <td className="r bu-num">
                    <span className="bu-rule-bar">
                      <i style={{ width: `${r.fit}%` }} />
                    </span>
                    {r.fit}
                  </td>
                  <td className="r bu-num">{r.price}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <figcaption className="bu-cap">
            Fit is computed from your tagged requirements against module-level
            capability scores. Pricing is drawn from vendor-owned sources and
            re-verified monthly. Centrally HR is our own solution and is labelled
            wherever it appears.
          </figcaption>
        </figure>
      </section>

      <div className="bu-wrap bu-wall">
        <span className="bu-wall-l">Systems covered</span>
        {VENDORS.slice(0, 12).map((v) => (
          <span className="bu-wall-v" key={v}>
            {v}
          </span>
        ))}
        <span className="bu-wall-v">+ 40 more</span>
      </div>

      {/* tools as an index */}
      <section className="bu-sec">
        <div className="bu-wrap">
          <div className="bu-sec-h">
            <span className="bu-sec-n">I</span>
            <h2 className="bu-h2">The platform</h2>
            <span className="bu-sec-note">
              Six tools, in the order you&rsquo;ll use them.
            </span>
          </div>
          <div className="bu-index">
            {TOOLS.map((t, i) => (
              <div className="bu-item" key={t.key}>
                <span className="bu-item-n">{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <h3>{t.name}</h3>
                  <p>{t.blurb}</p>
                </div>
                <small>{t.detail}</small>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bu-sec bu-stone">
        <div className="bu-wrap">
          <div className="bu-sec-h">
            <span className="bu-sec-n">II</span>
            <h2 className="bu-h2">The broker advantage</h2>
          </div>

          {ADVANTAGES.map((a, i) => (
            <div className="bu-adv" key={a.title}>
              <div>
                <h3>{a.title}</h3>
                <p>
                  <b>{a.lead}</b> {a.body}
                </p>
                <ul className="bu-pts">
                  {a.points.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </div>

              <div className="bu-panel">
                {i === 0 ? (
                  <>
                    <div className="bu-panel-h">Verified pricing · per emp / mo</div>
                    {[
                      ["Rippling", "$8–12"],
                      ["Paylocity", "$7–11"],
                      ["BambooHR", "$6–9"],
                      ["Workday", "$18–30"],
                    ].map(([k, v]) => (
                      <div className="bu-prow" key={k}>
                        <span>{k}</span>
                        <span>{v}</span>
                      </div>
                    ))}
                  </>
                ) : i === 1 ? (
                  <>
                    <div className="bu-panel-h">Scorecard · payroll depth</div>
                    {[
                      ["Dana — HR", "92"],
                      ["Marcus — finance", "78"],
                      ["Priya — IT", "85"],
                    ].map(([k, v]) => (
                      <div className="bu-prow" key={k}>
                        <span>{k}</span>
                        <span>{v}</span>
                      </div>
                    ))}
                    <div className="bu-prow sum">
                      <span>Committee</span>
                      <span>85</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="bu-panel-h">Proposal review · 3-year term</div>
                    <div className="bu-prow">
                      <span>As quoted</span>
                      <span>$388,800</span>
                    </div>
                    <div className="bu-prow">
                      <span>Modules never activated</span>
                      <span className="bu-neg">−$55,200</span>
                    </div>
                    <div className="bu-prow">
                      <span>Benchmark adjustment</span>
                      <span className="bu-neg">−$63,300</span>
                    </div>
                    <div className="bu-prow sum">
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

      <section className="bu-sec">
        <div className="bu-wrap">
          <div className="bu-sec-h">
            <span className="bu-sec-n">III</span>
            <h2 className="bu-h2">How we are paid</h2>
            <span className="bu-sec-note">
              Stated here because a promise you can&rsquo;t check is worth
              nothing.
            </span>
          </div>
          <div className="bu-trust">
            {TRUST.map((t, i) => (
              <article className="bu-tc" key={t.title}>
                <div className="bu-tc-k">Clause {i + 1}</div>
                <h3>{t.title}</h3>
                <p>{t.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <div className="bu-wrap">
        <div className="bu-stats">
          {STATS.map((s) => (
            <div className="bu-st" key={s.label}>
              <div className="bu-st-n">{s.n}</div>
              <div className="bu-st-l">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      <section className="bu-sec">
        <div className="bu-wrap">
          <div className="bu-sec-h">
            <span className="bu-sec-n">IV</span>
            <h2 className="bu-h2">Case studies</h2>
          </div>
          <div className="bu-cases">
            {CASES.map((c) => (
              <article className="bu-case" key={c.title}>
                <div className="bu-case-n">{c.stat}</div>
                <div className="bu-case-nl">{c.statLabel}</div>
                <h3>{c.title}</h3>
                <p>{c.body}</p>
                <span className="bu-more">Read the study</span>
              </article>
            ))}
          </div>
        </div>
      </section>

      <div className="bu-wrap">
        <div className="bu-news">
          <div>
            <h2>The HRIS Download</h2>
            <p>
              Pricing moves, vendor changes, and what buyers actually chose last
              month. Sent monthly.
            </p>
          </div>
          <form className="bu-form" action="#" style={{ maxWidth: "none" }}>
            <input
              className="bu-input"
              type="email"
              placeholder="Work email"
              aria-label="Work email for newsletter"
            />
            <button className="bu-btn bu-solid bu-lg" type="submit">
              Subscribe
            </button>
          </form>
        </div>
      </div>

      <footer className="bu-foot">
        <div className="bu-wrap">
          <div className="bu-fgrid">
            <div>
              <div className="bu-logo">MatchMaker HR</div>
              <p>
                Buyer-side HRIS brokerage. Free to buyers, paid the same rate by
                every vendor — and we say so when we&rsquo;re one of them.
              </p>
            </div>
            <div className="bu-fc">
              <h4>For buyers</h4>
              <ul>
                <li>HRIS Marketplace</li>
                <li>Requirements Builder</li>
                <li>Advisory services</li>
                <li>Case studies</li>
              </ul>
            </div>
            <div className="bu-fc">
              <h4>Why us</h4>
              <ul>
                <li>Broker model</li>
                <li>How we make money</li>
                <li>Scoring methodology</li>
                <li>FAQ</li>
              </ul>
            </div>
            <div className="bu-fc">
              <h4>Resources</h4>
              <ul>
                <li>Blog</li>
                <li>HRIS Landscape Report</li>
                <li>Partner finder</li>
                <li>Contact</li>
              </ul>
            </div>
          </div>
          <div className="bu-fbot">
            <span>© 2026 MatchMaker HR</span>
            <span>Privacy · Terms · Commission disclosure</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
