import { Barlow_Condensed, Public_Sans, Roboto_Mono } from "next/font/google";

import { ADVANTAGES, CASES, NAV, STATS, TOOLS, TRUST, VENDORS } from "../_content";
import "./styles.css";

const display = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
});
const body = Public_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-body",
});
const mono = Roboto_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-mono",
});

/**
 * The itemized lines on the signature label. These sum exactly to the
 * sticker price below — $84,000 + $41,200 + $18,000 + $18,200 = $161,400.
 */
const ITEMS = [
  { name: "BASE SYSTEM", price: "$84,000" },
  { name: "MODULES (4)", price: "$41,200" },
  { name: "IMPLEMENTATION", price: "$18,000" },
  { name: "SUPPORT TIER (PREMIUM)", price: "$18,200" },
];

/**
 * Bar widths as flex-grow weights rather than fixed pixels, so the barcode
 * always fills its container and can never force horizontal scroll.
 */
const BARCODE = [2, 4, 1, 3, 5, 2, 1, 4, 3, 2, 5, 1, 2, 3, 4, 1, 3, 2, 4, 1, 5, 2, 3, 1, 4, 2];

export default function Sticker() {
  return (
    <div className={`sk ${body.className} ${display.variable} ${mono.variable}`}>
      <header className="sk-nav">
        <div className="sk-wrap sk-nav-in">
          <div className="sk-logo">MatchMaker HR</div>
          <nav className="sk-links">
            {NAV.map((n) => (
              <span key={n}>{n}</span>
            ))}
          </nav>
          <button className="sk-btn sk-btn-line">Sign in</button>
          <button className="sk-btn sk-btn-solid">Get started</button>
        </div>
      </header>

      <section className="sk-hero-band">
        <div className="sk-wrap sk-hero">
          <div className="sk-hero-copy">
            <span className="sk-eyebrow">
              Every quote has a sticker price. We find the invoice price.
            </span>
            <h1 className="sk-h1">
              Read the window sticker before you buy HR software.
            </h1>
            <p className="sk-lede">
              Car buyers know to distrust the number taped to the windshield. HRIS quotes
              work the same way &mdash; a list price built to be negotiated down. We show
              you the invoice price first.
            </p>

            <form className="sk-form" action="#">
              <input
                className="sk-input"
                type="email"
                placeholder="Work email"
                aria-label="Work email"
              />
              <button className="sk-btn sk-btn-solid sk-btn-lg" type="submit">
                Get my invoice price
              </button>
            </form>
            <p className="sk-fine">
              Free for buyers. Providers pay a commission or referral fee. Terms can
              vary by provider.
            </p>
          </div>

          {/* SIGNATURE: the window sticker / Monroney label */}
          <div className="sk-label">
            <div className="sk-label-head">MATCHMAKER HR &middot; VENDOR QUOTE LABEL</div>

            <div className="sk-items">
              {ITEMS.map((it) => (
                <div className="sk-item" key={it.name}>
                  <span className="sk-item-name">{it.name}</span>
                  <span className="sk-item-leader" aria-hidden="true" />
                  <span className="sk-item-price">{it.price}</span>
                </div>
              ))}
            </div>

            <div className="sk-rule-dbl" aria-hidden="true" />

            <div className="sk-item sk-sticker-row">
              <span className="sk-item-name">STICKER PRICE</span>
              <span className="sk-item-leader" aria-hidden="true" />
              <span className="sk-item-price">$161,400</span>
            </div>

            <div className="sk-item sk-mm-row">
              <span className="sk-item-name">MATCHMAKER PRICE</span>
              <span className="sk-item-leader" aria-hidden="true" />
              <span className="sk-item-price">$124,100</span>
            </div>

            <p className="sk-label-note">
              After removing 2 unused modules and capping the renewal escalator at CPI.
            </p>

            <div className="sk-barcode-wrap">
              <div className="sk-barcode" aria-hidden="true">
                {BARCODE.map((w, i) => (
                  <i key={i} style={{ flexGrow: w }} />
                ))}
              </div>
              <div className="sk-upc">04923188217</div>
            </div>
          </div>
        </div>
      </section>

      <div className="sk-wrap sk-wall">
        <span className="sk-eyebrow">Labeled</span>
        {VENDORS.slice(0, 12).map((v) => (
          <span className="sk-wall-v" key={v}>
            {v}
          </span>
        ))}
        <span className="sk-wall-v">+ 40 more</span>
      </div>

      <section className="sk-sec">
        <div className="sk-wrap">
          <div className="sk-sec-h">
            <span className="sk-eyebrow">What&rsquo;s on every label</span>
            <h2 className="sk-h2">Six tools, itemized before you sign anything.</h2>
          </div>
          <div className="sk-tools">
            {TOOLS.map((t, i) => (
              <article className="sk-tool" key={t.key}>
                <div className="sk-tool-n">SPEC {String(i + 1).padStart(2, "0")}</div>
                <h3>{t.name}</h3>
                <p>{t.blurb}</p>
                <small>{t.detail}</small>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="sk-sec sk-off">
        <div className="sk-wrap">
          <div className="sk-sec-h">
            <span className="sk-eyebrow">The broker advantage</span>
            <h2 className="sk-h2">We read the invoice price, not just the sticker.</h2>
          </div>

          {ADVANTAGES.map((a, i) => (
            <div className={`sk-adv${i % 2 === 1 ? " flip" : ""}`} key={a.title}>
              <div className="sk-adv-copy">
                <h3>{a.title}</h3>
                <p>
                  <b>{a.lead}</b> {a.body}
                </p>
              </div>

              <div className="sk-adv-panel">
                <div className="sk-adv-panel-h">Included</div>
                {a.points.map((p) => (
                  <div className="sk-adv-row" key={p}>
                    <span className="sk-adv-row-name">{p}</span>
                    <span className="sk-adv-row-leader" aria-hidden="true" />
                    <span className="sk-adv-row-tag">&#10003;</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="sk-sec">
        <div className="sk-wrap">
          <div className="sk-sec-h">
            <span className="sk-eyebrow">Method</span>
            <h2 className="sk-h2">The fine print, printed plainly.</h2>
          </div>
          <div className="sk-trust">
            {TRUST.map((t) => (
              <article className="sk-tc" key={t.title}>
                <h3>{t.title}</h3>
                <p>{t.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <div className="sk-wrap">
        <div className="sk-stats">
          {STATS.map((s) => (
            <div key={s.label}>
              <div className="sk-st-n">{s.n}</div>
              <div className="sk-st-l">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      <section className="sk-sec sk-off">
        <div className="sk-wrap">
          <div className="sk-sec-h">
            <span className="sk-eyebrow">Sold at invoice</span>
            <h2 className="sk-h2">What buyers paid once we found the real price.</h2>
          </div>
          <div className="sk-cases">
            {CASES.map((c) => (
              <article className="sk-case" key={c.title}>
                <div className="sk-case-n">{c.stat}</div>
                <div className="sk-case-nl">{c.statLabel}</div>
                <h3>{c.title}</h3>
                <p>{c.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <div className="sk-wrap sk-news">
        <div>
          <h2>The Monthly Sticker</h2>
          <p>One vendor&rsquo;s real price, decoded, in your inbox.</p>
        </div>
        <form className="sk-form sk-news-form" action="#">
          <input
            className="sk-input"
            type="email"
            placeholder="Work email"
            aria-label="Work email for newsletter"
          />
          <button className="sk-btn sk-btn-solid sk-btn-lg" type="submit">
            Subscribe
          </button>
        </form>
      </div>

      <footer className="sk-foot">
        <div className="sk-wrap">
          <div className="sk-fgrid">
            <div>
              <div className="sk-logo">MatchMaker HR</div>
              <p>
                Buyer-side HRIS brokerage. Free for buyers. Providers pay a
                commission or referral fee. Terms can vary by provider.
              </p>
            </div>
            <div className="sk-fc">
              <h4>For buyers</h4>
              <ul>
                <li>HRIS Marketplace</li>
                <li>Requirements Builder</li>
                <li>Advisory services</li>
                <li>Case studies</li>
              </ul>
            </div>
            <div className="sk-fc">
              <h4>Why us</h4>
              <ul>
                <li>Broker model</li>
                <li>How we make money</li>
                <li>Scoring methodology</li>
                <li>FAQ</li>
              </ul>
            </div>
            <div className="sk-fc">
              <h4>Resources</h4>
              <ul>
                <li>Blog</li>
                <li>HRIS Landscape Report</li>
                <li>Partner finder</li>
                <li>Contact</li>
              </ul>
            </div>
          </div>
          <div className="sk-fbot">
            <span>&copy; 2026 MatchMaker HR</span>
            <span>Privacy &middot; Terms &middot; Commission disclosure</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
