import localFont from "next/font/local";

import { ADVANTAGES, CASES, NAV, STATS, TOOLS, TRUST, VENDORS } from "../_content";
import "./styles.css";

const retainedDossierDisplay = localFont({
  src: [
    { path: "../../assets/fonts/literata/literata-normal-500-600-latin.woff2", weight: "500 600", style: "normal" },
  ],
  display: "swap",
  variable: "--font-display",
});
const display = retainedDossierDisplay;
const retainedDossierBody = localFont({
  src: [
    { path: "../../assets/fonts/public-sans/public-sans-normal-400-700-latin.woff2", weight: "400 700", style: "normal" },
  ],
  display: "swap",
});
const body = retainedDossierBody;

const FILE = [
  { name: "Rippling", note: "HR + IT + finance", fit: 94, price: "$8–12", ours: false },
  { name: "CBIZ Centrally HR", note: "White-labelled UKG Ready", fit: 91, price: "$9–14", ours: true },
  { name: "Paylocity", note: "Mid-market payroll + HR", fit: 87, price: "$7–11", ours: false },
  { name: "BambooHR", note: "Core HR, light payroll", fit: 79, price: "$6–9", ours: false },
];

const TABS = ["Matches", "Requirements", "Scorecards", "Proposals"];

export default function Dossier() {
  return (
    <div className={`do ${body.className} ${display.variable}`}>
      <header className="do-nav">
        <div className="do-wrap do-nav-in">
          <div className="do-logo">MatchMaker HR</div>
          <nav className="do-links">
            {NAV.map((n) => (
              <span key={n}>{n}</span>
            ))}
          </nav>
          <button className="do-btn do-line">Sign in</button>
          <button className="do-btn do-solid">Get started</button>
        </div>
      </header>

      <section className="do-wrap do-hero">
        <div>
          <div className="do-kick">
            <span className="do-stamp">Case file — HRIS selection</span>
            <i />
          </div>
          <h1 className="do-h1">
            Everything known about every system, kept in one file. Yours.
          </h1>
          <p className="do-lede">
            Your requirements, the quotes, the scorecards, the marked-up
            proposal. We keep the file, you own it — and you can walk out with it
            whenever you like.
          </p>

          <form className="do-form" action="#">
            <input
              className="do-input"
              type="email"
              placeholder="Work email"
              aria-label="Work email"
            />
            <button className="do-btn do-solid do-lg" type="submit">
              Open my file
            </button>
          </form>
          <p className="do-fine">
            Free for buyers. Providers pay a commission or referral fee. Terms
            can vary by provider.
          </p>
        </div>

        {/* SIGNATURE: the tabbed file */}
        <div className="do-file">
          <div className="do-tabs">
            {TABS.map((t, i) => (
              <div className={`do-tab${i === 0 ? " on" : ""}`} key={t}>
                {t}
              </div>
            ))}
          </div>

          <div className="do-folder">
            <div className="do-file-h">
              <span className="do-file-t">Matches</span>
              <span className="do-file-m">240 emp · multi-state · rev 07.26</span>
            </div>

            {FILE.map((r) => (
              <div className="do-line-item" key={r.name}>
                <span className="do-name">
                  {r.name}
                  {r.ours ? <span className="do-ours">our solution</span> : null}
                  <small>{r.note}</small>
                </span>
                <span className="do-fit">
                  <span className="do-bar">
                    <i style={{ width: `${r.fit}%` }} />
                  </span>
                  {r.fit}
                </span>
                <span className="do-price">{r.price}</span>
              </div>
            ))}

            <p className="do-note">
              <strong>Advisor note.</strong> Centrally HR is our own solution. It
              is labelled wherever it appears and earns its ranking on the same
              data as every other system in the file.
            </p>
          </div>
        </div>
      </section>

      <div className="do-wall">
        <div className="do-wrap" style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "center" }}>
          <span className="do-stamp">On file</span>
          {VENDORS.slice(0, 12).map((v) => (
            <span className="do-wall-v" key={v}>
              {v}
            </span>
          ))}
          <span className="do-wall-v">+ 40 more</span>
        </div>
      </div>

      <section className="do-sec">
        <div className="do-wrap">
          <div className="do-sec-h">
            <span className="do-stamp">Section 1 — The platform</span>
            <h2 className="do-h2">Six tools, and everything they produce is yours</h2>
            <p className="do-sub">
              Export any of it, any time. If you walk away, the file walks with
              you.
            </p>
          </div>
          <div className="do-tools">
            {TOOLS.map((t, i) => (
              <article className="do-tool" key={t.key}>
                <div className="do-tool-n">{String(i + 1).padStart(2, "0")}</div>
                <div>
                  <h3>{t.name}</h3>
                  <p>{t.blurb}</p>
                  <small>{t.detail}</small>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="do-sec do-white">
        <div className="do-wrap">
          <div className="do-sec-h">
            <span className="do-stamp">Section 2 — The broker advantage</span>
            <h2 className="do-h2">A file this thorough is the whole point</h2>
            <p className="do-sub">
              The vendor knows everything about their product and nothing about
              your constraints. We know both.
            </p>
          </div>

          {ADVANTAGES.map((a, i) => (
            <div className={`do-adv${i % 2 === 1 ? " flip" : ""}`} key={a.title}>
              <div className="do-adv-copy">
                <span className="do-stamp">Exhibit {String.fromCharCode(65 + i)}</span>
                <h3>{a.title}</h3>
                <p>
                  <b>{a.lead}</b> {a.body}
                </p>
                <ul className="do-pts">
                  {a.points.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </div>

              <div className="do-panel">
                {i === 0 ? (
                  <>
                    <div className="do-panel-h">Pricing on file · per emp / mo</div>
                    {[
                      ["Rippling", "$8–12"],
                      ["Paylocity", "$7–11"],
                      ["BambooHR", "$6–9"],
                      ["Workday", "$18–30"],
                    ].map(([k, v]) => (
                      <div className="do-prow" key={k}>
                        <span>{k}</span>
                        <span>{v}</span>
                      </div>
                    ))}
                  </>
                ) : i === 1 ? (
                  <>
                    <div className="do-panel-h">Scorecard · payroll depth</div>
                    {[
                      ["Dana — HR", "92"],
                      ["Marcus — finance", "78"],
                      ["Priya — IT", "85"],
                    ].map(([k, v]) => (
                      <div className="do-prow" key={k}>
                        <span>{k}</span>
                        <span>{v}</span>
                      </div>
                    ))}
                    <div className="do-prow tot">
                      <span>Committee</span>
                      <span>85</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="do-panel-h">Proposal review · 3-year term</div>
                    <div className="do-prow">
                      <span>As quoted</span>
                      <span>$388,800</span>
                    </div>
                    <div className="do-prow">
                      <span>Modules never activated</span>
                      <span className="do-neg">−$55,200</span>
                    </div>
                    <div className="do-prow">
                      <span>Benchmark adjustment</span>
                      <span className="do-neg">−$63,300</span>
                    </div>
                    <div className="do-prow tot">
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

      <section className="do-sec">
        <div className="do-wrap">
          <div className="do-sec-h">
            <span className="do-stamp">Section 3 — Terms</span>
            <h2 className="do-h2">How we are paid, on the record</h2>
          </div>
          <div className="do-trust">
            {TRUST.map((t, i) => (
              <article className="do-tc" key={t.title}>
                <span className="do-stamp">Clause {i + 1}</span>
                <h3>{t.title}</h3>
                <p>{t.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <div className="do-wrap" style={{ paddingBottom: 80 }}>
        <div className="do-stats">
          {STATS.map((s) => (
            <div className="do-st" key={s.label}>
              <div className="do-st-n">{s.n}</div>
              <div className="do-st-l">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      <section className="do-sec do-white">
        <div className="do-wrap">
          <div className="do-sec-h">
            <span className="do-stamp">Section 4 — Precedent</span>
            <h2 className="do-h2">Files we&rsquo;ve closed</h2>
          </div>
          <div className="do-cases">
            {CASES.map((c) => (
              <article className="do-case" key={c.title}>
                <div className="do-case-n">{c.stat}</div>
                <div className="do-case-nl">{c.statLabel}</div>
                <h3>{c.title}</h3>
                <p>{c.body}</p>
                <span className="do-more">Read the file</span>
              </article>
            ))}
          </div>
        </div>
      </section>

      <div className="do-wrap" style={{ padding: "80px 34px" }}>
        <div className="do-news">
          <div>
            <h2>The HRIS Download</h2>
            <p>
              Pricing moves, vendor changes, and what buyers actually chose last
              month. Monthly.
            </p>
          </div>
          <form className="do-form" action="#" style={{ maxWidth: "none" }}>
            <input
              className="do-input"
              type="email"
              placeholder="Work email"
              aria-label="Work email for newsletter"
            />
            <button className="do-btn do-solid do-lg" type="submit">
              Subscribe
            </button>
          </form>
        </div>
      </div>

      <footer className="do-foot">
        <div className="do-wrap">
          <div className="do-fgrid">
            <div>
              <div className="do-logo">MatchMaker HR</div>
              <p>
                Buyer-side HRIS brokerage. Free for buyers. Providers pay a
                commission or referral fee. Terms can vary by provider.
              </p>
            </div>
            <div className="do-fc">
              <h4>For buyers</h4>
              <ul>
                <li>HRIS Marketplace</li>
                <li>Requirements Builder</li>
                <li>Advisory services</li>
                <li>Case studies</li>
              </ul>
            </div>
            <div className="do-fc">
              <h4>Why us</h4>
              <ul>
                <li>Broker model</li>
                <li>How we make money</li>
                <li>Scoring methodology</li>
                <li>FAQ</li>
              </ul>
            </div>
            <div className="do-fc">
              <h4>Resources</h4>
              <ul>
                <li>Blog</li>
                <li>HRIS Landscape Report</li>
                <li>Partner finder</li>
                <li>Contact</li>
              </ul>
            </div>
          </div>
          <div className="do-fbot">
            <span>© 2026 MatchMaker HR</span>
            <span>Privacy · Terms · Commission disclosure</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
