import { Azeret_Mono, Bricolage_Grotesque } from "next/font/google";

import { ADVANTAGES, CASES, NAV, STATS, TOOLS, TRUST, VENDORS } from "../_content";
import "./styles.css";

const body = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});
const mono = Azeret_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
});

/**
 * SIGNATURE: the node graph. Coordinates are percentages of a 100x100 SVG
 * viewBox that lines up exactly with the percentage left/top used to place
 * the HTML dot + label for each vendor, so the line endpoints and the dots
 * always coincide regardless of container size.
 *
 * `dir` controls which side of the dot the label is anchored to — chosen
 * per node so nothing clips the graph's 8%-92% safe margin and no two
 * labels overlap each other or the center YOU node. See the collision
 * check in the project notes: each direction was picked by walking the
 * nine positions and confirming label bounding boxes clear their
 * neighbors given the graph's min 340px box.
 */
const VENDOR_NODES = [
  { name: "Rippling", left: 78, top: 22, fit: 91, top3: true, dir: "below" },
  { name: "Workday", left: 15, top: 30, fit: 38, top3: false, dir: "right" },
  { name: "ADP", left: 85, top: 68, fit: 44, top3: false, dir: "left" },
  { name: "Paylocity", left: 30, top: 78, fit: 86, top3: true, dir: "above" },
  { name: "UKG", left: 62, top: 85, fit: 35, top3: false, dir: "above" },
  { name: "Gusto", left: 10, top: 62, fit: 52, top3: false, dir: "right" },
  { name: "BambooHR", left: 40, top: 12, fit: 79, top3: true, dir: "below" },
  { name: "Dayforce", left: 90, top: 45, fit: 28, top3: false, dir: "left" },
  { name: "Paycom", left: 22, top: 48, fit: 41, top3: false, dir: "right" },
] as const;

export default function Lattice() {
  return (
    <div className={`la ${body.className} ${mono.variable}`}>
      <header className="la-nav">
        <div className="la-wrap la-nav-in">
          <div className="la-logo">
            <span className="la-logo-dot" aria-hidden="true" />
            MatchMaker HR
          </div>
          <nav className="la-links">
            {NAV.map((n) => (
              <span key={n}>{n}</span>
            ))}
          </nav>
          <div className="la-nav-cta">
            <button className="la-btn la-btn-ghost">Sign in</button>
            <button className="la-btn la-btn-solid">Get started</button>
          </div>
        </div>
      </header>

      <section className="la-hero">
        <div className="la-wrap la-hero-in">
          <div className="la-hero-copy">
            <div className="la-eyebrow">
              <span className="la-eyebrow-dot" aria-hidden="true" />
              52 SYSTEMS, ONE MAP
            </div>
            <h1 className="la-h1">
              You&rsquo;re <span className="la-accent">the center of this market</span>. We
              just draw the map.
            </h1>
            <p className="la-lede">
              Fifty-two systems, scored against exactly what you need, then shown as what
              they are: a small number of real fits and a lot of noise.
            </p>

            <form className="la-form" action="#">
              <input
                className="la-input"
                type="email"
                placeholder="Work email"
                aria-label="Work email"
              />
              <button className="la-btn la-btn-solid la-btn-lg" type="submit">
                Map my requirements
              </button>
            </form>
            <p className="la-fine">
              Free for buyers. Providers pay a commission or referral fee. Terms
              can vary by provider.
            </p>
          </div>

          <div className="la-hero-graph">
            <div className="la-graph">
              <div className="la-you">YOU</div>
              <svg
                className="la-graph-svg"
                viewBox="0 0 100 100"
                aria-hidden="true"
                focusable="false"
              >
                {VENDOR_NODES.map((v) => (
                  <line
                    key={v.name}
                    x1="50"
                    y1="50"
                    x2={v.left}
                    y2={v.top}
                    stroke={v.top3 ? "var(--violet)" : "var(--line)"}
                    strokeWidth={v.top3 ? 1.5 : 1}
                  />
                ))}
              </svg>
              {VENDOR_NODES.map((v) => (
                <div className="la-node" style={{ left: `${v.left}%`, top: `${v.top}%` }} key={v.name}>
                  <span className={`la-dot ${v.top3 ? "la-dot-top" : "la-dot-min"}`} />
                  <span
                    className={`la-label la-lbl-${v.dir} ${v.top3 ? "la-label-top" : "la-label-min"}`}
                  >
                    {v.top3 ? `${v.name} — ${v.fit}% fit` : v.name}
                  </span>
                </div>
              ))}
            </div>
            <div className="la-legend">
              <span>
                <i className="la-legend-dot top" aria-hidden="true" /> Top 3 fit
              </span>
              <span>
                <i className="la-legend-dot" aria-hidden="true" /> Scored, not shortlisted
              </span>
            </div>
          </div>
        </div>
      </section>

      <div className="la-wrap la-wall">
        <span className="la-wall-label">Mapped</span>
        <div className="la-wall-list">
          {VENDORS.slice(0, 12).map((v) => (
            <span className="la-wall-v" key={v}>
              {v}
            </span>
          ))}
          <span className="la-wall-more">+ 40 more</span>
        </div>
      </div>

      <section className="la-sec">
        <div className="la-wrap">
          <div className="la-sec-head">
            <span className="la-eyebrow la-eyebrow-static">How the map gets drawn</span>
            <h2 className="la-h2">Every coordinate is measured, not guessed.</h2>
          </div>
          <div className="la-tools">
            {TOOLS.map((t, i) => (
              <article className="la-tool" key={t.key}>
                <div className="la-tool-idx">CH.{String(i + 1).padStart(2, "0")}</div>
                <h3>{t.name}</h3>
                <p>{t.blurb}</p>
                <small>{t.detail}</small>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="la-sec la-sec-alt">
        <div className="la-wrap">
          <div className="la-sec-head">
            <span className="la-eyebrow la-eyebrow-static">The broker advantage</span>
            <h2 className="la-h2">Why the map is drawn by us, not them.</h2>
          </div>
          <div className="la-advs">
            {ADVANTAGES.map((a, i) => (
              <article className="la-adv" key={a.title}>
                <span className="la-adv-idx">{String(i + 1).padStart(2, "0")}</span>
                <div className="la-adv-copy">
                  <h3>{a.title}</h3>
                  <p>
                    <b>{a.lead}</b> {a.body}
                  </p>
                  <ul className="la-pts">
                    {a.points.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="la-sec">
        <div className="la-wrap">
          <div className="la-sec-head">
            <span className="la-eyebrow la-eyebrow-static">Method</span>
            <h2 className="la-h2">Three lines, the whole model.</h2>
          </div>
          <div className="la-trust">
            {TRUST.map((t) => (
              <article className="la-tc" key={t.title}>
                <h3>{t.title}</h3>
                <p>{t.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="la-sec la-sec-alt">
        <div className="la-wrap la-stats">
          {STATS.map((s) => (
            <div className="la-stat" key={s.label}>
              <div className="la-stat-n">{s.n}</div>
              <div className="la-stat-l">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="la-sec">
        <div className="la-wrap">
          <div className="la-sec-head">
            <span className="la-eyebrow la-eyebrow-static">Real maps, real buyers</span>
            <h2 className="la-h2">Selections we mapped, start to signature.</h2>
          </div>
          <div className="la-cases">
            {CASES.map((c) => (
              <article className="la-case" key={c.title}>
                <div className="la-case-stat">{c.stat}</div>
                <div className="la-case-label">{c.statLabel}</div>
                <h3>{c.title}</h3>
                <p>{c.body}</p>
                <span className="la-case-more">Read the map</span>
              </article>
            ))}
          </div>
        </div>
      </section>

      <div className="la-wrap la-news">
        <div className="la-news-copy">
          <h2>New Coordinates</h2>
          <p>Where the market moved this month, mapped in one email.</p>
        </div>
        <form className="la-form la-news-form" action="#">
          <input
            className="la-input"
            type="email"
            placeholder="Work email"
            aria-label="Work email for newsletter"
          />
          <button className="la-btn la-btn-solid la-btn-lg" type="submit">
            Subscribe
          </button>
        </form>
      </div>

      <footer className="la-foot">
        <div className="la-wrap">
          <div className="la-fgrid">
            <div className="la-fbrand">
              <div className="la-logo">
                <span className="la-logo-dot" aria-hidden="true" />
                MatchMaker HR
              </div>
              <p>
                Buyer-side HRIS brokerage. Free for buyers. Providers pay a
                commission or referral fee. Terms can vary by provider.
              </p>
            </div>
            <div className="la-fcol">
              <h4>For buyers</h4>
              <ul>
                <li>HRIS Marketplace</li>
                <li>Requirements Builder</li>
                <li>Advisory services</li>
                <li>Case studies</li>
              </ul>
            </div>
            <div className="la-fcol">
              <h4>Why us</h4>
              <ul>
                <li>Broker model</li>
                <li>How we make money</li>
                <li>Scoring methodology</li>
                <li>FAQ</li>
              </ul>
            </div>
            <div className="la-fcol">
              <h4>Resources</h4>
              <ul>
                <li>Blog</li>
                <li>HRIS Landscape Report</li>
                <li>Partner finder</li>
                <li>Contact</li>
              </ul>
            </div>
          </div>
          <div className="la-fbot">
            <span>© 2026 MatchMaker HR</span>
            <span>Privacy · Terms · Commission disclosure</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
