import localFont from "next/font/local";

import { ADVANTAGES, CASES, NAV, STATS, TOOLS, TRUST, VENDORS } from "../_content";
import "./styles.css";

const retainedRedlineSerif = localFont({
  src: [
    { path: "../../assets/fonts/source-serif-4/source-serif-4-normal-400-700-latin.woff2", weight: "400 700", style: "normal" },
  ],
  display: "swap",
});
const serif = retainedRedlineSerif;
const retainedRedlineMono = localFont({
  src: [
    { path: "../../assets/fonts/courier-prime/courier-prime-normal-400-latin.woff2", weight: "400", style: "normal" },
    { path: "../../assets/fonts/courier-prime/courier-prime-normal-700-latin.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
  variable: "--font-mono",
});
const mono = retainedRedlineMono;

/**
 * The mini redline that carries the concept into the advantage section, plus
 * a tracked-changes log and an advisor margin note — so the signature idea
 * (real markup, not a screenshot) shows up more than once on the page.
 */
const ADV_PANELS = [
  {
    kind: "redline" as const,
    label: "SECTION 9.3 — EARLY TERMINATION",
    before: "an early termination fee equal to 100% of the fees remaining in the term",
    after: "no early termination fee if 90 days' written notice is given",
    lead: "Customer shall pay",
    tail: ".",
    note: "Standard vendor deterrent. We negotiate a notice-based exit in most contracts.",
  },
  {
    kind: "log" as const,
    label: "CHANGE LOG · THIS CONTRACT",
    rows: [
      { clause: "4.2 Auto-renewal", status: "Struck", ok: true },
      { clause: "7.1 Price escalation", status: "Capped", ok: true },
      { clause: "9.3 Termination fee", status: "Waived", ok: true },
      { clause: "11.4 Data portability", status: "Added", ok: false },
    ],
  },
  {
    kind: "margin" as const,
    label: "ADVISOR MARGIN NOTE",
    note: "We've seen this clause forty times this quarter. It always moves.",
  },
] as const;

export default function Redline() {
  return (
    <div className={`rl ${serif.className} ${mono.variable}`}>
      <header className="rl-nav">
        <div className="rl-wrap rl-nav-in">
          <div className="rl-logo">MatchMaker HR</div>
          <nav className="rl-links">
            {NAV.map((n) => (
              <span key={n}>{n}</span>
            ))}
          </nav>
          <button className="rl-btn rl-line">Sign in</button>
          <button className="rl-btn rl-solid">Get started</button>
        </div>
      </header>

      <section className="rl-wrap rl-hero">
        <div className="rl-hero-copy">
          <span className="rl-eyebrow">CONTRACT REVIEW · INCLUDED FREE</span>
          <h1 className="rl-h1">We redline the terms vendors hope you skim.</h1>
          <p className="rl-lede">
            Auto-renewal clauses. Escalators past CPI. Termination fees nobody reads.
            Send us the draft before you sign and we mark it up like we&rsquo;re on your
            legal team — because for the hour it takes, we are.
          </p>

          <form className="rl-form" action="#">
            <input
              className="rl-input"
              type="email"
              placeholder="Work email"
              aria-label="Work email"
            />
            <button className="rl-btn rl-solid rl-lg" type="submit">
              Redline my contract
            </button>
          </form>
          <p className="rl-fine">
            Free for buyers. Providers pay a commission or referral fee. Terms can
            vary by provider.
          </p>
        </div>

        {/* SIGNATURE: an actual clause, marked up like tracked-changes on a page */}
        <div className="rl-doc">
          <div className="rl-doc-head">
            <span className="rl-doc-title">SaaS Master Services Agreement — Draft v3</span>
            <span className="rl-doc-tag">TRACKED CHANGES · 2 EDITS</span>
          </div>

          <div className="rl-clause">
            <span className="rl-clause-label">SECTION 4.2 — AUTO-RENEWAL</span>
            <p className="rl-clause-text">
              This Agreement shall{" "}
              <span className="rl-del">automatically renew for successive one-year terms</span>{" "}
              <span className="rl-ins">
                terminate at the end of the Initial Term unless renewed in writing by
                Customer
              </span>
              .
            </p>
            <div className="rl-note">
              <span className="rl-note-mark" aria-hidden="true">
                ↳
              </span>
              Vendor&rsquo;s standard term. We strike this in 94% of deals we review.
            </div>
          </div>

          <div className="rl-clause">
            <span className="rl-clause-label">SECTION 7.1 — PRICE ESCALATION</span>
            <p className="rl-clause-text">
              Vendor may increase fees <span className="rl-del">by up to 12%</span>{" "}
              <span className="rl-ins">by no more than CPI, capped at 5%</span> per year
              upon renewal.
            </p>
            <div className="rl-note">
              <span className="rl-note-mark" aria-hidden="true">
                ↳
              </span>
              The 12% ceiling is boilerplate. Ask, and most vendors drop it without a
              fight.
            </div>
          </div>
        </div>
      </section>

      <div className="rl-wrap rl-wall">
        <span className="rl-eyebrow">Reviewed</span>
        {VENDORS.slice(0, 12).map((v) => (
          <span className="rl-wall-v" key={v}>
            {v}
          </span>
        ))}
        <span className="rl-wall-v">+ 40 more</span>
      </div>

      <section className="rl-sec">
        <div className="rl-wrap">
          <div className="rl-sec-h">
            <span className="rl-eyebrow">01 — What we mark up</span>
            <h2 className="rl-h2">Six tools, one contract you actually understand</h2>
          </div>
          <div className="rl-tools">
            {TOOLS.map((t, i) => (
              <article className="rl-tool" key={t.key}>
                <div className="rl-tool-n">
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

      <section className="rl-sec rl-off">
        <div className="rl-wrap">
          <div className="rl-sec-h">
            <span className="rl-eyebrow">02 — The broker advantage</span>
            <h2 className="rl-h2">We&rsquo;ve read every vendor&rsquo;s playbook already</h2>
          </div>

          {ADVANTAGES.map((a, i) => {
            const panel = ADV_PANELS[i];
            return (
              <div className={`rl-adv${i % 2 === 1 ? " flip" : ""}`} key={a.title}>
                <div className="rl-adv-copy">
                  <span className="rl-eyebrow">Clause {i + 1}</span>
                  <h3>{a.title}</h3>
                  <p>
                    <b>{a.lead}</b> {a.body}
                  </p>
                  <ul className="rl-pts">
                    {a.points.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                </div>

                <div className="rl-panel">
                  {panel.kind === "redline" ? (
                    <>
                      <div className="rl-panel-h">{panel.label}</div>
                      <p className="rl-mini-clause">
                        {panel.lead} <span className="rl-del">{panel.before}</span>{" "}
                        <span className="rl-ins">{panel.after}</span>
                        {panel.tail}
                      </p>
                      <div className="rl-note">
                        <span className="rl-note-mark" aria-hidden="true">
                          ↳
                        </span>
                        {panel.note}
                      </div>
                    </>
                  ) : panel.kind === "log" ? (
                    <>
                      <div className="rl-panel-h">{panel.label}</div>
                      {panel.rows.map((r) => (
                        <div className="rl-logrow" key={r.clause}>
                          <span className={`rl-dot${r.ok ? " ok" : " add"}`} aria-hidden="true" />
                          <span className="rl-logrow-c">{r.clause}</span>
                          <span className="rl-logrow-s">{r.status}</span>
                        </div>
                      ))}
                    </>
                  ) : (
                    <>
                      <div className="rl-panel-h">{panel.label}</div>
                      <div className="rl-margin-quote">
                        <span className="rl-note-mark" aria-hidden="true">
                          ↳
                        </span>
                        {panel.note}
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rl-sec">
        <div className="rl-wrap">
          <div className="rl-sec-h">
            <span className="rl-eyebrow">03 — Method</span>
            <h2 className="rl-h2">How we&rsquo;re paid, and why it can&rsquo;t bias a redline</h2>
          </div>
          <div className="rl-trust">
            {TRUST.map((t, i) => (
              <article className="rl-tc" key={t.title}>
                <span className="rl-eyebrow">Note {i + 1}</span>
                <h3>{t.title}</h3>
                <p>{t.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <div className="rl-wrap">
        <div className="rl-stats">
          {STATS.map((s) => (
            <div key={s.label}>
              <div className="rl-st-n">{s.n}</div>
              <div className="rl-st-l">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      <section className="rl-sec rl-off">
        <div className="rl-wrap">
          <div className="rl-sec-h">
            <span className="rl-eyebrow">04 — Evidence</span>
            <h2 className="rl-h2">What a marked-up contract actually saves</h2>
          </div>
          <div className="rl-cases">
            {CASES.map((c) => (
              <article className="rl-case" key={c.title}>
                <div className="rl-case-n">{c.stat}</div>
                <div className="rl-case-nl">{c.statLabel}</div>
                <h3>{c.title}</h3>
                <p>{c.body}</p>
                <span className="rl-more">Case file →</span>
              </article>
            ))}
          </div>
        </div>
      </section>

      <div className="rl-wrap rl-news">
        <div>
          <h2>The Redline</h2>
          <p>One contract clause a month, marked up in public.</p>
        </div>
        <form className="rl-form rl-news-form" action="#">
          <input
            className="rl-input"
            type="email"
            placeholder="Work email"
            aria-label="Work email for newsletter"
          />
          <button className="rl-btn rl-solid rl-lg" type="submit">
            Subscribe
          </button>
        </form>
      </div>

      <footer className="rl-foot">
        <div className="rl-wrap">
          <div className="rl-fgrid">
            <div>
              <div className="rl-logo">MatchMaker HR</div>
              <p>
                Buyer-side HRIS brokerage. Free for buyers. Providers pay a
                commission or referral fee. Terms can vary by provider.
              </p>
            </div>
            <div className="rl-fc">
              <h4>For buyers</h4>
              <ul>
                <li>HRIS Marketplace</li>
                <li>Requirements Builder</li>
                <li>Advisory services</li>
                <li>Case studies</li>
              </ul>
            </div>
            <div className="rl-fc">
              <h4>Why us</h4>
              <ul>
                <li>Broker model</li>
                <li>How we make money</li>
                <li>Scoring methodology</li>
                <li>FAQ</li>
              </ul>
            </div>
            <div className="rl-fc">
              <h4>Resources</h4>
              <ul>
                <li>Blog</li>
                <li>HRIS Landscape Report</li>
                <li>Partner finder</li>
                <li>Contact</li>
              </ul>
            </div>
          </div>
          <div className="rl-fbot">
            <span>© 2026 MatchMaker HR</span>
            <span>Privacy · Terms · Commission disclosure</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
