import { ADVANTAGES, CASES, STATS, TOOLS, TRUST, VENDORS } from "../_content";
import NewsletterForm from "./newsletter-form";

/* A 600-unit heartbeat/oscilloscope trace, repeated once more (offset +600)
   inside a 1200-wide viewBox so the shape is seamless end-to-start — the same
   loop trick as marquee's logo band, just drawn instead of duplicated markup. */
const WAVE_POINTS =
  "0,60 30,60 45,40 55,80 65,20 75,60 150,60 165,45 175,75 185,60 260,60 275,38 285,82 295,15 305,60 380,60 395,45 405,75 415,60 490,60 505,40 515,80 525,20 535,60 600,60 " +
  "630,60 645,40 655,80 665,20 675,60 750,60 765,45 775,75 785,60 860,60 875,38 885,82 895,15 905,60 980,60 995,45 1005,75 1015,60 1090,60 1105,40 1115,80 1125,20 1135,60 1200,60";

const MINI_WAVE = "0,24 10,24 16,12 21,34 26,4 32,24 62,24 68,14 73,30 78,24 108,24 114,10 119,36 124,24 150,24";

/**
 * The Pulse homepage, minus nav and footer.
 *
 * Split out so the live site can render it inside the shared site chrome while
 * the design gallery still renders a complete, self-contained Pulse.
 */
export function PulseBody() {
  return (
    <>
      {/* hero */}
      <section className="pu-hero">
        <div className="pu-wrap pu-hero-in">
          <div className="pu-hero-copy">
            <div className="pu-eyebrow">AUTOMATED RESEARCH PIPELINE</div>
            <h1 className="pu-h1">Pricing that&rsquo;s verified continuously, not once.</h1>
            <p className="pu-lede">
              Every vendor in the marketplace gets re-checked on a schedule — not
              when someone remembers to. This is what that looks like: a live
              signal, not a static list.
            </p>
            <form className="pu-form" action="/sign-up" method="get">
              <input
                className="pu-input"
                type="email"
                name="email"
                required
                maxLength={254}
                placeholder="Work email"
                aria-label="Work email"
              />
              <button className="pu-btn pu-solid pu-lg" type="submit">
                Get access
              </button>
            </form>
            <p className="pu-fine">
              Free to buyers. Providers pay us under commission or referral
              arrangements.
            </p>
          </div>

          {/* SIGNATURE — the live verification signal */}
          <div className="pu-signal">
            <div className="pu-signal-head">
              <span className="pu-signal-label">VERIFICATION SIGNAL — LAST 24H</span>
              <span className="pu-live">
                <i className="pu-live-dot" aria-hidden="true" />
                LIVE
              </span>
            </div>

            <div className="pu-signal-scope">
              <svg
                className="pu-signal-svg"
                viewBox="0 0 1200 120"
                width="1200"
                height="120"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <polyline points={WAVE_POINTS} />
              </svg>
            </div>

            <ul className="pu-legend">
              <li>
                <i className="pu-dot" aria-hidden="true" />
                <span className="pu-legend-name">Rippling</span>
                <span className="pu-legend-meta">re-verified 14m ago</span>
              </li>
              <li>
                <i className="pu-dot" aria-hidden="true" />
                <span className="pu-legend-name">BambooHR</span>
                <span className="pu-legend-meta">re-verified 41m ago</span>
              </li>
              <li>
                <i className="pu-dot" aria-hidden="true" />
                <span className="pu-legend-name">Paycor</span>
                <span className="pu-legend-meta">re-verified 2h ago</span>
              </li>
            </ul>

            <div className="pu-readout">
              52 systems monitored · 1 check every 6h · 0 stale profiles
            </div>
          </div>
        </div>
      </section>

      {/* vendor wall */}
      <section className="pu-vwall">
        <div className="pu-wrap pu-vwall-in">
          <span className="pu-vwall-label">Monitored</span>
          <div className="pu-vwall-list">
            {VENDORS.slice(0, 12).map((v) => (
              <span className="pu-vchip" key={v}>
                {v}
              </span>
            ))}
            <span className="pu-vchip pu-vchip-more">+ 40 more</span>
          </div>
        </div>
      </section>

      {/* six tools */}
      <section className="pu-sec">
        <div className="pu-wrap">
          <div className="pu-head">
            <div className="pu-eye">The instrument panel</div>
            <h2 className="pu-h2">Six gauges on one dashboard</h2>
            <p className="pu-sub">
              Everything a buying committee needs to run a real evaluation,
              instrumented instead of improvised.
            </p>
          </div>
          <div className="pu-tools">
            {TOOLS.map((t, i) => (
              <div className="pu-tool" key={t.key}>
                <div className="pu-tool-n">{String(i + 1).padStart(2, "0")}</div>
                <h3>{t.name}</h3>
                <p>{t.blurb}</p>
                <small>{t.detail}</small>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* broker advantage */}
      <section className="pu-sec pu-sec-surface">
        <div className="pu-wrap">
          <div className="pu-head">
            <div className="pu-eye">The broker advantage</div>
            <h2 className="pu-h2">Why the signal never goes stale</h2>
          </div>

          {ADVANTAGES.map((a, i) => (
            <div className="pu-adv" key={a.title}>
              <div className="pu-adv-copy">
                <h3>{a.title}</h3>
                <p>
                  <b>{a.lead}</b> {a.body}
                </p>
              </div>

              <div className="pu-adv-panel">
                <div className="pu-adv-panel-h">
                  <span>CH.{String(i + 1).padStart(2, "0")}</span>
                  <span className="pu-adv-status">ONLINE</span>
                </div>
                <svg
                  className="pu-mini-wave"
                  viewBox="0 0 150 48"
                  width="150"
                  height="48"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <polyline points={MINI_WAVE} />
                </svg>
                <ul className="pu-adv-points">
                  {a.points.map((p) => (
                    <li key={p}>
                      <i aria-hidden="true" />
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* method / trust */}
      <section className="pu-sec">
        <div className="pu-wrap">
          <div className="pu-head">
            <div className="pu-eye">Method</div>
            <h2 className="pu-h2">How the commission works</h2>
          </div>
          <div className="pu-trust">
            {TRUST.map((t, i) => (
              <article className="pu-tcard" key={t.title}>
                <div className="pu-tcard-k">M.{String(i + 1).padStart(2, "0")}</div>
                <h3>{t.title}</h3>
                <p>{t.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* stats */}
      <section className="pu-wrap pu-stats-wrap">
        <div className="pu-stats">
          {STATS.map((s) => (
            <div className="pu-stat" key={s.label}>
              <div className="pu-stat-n">{s.n}</div>
              <div className="pu-stat-l">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* case studies */}
      <section className="pu-sec">
        <div className="pu-wrap">
          <div className="pu-head">
            <div className="pu-eye">Signal history</div>
            <h2 className="pu-h2">What continuous verification is worth</h2>
          </div>
          <div className="pu-cases">
            {CASES.map((c) => (
              <article className="pu-case" key={c.title}>
                <div className="pu-case-n">{c.stat}</div>
                <div className="pu-case-nl">{c.statLabel}</div>
                <h3>{c.title}</h3>
                <p>{c.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* newsletter */}
      <section className="pu-wrap pu-news-wrap">
        <div className="pu-news">
          <div>
            <h2>The Weekly Signal</h2>
            <p>What moved in vendor pricing this week, in one email.</p>
          </div>
          <NewsletterForm />
        </div>
      </section>
    </>
  );
}
