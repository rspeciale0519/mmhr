import { Albert_Sans, Geist_Mono } from "next/font/google";

import { ADVANTAGES, CASES, NAV, STATS, TOOLS, TRUST, VENDORS } from "../_content";
import "./styles.css";

const body = Albert_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});
const mono = Geist_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
});

const focusStats = STATS.slice(0, 3);
const vendorRow = VENDORS.slice(0, 12);

export default function Aperture() {
  return (
    <div className={`ap ${body.className} ${mono.variable}`}>
      {/* nav */}
      <header className="ap-nav">
        <div className="ap-wrap ap-nav-in">
          <div className="ap-logo">
            <span className="ap-mark" aria-hidden="true" />
            MatchMaker HR
          </div>
          <nav className="ap-links">
            {NAV.map((n) => (
              <span key={n}>{n}</span>
            ))}
          </nav>
          <button className="ap-btn ap-ghost">Sign in</button>
          <button className="ap-btn ap-primary">Get started</button>
        </div>
      </header>

      {/* hero */}
      <section className="ap-hero">
        <div className="ap-wrap ap-hero-in">
          <div className="ap-eyebrow">EVERY VENDOR. ONE VIEW.</div>
          <h1 className="ap-h1">Every vendor. One clear picture.</h1>
          <p className="ap-lede">
            No noise, no sales calls, no fifty tabs open. Just the numbers that
            matter, verified and in focus.
          </p>

          <form className="ap-form" action="#">
            <input
              className="ap-input"
              type="email"
              placeholder="Work email"
              aria-label="Work email"
            />
            <button className="ap-btn ap-primary ap-lg" type="submit">
              Bring it into focus
            </button>
          </form>
          <p className="ap-fine">
            Free for buyers. Providers pay a commission or referral fee. Terms
            can vary by provider.
          </p>

          {/* SIGNATURE: the focus card */}
          <div className="ap-focus">
            {focusStats.map((s) => (
              <div className="ap-focus-stat" key={s.label}>
                <div className="ap-focus-n">{s.n}</div>
                <div className="ap-focus-l">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* vendor wall */}
      <section className="ap-wall">
        <div className="ap-wrap">
          <div className="ap-wall-l">In view</div>
          <div className="ap-wall-row">
            {vendorRow.map((v) => (
              <span className="ap-vlogo" key={v}>
                {v}
              </span>
            ))}
            <span className="ap-vlogo ap-vmore">+ 40 more</span>
          </div>
        </div>
      </section>

      {/* tools */}
      <section className="ap-sec">
        <div className="ap-wrap">
          <div className="ap-head">
            <div className="ap-eye">What&rsquo;s in focus</div>
            <h2 className="ap-h2">Six tools, one clear picture</h2>
          </div>
          <div className="ap-tools">
            {TOOLS.map((t) => (
              <article className="ap-tool" key={t.key}>
                <h3>{t.name}</h3>
                <p>{t.blurb}</p>
                <small>{t.detail}</small>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* advantages */}
      <section className="ap-sec">
        <div className="ap-wrap">
          <div className="ap-head">
            <div className="ap-eye">The broker advantage</div>
            <h2 className="ap-h2">Precision, where the market has none</h2>
          </div>
          <div className="ap-advs">
            {ADVANTAGES.map((a) => (
              <article className="ap-adv" key={a.title}>
                <h3>{a.title}</h3>
                <p className="ap-adv-lead">{a.lead}</p>
                <p>{a.body}</p>
                <ul className="ap-pts">
                  {a.points.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* method / trust */}
      <section className="ap-sec">
        <div className="ap-wrap">
          <div className="ap-head">
            <div className="ap-eye">Method</div>
            <h2 className="ap-h2">Verified, not vibes</h2>
          </div>
          <div className="ap-trust">
            {TRUST.map((t) => (
              <article className="ap-tcard" key={t.title}>
                <h3>{t.title}</h3>
                <p>{t.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* stats band */}
      <section className="ap-sec ap-stats-sec">
        <div className="ap-wrap">
          <div className="ap-stats">
            {STATS.map((s) => (
              <div className="ap-stat" key={s.label}>
                <div className="ap-stat-n">{s.n}</div>
                <div className="ap-stat-l">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* case studies */}
      <section className="ap-sec">
        <div className="ap-wrap">
          <div className="ap-head">
            <div className="ap-eye">Recently in focus</div>
            <h2 className="ap-h2">Clear pictures, real outcomes</h2>
          </div>
          <div className="ap-cases">
            {CASES.map((c) => (
              <article className="ap-case" key={c.title}>
                <div className="ap-case-n">{c.stat}</div>
                <div className="ap-case-l">{c.statLabel}</div>
                <h3>{c.title}</h3>
                <p>{c.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* newsletter */}
      <section className="ap-sec">
        <div className="ap-wrap">
          <div className="ap-news">
            <div>
              <h2>Stay in Focus</h2>
              <p>One clear signal about the market, once a month.</p>
            </div>
            <form className="ap-form" action="#">
              <input
                className="ap-input"
                type="email"
                placeholder="Work email"
                aria-label="Work email for newsletter"
              />
              <button className="ap-btn ap-primary ap-lg" type="submit">
                Subscribe
              </button>
            </form>
          </div>
        </div>
      </section>

      {/* footer */}
      <footer className="ap-foot">
        <div className="ap-wrap">
          <div className="ap-fgrid">
            <div className="ap-fbrand">
              <div className="ap-logo">
                <span className="ap-mark" aria-hidden="true" />
                MatchMaker HR
              </div>
              <p>
                Buyer-side HRIS brokerage. Free for buyers. Providers pay a
                commission or referral fee. Terms can vary by provider.
              </p>
            </div>
            <div className="ap-fcol">
              <h4>For buyers</h4>
              <ul>
                <li>HRIS Marketplace</li>
                <li>Requirements Builder</li>
                <li>Advisory services</li>
                <li>Case studies</li>
              </ul>
            </div>
            <div className="ap-fcol">
              <h4>Why us</h4>
              <ul>
                <li>Broker model</li>
                <li>How we make money</li>
                <li>Scoring methodology</li>
                <li>FAQ</li>
              </ul>
            </div>
            <div className="ap-fcol">
              <h4>Resources</h4>
              <ul>
                <li>Blog</li>
                <li>HRIS Landscape Report</li>
                <li>Partner finder</li>
                <li>Contact</li>
              </ul>
            </div>
          </div>
          <div className="ap-fbot">
            <span>© 2026 MatchMaker HR</span>
            <span>Privacy · Terms · Commission disclosure</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
