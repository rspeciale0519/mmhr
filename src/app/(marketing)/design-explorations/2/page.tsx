import { Karla, Newsreader } from "next/font/google";

import "./direction.css";

const display = Newsreader({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-display",
});
const body = Karla({ subsets: ["latin"] });

export default function Direction2() {
  return (
    <div className={`d2 ${body.className} ${display.variable}`}>
      <div className="d2-wrap">
        <nav className="d2-nav">
          <div className="d2-logo">MatchMaker HR</div>
          <div className="d2-nav-links">
            <span>Platform</span>
            <span>How we&rsquo;re free</span>
            <span>Case studies</span>
            <span>Sign in</span>
          </div>
        </nav>

        <section className="d2-hero">
          <div className="d2-kicker">Buyer-side HRIS advisors</div>
          <h1 className="d2-h1">
            Someone who is <em>only</em> on your side of the table.
          </h1>
          <p className="d2-lede">
            You&rsquo;ll buy an HRIS maybe twice in your career. The people
            selling to you do it every day. We even that up &mdash; and it costs
            you nothing.
          </p>

          <form className="d2-form" action="#">
            <input
              className="d2-input"
              type="email"
              placeholder="Work email"
              aria-label="Work email"
            />
            <button className="d2-btn" type="submit">
              Talk to an advisor
            </button>
          </form>
          <p className="d2-note">
            No fee, no upsell, no commitment. Vendors pay us the same rate
            whichever one you pick.
          </p>
        </section>
      </div>

      <div className="d2-wrap">
        {/* Signature: the promise, signed by a person. */}
        <section className="d2-advisor">
          <div className="d2-portrait">DK</div>
          <div className="d2-advisor-body">
            <p>
              &ldquo;My job is to make sure you don&rsquo;t overpay and
              don&rsquo;t end up on a system you&rsquo;ll be stuck with for a
              decade. I&rsquo;ll read your proposals, tell you what the price
              should be, and say so plainly when a vendor is wrong for you
              &mdash; including ours.&rdquo;
            </p>
            <div className="d2-sig">
              <strong>Dana Keller</strong>
              Your advisor · 11 years in HRIS implementation · Replies same day
            </div>
          </div>
        </section>

        <section className="d2-promises">
          <h2 className="d2-h2">What that actually means</h2>

          <div className="d2-promise">
            <h3>We&rsquo;re paid the same either way</h3>
            <p>
              Every vendor on our list pays the identical commission when you
              buy. <strong>There is no version of this where steering you pays
              us more.</strong> The rate is on our pricing page.
            </p>
          </div>

          <div className="d2-promise">
            <h3>We tell you when we&rsquo;re the vendor</h3>
            <p>
              We resell one system, CBIZ Centrally HR.{" "}
              <strong>It&rsquo;s labelled every single time it appears</strong>{" "}
              &mdash; and it earns its ranking on the same data as everyone else.
            </p>
          </div>

          <div className="d2-promise">
            <h3>You keep the work</h3>
            <p>
              Requirements, scorecards, the project plan &mdash; it&rsquo;s all
              yours to export.{" "}
              <strong>Walk away whenever you want and take it with you.</strong>
            </p>
          </div>
        </section>

        <section className="d2-stats">
          <div>
            <div className="d2-stat-n">74</div>
            <div className="d2-stat-l">Net promoter score</div>
          </div>
          <div>
            <div className="d2-stat-n">310</div>
            <div className="d2-stat-l">Companies guided through a selection</div>
          </div>
          <div>
            <div className="d2-stat-n">52</div>
            <div className="d2-stat-l">HRIS profiled and kept current</div>
          </div>
        </section>
      </div>
    </div>
  );
}
