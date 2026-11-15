import { ADVANTAGES, STATS, TOOLS, TRUST } from "../_content";
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
 * Split out so the live site can render it inside the shared site chrome.
 */
export function PulseBody() {
  return (
    <>
      {/* hero */}
      <section className="pu-hero">
        <div className="pu-wrap pu-hero-in">
          <div className="pu-hero-copy">
            <div className="pu-eyebrow">HR SOFTWARE SELECTION</div>
            <h1 className="pu-h1">Compare HR software options with vendor names hidden.</h1>
            <p className="pu-lede">
              Create a free account and describe your software needs. MMHR
              compares approved vendor options with names hidden, then sends
              your RFP to the vendors you select.
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

          {/* SIGNATURE — the first steps of the launch path */}
          <div className="pu-signal">
            <div className="pu-signal-head">
              <span className="pu-signal-label">How you start</span>
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

            <ol className="pu-legend">
              {TOOLS.slice(0, 3).map((step, i) => (
                <li key={step.key}>
                  <i className="pu-dot" aria-hidden="true" />
                  <span className="pu-legend-name">{step.name}</span>
                  <span className="pu-legend-meta">Step {i + 1}</span>
                </li>
              ))}
            </ol>

            <div className="pu-readout">
              Customers never pay MMHR. Providers pay MMHR a commission or referral fee.
            </div>
          </div>
        </div>
      </section>

      {/* category band (docs/PRD.md: initial category scope) */}
      <section className="pu-vwall">
        <div className="pu-wrap pu-vwall-in">
          <span className="pu-vwall-label">Category</span>
          <div className="pu-vwall-list">
            <span className="pu-vchip">HR software</span>
            <span className="pu-vchip">Workforce software</span>
          </div>
        </div>
      </section>

      {/* six tools */}
      <section className="pu-sec">
        <div className="pu-wrap">
          <div className="pu-head">
            <div className="pu-eye">How it works</div>
            <h2 className="pu-h2">From your needs to vendor responses</h2>
            <p className="pu-sub">
              You compare vendor options with names hidden. MMHR staff send
              your RFP to the vendors you choose.
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
            <div className="pu-eye">Protections</div>
            <h2 className="pu-h2">What stays private</h2>
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
                  <span className="pu-adv-status">{a.tag}</span>
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

      {/* newsletter */}
      <section className="pu-wrap pu-news-wrap">
        <div className="pu-news">
          <div>
            <h2>The Weekly Signal</h2>
            <p>Email updates from MatchMaker HR.</p>
          </div>
          <NewsletterForm />
        </div>
      </section>
    </>
  );
}
