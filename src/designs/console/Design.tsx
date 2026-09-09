import { Hanken_Grotesk, Red_Hat_Mono, Unbounded } from "next/font/google";

import { ADVANTAGES, CASES, NAV, STATS, TOOLS, TRUST, VENDORS } from "../_content";
import "./styles.css";

const body = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});
const display = Unbounded({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-display",
});
const mono = Red_Hat_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-mono",
});

const TILES = [
  {
    label: "REQUIREMENTS LOCKED",
    figure: "184 / 184",
    desc: "Every must-have tagged and weighted.",
    status: "active",
    cls: "co-tile-1",
  },
  {
    label: "COMMITTEE SCORED",
    figure: "4 / 4",
    desc: "HR, finance, IT, and the exec sponsor.",
    status: "active",
    cls: "co-tile-2",
  },
  {
    label: "SHORTLIST",
    figure: "5 active",
    desc: "Down from 52, in nine days.",
    status: "neutral",
    cls: "co-tile-3",
  },
  {
    label: "ADVISOR REVIEW",
    figure: "ETA 2h",
    desc: "Your latest proposal is in queue.",
    status: "neutral",
    cls: "co-tile-4",
  },
  {
    label: "DEMOS SCHEDULED",
    figure: "3 this week",
    desc: "Calendar synced with your committee.",
    status: "neutral",
    cls: "co-tile-5",
  },
  {
    label: "GO-LIVE TARGET",
    figure: "Mar 14",
    desc: "On track, per the current plan.",
    status: "active",
    cls: "co-tile-6",
  },
] as const;

export default function Console() {
  return (
    <div className={`co ${body.className} ${display.variable} ${mono.variable}`}>
      {/* header */}
      <header className="co-nav">
        <div className="co-wrap co-nav-in">
          <div className="co-logo">
            <span className="co-mark" />
            MatchMaker HR
          </div>
          <nav className="co-links">
            {NAV.map((n) => (
              <span key={n}>{n}</span>
            ))}
          </nav>
          <button className="co-btn co-ghost">Sign in</button>
          <button className="co-btn co-primary">Get started</button>
        </div>
      </header>

      {/* hero + console tile wall */}
      <section className="co-hero">
        <div className="co-wrap co-hero-in">
          <div className="co-eyebrow">
            <i />
            YOUR EVALUATION, LIVE
          </div>
          <h1 className="co-h1">Run your evaluation like mission control.</h1>
          <p className="co-lede">
            Every requirement, every score, every open question — in one
            console instead of six spreadsheets and a group chat.
          </p>

          <form className="co-form" action="#">
            <input
              className="co-input"
              type="email"
              placeholder="Work email"
              aria-label="Work email"
            />
            <button className="co-btn co-primary co-lg" type="submit">
              Open my console
            </button>
          </form>
          <p className="co-micro">
            Free for buyers. Providers pay a commission or referral fee. Terms
            can vary by provider.
          </p>

          {/* SIGNATURE — the console tile wall */}
          <div className="co-tiles">
            {TILES.map((t) => (
              <div className={`co-tile ${t.cls}`} key={t.label}>
                <div className="co-tile-top">
                  <span className="co-tile-label">{t.label}</span>
                  <i className="co-tile-dot" />
                </div>
                <div className="co-tile-figure">{t.figure}</div>
                <p className="co-tile-desc">{t.desc}</p>
                <div className={`co-bar co-bar-${t.status}`} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* vendor wall */}
      <section className="co-vendors">
        <div className="co-wrap co-vendors-in">
          <span className="co-vendors-label">Tracked</span>
          {VENDORS.slice(0, 12).map((v) => (
            <span className="co-vlogo" key={v}>
              {v}
            </span>
          ))}
          <span className="co-vlogo co-vlogo-more">+ 40 more</span>
        </div>
      </section>

      {/* six tools */}
      <section className="co-sec">
        <div className="co-wrap">
          <div className="co-head">
            <div className="co-eye">System modules</div>
            <h2 className="co-h2">Six modules, one console.</h2>
            <p className="co-sub">
              Every instrument your evaluation needs, wired into one panel.
            </p>
          </div>
          <div className="co-tools">
            {TOOLS.map((t, i) => (
              <div className="co-tool" key={t.key}>
                <div className="co-tool-n">MOD {String(i + 1).padStart(2, "0")}</div>
                <h3>{t.name}</h3>
                <p>{t.blurb}</p>
                <small>{t.detail}</small>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* broker advantage */}
      <section className="co-sec co-sec-p">
        <div className="co-wrap">
          <div className="co-head">
            <div className="co-eye">The broker advantage</div>
            <h2 className="co-h2">Instrumentation the vendors don&rsquo;t give you.</h2>
          </div>

          {ADVANTAGES.map((a, i) => (
            <div className="co-adv" key={a.title}>
              <div className="co-adv-copy">
                <div className="co-adv-n">
                  {String(i + 1).padStart(2, "0")}
                </div>
                <h3>{a.title}</h3>
                <p>
                  <b>{a.lead}</b> {a.body}
                </p>
                <ul className="co-pts">
                  {a.points.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </div>
              <div className="co-signal" aria-hidden="true">
                <span />
                <span />
                <span />
                <span />
                <span />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* method / trust */}
      <section className="co-sec">
        <div className="co-wrap">
          <div className="co-head">
            <div className="co-eye">Method</div>
            <h2 className="co-h2">How the console stays honest.</h2>
          </div>
          <div className="co-trust">
            {TRUST.map((t, i) => (
              <article className="co-tcard" key={t.title}>
                <div className="co-tk">
                  <i />
                  {String(i + 1).padStart(2, "0")}
                </div>
                <h3>{t.title}</h3>
                <p>{t.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* stats band */}
      <section className="co-stats">
        <div className="co-wrap co-stats-in">
          {STATS.map((s) => (
            <div className="co-stat" key={s.label}>
              <div className="co-stat-n">{s.n}</div>
              <div className="co-stat-l">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* case studies */}
      <section className="co-sec">
        <div className="co-wrap">
          <div className="co-head">
            <div className="co-eye">Mission logs</div>
            <h2 className="co-h2">Selections completed, logged.</h2>
          </div>
          <div className="co-cases">
            {CASES.map((c) => (
              <article className="co-case" key={c.title}>
                <div className="co-case-n">{c.stat}</div>
                <div className="co-case-nl">{c.statLabel}</div>
                <h3>{c.title}</h3>
                <p>{c.body}</p>
                <span className="co-read">Read log →</span>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* newsletter */}
      <section className="co-sec co-sec-news">
        <div className="co-wrap">
          <div className="co-news">
            <div>
              <h2>System Update</h2>
              <p>One console improvement a month, before anyone else sees it.</p>
            </div>
            <form className="co-form co-form-news" action="#">
              <input
                className="co-input"
                type="email"
                placeholder="Work email"
                aria-label="Work email for newsletter"
              />
              <button className="co-btn co-primary co-lg" type="submit">
                Subscribe
              </button>
            </form>
          </div>
        </div>
      </section>

      {/* footer */}
      <footer className="co-foot">
        <div className="co-wrap">
          <div className="co-fgrid">
            <div>
              <div className="co-logo">
                <span className="co-mark" />
                MatchMaker HR
              </div>
              <p>
                Buyer-side HRIS brokerage. Free for buyers. Providers pay a
                commission or referral fee. Terms can vary by provider.
              </p>
            </div>
            <div className="co-fcol">
              <h4>For buyers</h4>
              <ul>
                <li>HRIS Marketplace</li>
                <li>Requirements Builder</li>
                <li>Advisory services</li>
                <li>Case studies</li>
              </ul>
            </div>
            <div className="co-fcol">
              <h4>Why us</h4>
              <ul>
                <li>Broker model</li>
                <li>How we make money</li>
                <li>Scoring methodology</li>
                <li>FAQ</li>
              </ul>
            </div>
            <div className="co-fcol">
              <h4>Resources</h4>
              <ul>
                <li>Blog</li>
                <li>HRIS Landscape Report</li>
                <li>Partner finder</li>
                <li>Contact</li>
              </ul>
            </div>
          </div>
          <div className="co-fbot">
            <span>© 2026 MatchMaker HR</span>
            <span>Privacy · Terms · Commission disclosure</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
