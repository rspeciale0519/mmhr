import { Inter, Special_Elite } from "next/font/google";

import { ADVANTAGES, CASES, NAV, STATS, TOOLS, TRUST, VENDORS } from "../_content";
import "./styles.css";

const display = Special_Elite({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-display",
});
const body = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
});

export default function Memo() {
  return (
    <div className={`me ${body.className} ${display.variable}`}>
      <header className="me-nav">
        <div className="me-wrap me-nav-in">
          <div className="me-logo">MatchMaker HR</div>
          <nav className="me-links">
            {NAV.map((n) => (
              <span key={n}>{n}</span>
            ))}
          </nav>
          <button className="me-btn me-line">Sign in</button>
          <button className="me-btn me-solid">Get started</button>
        </div>
      </header>

      <section className="me-wrap me-hero">
        <div className="me-hero-copy">
          <div className="me-memohead">
            <div className="me-memohead-row">
              <span className="me-memohead-label">TO:</span>
              <span className="me-memohead-value">
                Every HR leader about to sign a quote
              </span>
            </div>
            <div className="me-memohead-row">
              <span className="me-memohead-label">FROM:</span>
              <span className="me-memohead-value">MatchMaker HR</span>
            </div>
            <div className="me-memohead-row">
              <span className="me-memohead-label">RE:</span>
              <span className="me-memohead-value">
                What&rsquo;s actually in your vendor&rsquo;s pricing
              </span>
            </div>
          </div>

          <h1 className="me-h1">They redact the price. We un-redact it.</h1>
          <p className="me-lede">
            Every quote has line items vendors would rather you not add up.
            Send us the proposal and we black out nothing — you get the real
            number, the real markup, and the real leverage.
          </p>

          <form className="me-form" action="#">
            <input
              className="me-input"
              type="email"
              placeholder="Work email"
              aria-label="Work email"
            />
            <button className="me-btn me-solid me-lg" type="submit">
              Declassify my quote
            </button>
          </form>
          <p className="me-fine">
            Free. The vendor pays our commission — the same rate whichever
            one you choose.
          </p>
        </div>

        {/* SIGNATURE: the redacted memo, one bar peeled back */}
        <div className="me-doc-wrap">
          <div className="me-rubber-stamp" aria-hidden="true">
            Declassified
            <br />
            for buyers
          </div>

          <div className="me-doc">
            <div className="me-doc-head">
              <span className="me-doc-tag">Memorandum</span>
              <span className="me-doc-num">File No. 0412-HR</span>
            </div>
            <p className="me-doc-body">
              Your quoted rate of{" "}
              <span className="me-bar me-bar--peel">$161,400</span>
              <span className="me-reveal" aria-hidden="true">
                $161,400
              </span>{" "}
              is <span className="me-bar">30% above</span> what comparable
              companies paid last quarter. Two line items marked{" "}
              <span className="me-bar">modules you&rsquo;ll never open</span>{" "}
              account for roughly $18,400 of that total.
            </p>
          </div>

          <div className="me-stats-row">
            {STATS.slice(0, 3).map((s) => (
              <div className="me-stat-card" key={s.label}>
                <span className="me-stat-bar" aria-hidden="true" />
                <div className="me-stat-figure">{s.n}</div>
                <div className="me-stat-label">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="me-wall">
        <div className="me-wrap me-wall-in">
          <span className="me-eyebrow">On file</span>
          {VENDORS.slice(0, 12).map((v) => (
            <span className="me-wall-v" key={v}>
              {v}
            </span>
          ))}
          <span className="me-wall-v">+ 40 more</span>
        </div>
      </div>

      <section className="me-sec">
        <div className="me-wrap">
          <div className="me-sec-h">
            <span className="me-eyebrow">What gets declassified</span>
            <h2 className="me-h2">Six tools built to expose the fine print</h2>
            <p className="me-sub">
              Everything a vendor hopes you never dig into, surfaced before
              you sign.
            </p>
          </div>
          <div className="me-tools">
            {TOOLS.map((t, i) => (
              <article className="me-tool" key={t.key}>
                <div className="me-tool-head">
                  <span className="me-eyebrow">
                    Exhibit {String(i + 1).padStart(2, "0")}
                  </span>
                </div>
                <h3>{t.name}</h3>
                <p>{t.blurb}</p>
                <small>{t.detail}</small>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="me-sec me-sec-alt">
        <div className="me-wrap">
          <div className="me-sec-h">
            <span className="me-eyebrow">The broker advantage</span>
            <h2 className="me-h2">We read the quote the way the vendor does</h2>
            <p className="me-sub">
              They wrote the pricing. We know which parts of it are padding.
            </p>
          </div>
          <div className="me-adv">
            {ADVANTAGES.map((a, i) => (
              <article className="me-adv-card" key={a.title}>
                <span className="me-eyebrow">
                  Exhibit {String.fromCharCode(65 + i)}
                </span>
                <h3>{a.title}</h3>
                <p>
                  <b>{a.lead}</b> {a.body}
                </p>
                <ul className="me-pts">
                  {a.points.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="me-sec">
        <div className="me-wrap">
          <div className="me-sec-h">
            <span className="me-eyebrow">Method</span>
            <h2 className="me-h2">How we&rsquo;re paid, on the record</h2>
          </div>
          <div className="me-trust">
            {TRUST.map((t, i) => (
              <article className="me-tc" key={t.title}>
                <span className="me-eyebrow">§ {String(i + 1).padStart(2, "0")}</span>
                <h3>{t.title}</h3>
                <p>{t.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="me-sec me-sec-alt">
        <div className="me-wrap">
          <div className="me-sec-h">
            <span className="me-eyebrow">Case files</span>
            <h2 className="me-h2">Memos we&rsquo;ve already closed</h2>
          </div>
          <div className="me-cases">
            {CASES.map((c) => (
              <article className="me-case" key={c.title}>
                <div className="me-case-n">{c.stat}</div>
                <div className="me-case-nl">{c.statLabel}</div>
                <h3>{c.title}</h3>
                <p>{c.body}</p>
                <span className="me-more">Read the memo</span>
              </article>
            ))}
          </div>
        </div>
      </section>

      <div className="me-wrap me-news-wrap">
        <div className="me-news">
          <div>
            <h2>The Next Memo</h2>
            <p>One declassified pricing fact a month, straight to your inbox.</p>
          </div>
          <form className="me-form me-news-form" action="#">
            <input
              className="me-input"
              type="email"
              placeholder="Work email"
              aria-label="Work email for newsletter"
            />
            <button className="me-btn me-solid me-lg" type="submit">
              Subscribe
            </button>
          </form>
        </div>
      </div>

      <footer className="me-foot">
        <div className="me-wrap">
          <div className="me-fgrid">
            <div>
              <div className="me-logo">MatchMaker HR</div>
              <p>
                Buyer-side HRIS brokerage. Free to buyers, paid the same rate
                by every vendor — and we say so when we&rsquo;re one of them.
              </p>
            </div>
            <div className="me-fc">
              <h4>For buyers</h4>
              <ul>
                <li>HRIS Marketplace</li>
                <li>Requirements Builder</li>
                <li>Advisory services</li>
                <li>Case studies</li>
              </ul>
            </div>
            <div className="me-fc">
              <h4>Why us</h4>
              <ul>
                <li>Broker model</li>
                <li>How we make money</li>
                <li>Scoring methodology</li>
                <li>FAQ</li>
              </ul>
            </div>
            <div className="me-fc">
              <h4>Resources</h4>
              <ul>
                <li>Blog</li>
                <li>HRIS Landscape Report</li>
                <li>Partner finder</li>
                <li>Contact</li>
              </ul>
            </div>
          </div>
          <div className="me-fbot">
            <span>© 2026 MatchMaker HR</span>
            <span>Privacy · Terms · Commission disclosure</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
