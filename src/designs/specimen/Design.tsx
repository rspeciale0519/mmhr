import { Fraunces, Work_Sans } from "next/font/google";

import { ADVANTAGES, CASES, NAV, STATS, TOOLS, TRUST, VENDORS } from "../_content";
import "./styles.css";

const display = Fraunces({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-display",
});
const body = Work_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-body",
});

/**
 * The two supporting entries under the main plate, so the signature device
 * reads as a running catalogue rather than a one-off hero graphic. Invented
 * for layout purposes, same as the placeholder figures in bureau/redline.
 */
const MINI_SPECIMENS = [
  {
    no: "Plate No. 027",
    name: "BambooHR",
    marks:
      "Core HR with light payroll, friendliest onboarding in its price tier, thin on workflow automation past 300 employees.",
  },
  {
    no: "Plate No. 038",
    name: "Paycor",
    marks:
      "Deep payroll and compliance tooling for regulated industries, service model tilts high-touch, integration library is narrower than peers.",
  },
] as const;

function ScaleBar({ ticks = 5, className = "" }: { ticks?: number; className?: string }) {
  return (
    <div className={`sp-scale ${className}`} role="presentation" aria-hidden="true">
      <span className="sp-scale-line" />
      <span className="sp-scale-ticks">
        {Array.from({ length: ticks }).map((_, i) => (
          <i key={i} />
        ))}
      </span>
    </div>
  );
}

export default function Specimen() {
  return (
    <div className={`sp ${body.className} ${display.variable}`}>
      <header className="sp-nav">
        <div className="sp-wrap sp-nav-in">
          <div className="sp-logo">MatchMaker HR</div>
          <nav className="sp-links">
            {NAV.map((n) => (
              <span key={n}>{n}</span>
            ))}
          </nav>
          <button className="sp-btn sp-ghost">Sign in</button>
          <button className="sp-btn sp-solid">Get started</button>
        </div>
      </header>

      <section className="sp-wrap sp-hero">
        <div className="sp-hero-text">
          <p className="sp-eyebrow">A field guide to HR software &middot; Vol. II</p>
          <h1 className="sp-h1">
            Fifty-two systems, catalogued <i>honestly</i>.
          </h1>
          <p className="sp-lede">
            Every HRIS worth considering, described the way a field guide
            describes a species: habitat, distinguishing marks, and the
            conditions it thrives in. No vendor wrote a word of it.
          </p>
          <form className="sp-form" action="#">
            <input
              className="sp-input"
              type="email"
              placeholder="Work email"
              aria-label="Work email"
            />
            <button className="sp-btn sp-solid sp-lg" type="submit">
              Get the field guide
            </button>
          </form>
          <p className="sp-fine">
            Free for buyers. Providers pay a commission or referral fee. Terms
            can vary by provider.
          </p>
        </div>

        {/* SIGNATURE: the specimen plate, plus two shorter entries beneath it */}
        <div className="sp-plates">
          <article className="sp-plate">
            <span className="sp-plate-label">Plate No. 014</span>
            <h2 className="sp-plate-name">Rippling</h2>
            <ScaleBar />
            <dl className="sp-fields">
              <div className="sp-field">
                <dt>Habitat</dt>
                <dd>200&ndash;2,000 employees, distributed or multi-entity teams</dd>
              </div>
              <div className="sp-field">
                <dt>Distinguishing marks</dt>
                <dd>
                  Device management bundled in, premium price tier, 12-month
                  minimum term
                </dd>
              </div>
              <div className="sp-field">
                <dt>Field notes</dt>
                <dd>
                  Strong for IT-heavy buyers who already standardize hardware
                  through it. Ask about the minimum term before you
                  shortlist.
                </dd>
              </div>
            </dl>
          </article>

          <div className="sp-mini-row">
            {MINI_SPECIMENS.map((m) => (
              <article className="sp-mini" key={m.no}>
                <span className="sp-mini-no">{m.no}</span>
                <h3 className="sp-mini-name">{m.name}</h3>
                <p className="sp-mini-marks">{m.marks}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <div className="sp-wrap sp-wall">
        <span className="sp-wall-label">Catalogued</span>
        <div className="sp-wall-list">
          {VENDORS.slice(0, 12).map((v) => (
            <span key={v}>{v}</span>
          ))}
          <span>+ 40 more</span>
        </div>
      </div>

      <div className="sp-wrap">
        <ScaleBar ticks={9} className="sp-divider" />
      </div>

      <section className="sp-sec">
        <div className="sp-wrap">
          <div className="sp-sec-head">
            <span className="sp-eyebrow">How we classify a system</span>
            <h2 className="sp-h2">Six fields, every entry</h2>
          </div>
          <div className="sp-tools-grid">
            {TOOLS.map((t) => (
              <article className="sp-tool" key={t.key}>
                <h3>{t.name}</h3>
                <p>{t.blurb}</p>
                <span className="sp-tool-detail">{t.detail}</span>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="sp-sec sp-tint">
        <div className="sp-wrap">
          <div className="sp-sec-head">
            <span className="sp-eyebrow">Field notes</span>
            <h2 className="sp-h2">What an independent eye catches</h2>
          </div>
          <div className="sp-adv-grid">
            {ADVANTAGES.map((a) => (
              <article className="sp-adv" key={a.title}>
                <h3>{a.title}</h3>
                <p>
                  <b>{a.lead}</b> {a.body}
                </p>
                <ul className="sp-adv-pts">
                  {a.points.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="sp-sec">
        <div className="sp-wrap">
          <div className="sp-sec-head">
            <span className="sp-eyebrow">Method</span>
            <h2 className="sp-h2">How a specimen is verified</h2>
          </div>
          <div className="sp-trust-grid">
            {TRUST.map((t) => (
              <article className="sp-trust" key={t.title}>
                <h3>{t.title}</h3>
                <p>{t.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <div className="sp-wrap">
        <ScaleBar ticks={9} className="sp-divider" />
      </div>

      <div className="sp-wrap">
        <div className="sp-plaque">
          <span className="sp-plaque-label">Specimen count</span>
          <div className="sp-plaque-grid">
            {STATS.map((s) => (
              <div className="sp-plaque-item" key={s.label}>
                <span className="sp-plaque-n">{s.n}</span>
                <span className="sp-plaque-l">{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <section className="sp-sec">
        <div className="sp-wrap">
          <div className="sp-sec-head">
            <span className="sp-eyebrow">Field reports</span>
            <h2 className="sp-h2">Buyers who used the guide</h2>
          </div>
          <div className="sp-cases-grid">
            {CASES.map((c) => (
              <article className="sp-case" key={c.title}>
                <span className="sp-case-stat">{c.stat}</span>
                <span className="sp-case-statl">{c.statLabel}</span>
                <h3>{c.title}</h3>
                <p>{c.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <div className="sp-wrap sp-news">
        <div>
          <h2>New Plates, Monthly</h2>
          <p>One vendor, fully catalogued, in your inbox once a month.</p>
        </div>
        <form className="sp-form" action="#">
          <input
            className="sp-input"
            type="email"
            placeholder="Work email"
            aria-label="Work email for newsletter"
          />
          <button className="sp-btn sp-solid sp-lg" type="submit">
            Subscribe
          </button>
        </form>
      </div>

      <div className="sp-wrap">
        <ScaleBar ticks={9} className="sp-divider" />
      </div>

      <footer className="sp-foot">
        <div className="sp-wrap sp-foot-in">
          <div className="sp-fgrid">
            <div className="sp-fbrand">
              <div className="sp-logo">MatchMaker HR</div>
              <p>
                Buyer-side HRIS brokerage. Free for buyers. Providers pay a
                commission or referral fee. Terms can vary by provider.
              </p>
            </div>
            <div className="sp-fcol">
              <h4>For buyers</h4>
              <ul>
                <li>HRIS Marketplace</li>
                <li>Requirements Builder</li>
                <li>Advisory services</li>
                <li>Case studies</li>
              </ul>
            </div>
            <div className="sp-fcol">
              <h4>Why us</h4>
              <ul>
                <li>Broker model</li>
                <li>How we make money</li>
                <li>Scoring methodology</li>
                <li>FAQ</li>
              </ul>
            </div>
            <div className="sp-fcol">
              <h4>Resources</h4>
              <ul>
                <li>Blog</li>
                <li>HRIS Landscape Report</li>
                <li>Partner finder</li>
                <li>Contact</li>
              </ul>
            </div>
          </div>
          <div className="sp-fbot">
            <span>&copy; 2026 MatchMaker HR</span>
            <span>Privacy &middot; Terms &middot; Commission disclosure</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
