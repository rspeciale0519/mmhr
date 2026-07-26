import { Archivo, IBM_Plex_Mono } from "next/font/google";

import { ADVANTAGES, CASES, NAV, STATS, TOOLS, TRUST, VENDORS } from "../_content";
import "./styles.css";

const sans = Archivo({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});
const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
});

const ROWS = [
  { name: "Rippling", note: "HR + IT + Finance", fit: 94, price: "$8–12", ver: "4d ago", feat: false },
  { name: "CBIZ Centrally HR", note: "White-labelled UKG Ready", fit: 91, price: "$9–14", ver: "2d ago", feat: true },
  { name: "Paylocity", note: "Mid-market payroll + HR", fit: 87, price: "$7–11", ver: "6d ago", feat: false },
  { name: "BambooHR", note: "Core HR, light payroll", fit: 79, price: "$6–9", ver: "9d ago", feat: false },
  { name: "Workday", note: "Enterprise suite", fit: 61, price: "$18–30", ver: "3d ago", feat: false },
];

export default function Terminal() {
  return (
    <div className={`t ${sans.className} ${mono.variable}`}>
      {/* nav */}
      <header className="t-nav">
        <div className="t-wrap t-nav-in">
          <div className="t-logo">
            <span className="t-mark">M</span>
            MatchMaker HR
          </div>
          <nav className="t-links">
            {NAV.map((n) => (
              <span key={n}>{n}</span>
            ))}
          </nav>
          <button className="t-btn t-ghost">Sign in</button>
          <button className="t-btn t-primary">Get started</button>
        </div>
      </header>

      {/* hero */}
      <section className="t-hero">
        <div className="t-wrap t-hero-in">
          <div>
            <div className="t-eyebrow">
              <i />
              Pricing re-verified this week
            </div>
            <h1 className="t-h1">
              The HRIS data set the vendors wish you didn&rsquo;t have.
            </h1>
            <p className="t-lede">
              52 systems. Verified pricing, module-level capability scores, and a
              match ranked against your requirements — refreshed on a schedule,
              not whenever someone gets around to it.
            </p>

            <form className="t-form" action="#">
              <input
                className="t-input"
                type="email"
                placeholder="Work email"
                aria-label="Work email"
              />
              <button className="t-btn t-primary t-lg" type="submit">
                Open the marketplace
              </button>
            </form>
            <p className="t-micro">Free · No sales calls · Vendor-funded</p>
          </div>

          {/* SIGNATURE — the working table */}
          <div className="t-tbl-card">
            <div className="t-tbl-top">
              <span className="t-tbl-title">Match results</span>
              <span className="t-tbl-meta">240 EMP · MULTI-STATE · PAYROLL+BEN+TIME</span>
            </div>
            <table className="t-tbl">
              <thead>
                <tr>
                  <th>Vendor</th>
                  <th className="r">Fit</th>
                  <th className="r">$/emp/mo</th>
                  <th className="r">Verified</th>
                </tr>
              </thead>
              <tbody>
                {ROWS.map((r) => (
                  <tr key={r.name} className={r.feat ? "t-feat" : undefined}>
                    <td>
                      <span className="t-name">
                        {r.name}
                        {r.feat ? <span className="t-lbl">Our solution</span> : null}
                        <small>{r.note}</small>
                      </span>
                    </td>
                    <td className="r">
                      <span className="t-fit">
                        <span className="t-fitbar">
                          <i style={{ width: `${r.fit}%` }} />
                        </span>
                        <span className="t-fitn">{r.fit}</span>
                      </span>
                    </td>
                    <td className="r t-mono">{r.price}</td>
                    <td className="r">
                      <span className="t-ver">{r.ver}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="t-tbl-foot">
              <span>SOURCE: VENDOR-OWNED + LICENSED · AUTO-REFRESHED</span>
              <span>52 SYSTEMS TRACKED</span>
            </div>
          </div>
        </div>
      </section>

      {/* logo strip */}
      <section className="t-strip">
        <div className="t-wrap t-strip-in">
          <span className="t-strip-l">Tracking</span>
          {VENDORS.map((v) => (
            <span className="t-vlogo" key={v}>
              {v}
            </span>
          ))}
        </div>
      </section>

      {/* tools as a spec sheet */}
      <section className="t-sec">
        <div className="t-wrap">
          <div className="t-head">
            <div className="t-eye">Platform</div>
            <h2 className="t-h2">Six tools, one process</h2>
            <p className="t-sub">
              The full apparatus of a professional selection — requirements,
              scoring, planning, and a human who has run hundreds of these.
            </p>
          </div>
          <div className="t-tools">
            {TOOLS.map((t, i) => (
              <div className="t-tool" key={t.key}>
                <div className="t-tool-n">{String(i + 1).padStart(2, "0")}</div>
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

      {/* advantages */}
      <section className="t-sec t-sec-p">
        <div className="t-wrap">
          <div className="t-head">
            <div className="t-eye">The broker advantage</div>
            <h2 className="t-h2">Why the data has to be this good</h2>
            <p className="t-sub">
              A recommendation is only worth what the data underneath it is
              worth. Ours is rebuilt on a schedule and every number is traceable
              to a source and a date.
            </p>
          </div>

          {ADVANTAGES.map((a, i) => (
            <div className="t-adv" key={a.title}>
              <div className="t-adv-copy">
                <h3>{a.title}</h3>
                <p>
                  <b>{a.lead}</b> {a.body}
                </p>
                <ul className="t-pts">
                  {a.points.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </div>

              <div className="t-panel">
                {i === 0 ? (
                  <>
                    <div className="t-panel-h">Pricing · verified within 30 days</div>
                    {[
                      ["Rippling", "$8–12"],
                      ["Paylocity", "$7–11"],
                      ["BambooHR", "$6–9"],
                      ["Workday", "$18–30"],
                    ].map(([k, v]) => (
                      <div className="t-prow" key={k}>
                        <span>{k}</span>
                        <span>{v}</span>
                      </div>
                    ))}
                  </>
                ) : i === 1 ? (
                  <>
                    <div className="t-panel-h">Scorecard · payroll depth (weighted)</div>
                    {[
                      ["Dana · HR", "92"],
                      ["Marcus · Finance", "78"],
                      ["Priya · IT", "85"],
                    ].map(([k, v]) => (
                      <div className="t-prow" key={k}>
                        <span>{k}</span>
                        <span>{v}</span>
                      </div>
                    ))}
                    <div className="t-prow tot">
                      <span>Committee</span>
                      <span>85</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="t-panel-h">Proposal review · 3-year term</div>
                    <div className="t-prow">
                      <span>As quoted</span>
                      <span>$388,800</span>
                    </div>
                    <div className="t-prow">
                      <span>Unused modules</span>
                      <span className="t-neg">−$55,200</span>
                    </div>
                    <div className="t-prow">
                      <span>Benchmark adjustment</span>
                      <span className="t-neg">−$63,300</span>
                    </div>
                    <div className="t-prow tot">
                      <span>Target price</span>
                      <span>$304,300</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* trust */}
      <section className="t-sec">
        <div className="t-wrap">
          <div className="t-head">
            <div className="t-eye">Free &amp; trusted</div>
            <h2 className="t-h2">The commission model, stated plainly</h2>
          </div>
          <div className="t-trust">
            {TRUST.map((t, i) => (
              <article className="t-tcard" key={t.title}>
                <div className="t-tk">Term {String(i + 1).padStart(2, "0")}</div>
                <h3>{t.title}</h3>
                <p>{t.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* stats */}
      <section className="t-stats">
        {STATS.map((s) => (
          <div className="t-stat" key={s.label}>
            <div className="t-stat-n">{s.n}</div>
            <div className="t-stat-l">{s.label}</div>
          </div>
        ))}
      </section>

      {/* cases */}
      <section className="t-sec">
        <div className="t-wrap">
          <div className="t-head">
            <div className="t-eye">Customer stories</div>
            <h2 className="t-h2">What the data is worth in practice</h2>
          </div>
          <div className="t-cases">
            {CASES.map((c) => (
              <article className="t-case" key={c.title}>
                <div className="t-case-n">{c.stat}</div>
                <div className="t-case-nl">{c.statLabel}</div>
                <h3>{c.title}</h3>
                <p>{c.body}</p>
                <span className="t-read">Read →</span>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* newsletter */}
      <section className="t-wrap" style={{ paddingBottom: 84 }}>
        <div className="t-news">
          <div>
            <h2>The HRIS Download</h2>
            <p>
              Pricing moves, vendor changes, and what buyers actually picked last
              month. Monthly, and mostly numbers.
            </p>
          </div>
          <form className="t-form" action="#" style={{ maxWidth: "none" }}>
            <input
              className="t-input"
              type="email"
              placeholder="Work email"
              aria-label="Work email for newsletter"
            />
            <button className="t-btn t-primary t-lg" type="submit">
              Subscribe
            </button>
          </form>
        </div>
      </section>

      {/* footer */}
      <footer className="t-foot">
        <div className="t-wrap">
          <div className="t-fgrid">
            <div>
              <div className="t-logo">
                <span className="t-mark">M</span>
                MatchMaker HR
              </div>
              <p>
                Buyer-side HRIS brokerage. Free to buyers, paid the same rate by
                every vendor — and we tell you when we&rsquo;re one of them.
              </p>
            </div>
            <div className="t-fcol">
              <h4>For buyers</h4>
              <ul>
                <li>HRIS Marketplace</li>
                <li>Requirements Builder</li>
                <li>Advisory services</li>
                <li>Case studies</li>
              </ul>
            </div>
            <div className="t-fcol">
              <h4>Why us</h4>
              <ul>
                <li>Broker model</li>
                <li>How we make money</li>
                <li>Scoring methodology</li>
                <li>FAQ</li>
              </ul>
            </div>
            <div className="t-fcol">
              <h4>Resources</h4>
              <ul>
                <li>Blog</li>
                <li>HRIS Landscape Report</li>
                <li>Partner finder</li>
                <li>Contact</li>
              </ul>
            </div>
          </div>
          <div className="t-fbot">
            <span>© 2026 MATCHMAKER HR</span>
            <span>PRIVACY · TERMS · COMMISSION DISCLOSURE</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
