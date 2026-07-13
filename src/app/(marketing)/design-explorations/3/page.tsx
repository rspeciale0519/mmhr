import { IBM_Plex_Mono, IBM_Plex_Sans, Saira_Semi_Condensed } from "next/font/google";

import "./direction.css";

const display = Saira_Semi_Condensed({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
});
const body = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "600"] });
const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
});

const PHASES = [
  {
    n: "01",
    title: "Requirements",
    body: "Tag ~200 features must / nice / no. Everything downstream is scored against this.",
    dim: "2 WKS",
  },
  {
    n: "02",
    title: "Shortlist",
    body: "Match scores across 52 systems. Cut to the three worth your team's time.",
    dim: "1 WK",
  },
  {
    n: "03",
    title: "Demos & scoring",
    body: "Weighted scorecards filled in live, by everyone in the room.",
    dim: "3 WKS",
  },
  {
    n: "04",
    title: "Proposal review",
    body: "We benchmark the quote and write your negotiation position.",
    dim: "1 WK",
  },
  {
    n: "05",
    title: "Implementation",
    body: "Milestones, owners, and the questions to ask before go-live.",
    dim: "10–16 WKS",
  },
];

export default function Direction3() {
  return (
    <div className={`d3 ${body.className} ${display.variable} ${mono.variable}`}>
      <div className="d3-wrap">
        <nav className="d3-nav">
          <div className="d3-logo">MatchMaker HR</div>
          <div className="d3-nav-links">
            <span>Platform</span>
            <span>Broker model</span>
            <span>Case studies</span>
            <span>Sign in</span>
          </div>
        </nav>

        <div className="d3-titleblock">
          <div>
            PROJECT
            <b>HRIS SELECTION</b>
          </div>
          <div>
            SCOPE
            <b>50–5,000 EMPLOYEES</b>
          </div>
          <div>
            COST TO BUYER
            <b>$0.00</b>
          </div>
          <div>
            REV
            <b>2026.07</b>
          </div>
        </div>

        <section className="d3-hero">
          <div>
            <h1 className="d3-h1">
              Run the HRIS purchase like the <u>engineering project</u> it
              actually is.
            </h1>
            <p className="d3-sub">
              Requirements, weighted scoring, priced options, a dated
              implementation plan. The same rigour you&rsquo;d apply to any
              other seven-figure decision &mdash; except we do the work, and the
              vendor pays the bill.
            </p>

            <form className="d3-form" action="#">
              <input
                className="d3-input"
                type="email"
                placeholder="Work email"
                aria-label="Work email"
              />
              <button className="d3-btn" type="submit">
                Start the project
              </button>
            </form>
            <p className="d3-fine">
              NO FEE · NO COMMITMENT · SAME COMMISSION FROM EVERY VENDOR
            </p>
          </div>

          {/* Signature: the plan, drawn as a dimensioned schedule. */}
          <div className="d3-plan">
            <div className="d3-plan-head">
              <span>SELECTION SCHEDULE</span>
              <span>TYP. 17–23 WKS</span>
            </div>
            {PHASES.map((p) => (
              <div className="d3-phase" key={p.n}>
                <div className="d3-phase-n">{p.n}</div>
                <div>
                  <h3>{p.title}</h3>
                  <p>{p.body}</p>
                  <div className="d3-dim">
                    <span />
                    {p.dim}
                    <span />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="d3-wrap">
        <section className="d3-band">
          <h2 className="d3-h2">Specification</h2>
          <p>
            We are paid a commission by the vendor you choose &mdash; the same
            rate from every vendor on the list, published on our pricing page.
          </p>
          <div className="d3-specs">
            <div className="d3-spec">
              <div className="d3-spec-k">DATA</div>
              <h3>52 systems, verified monthly</h3>
              <p>
                Pricing, modules, and capability scores re-crawled on a schedule.
                Every profile carries the date it was last verified.
              </p>
            </div>
            <div className="d3-spec">
              <div className="d3-spec-k">METHOD</div>
              <h3>Scoring you can audit</h3>
              <p>
                The weighting is published. Your requirements drive it. No vendor
                can pay to move up the organic list.
              </p>
            </div>
            <div className="d3-spec">
              <div className="d3-spec-k">DISCLOSURE</div>
              <h3>We resell one system</h3>
              <p>
                CBIZ Centrally HR is ours, and it is labelled every time it
                appears. It ranks on the same data as everything else.
              </p>
            </div>
          </div>
        </section>

        <section className="d3-stats">
          <div className="d3-stat">
            <div className="d3-stat-n">52</div>
            <div className="d3-stat-l">Systems profiled</div>
          </div>
          <div className="d3-stat">
            <div className="d3-stat-n">310</div>
            <div className="d3-stat-l">Selections guided</div>
          </div>
          <div className="d3-stat">
            <div className="d3-stat-n">74</div>
            <div className="d3-stat-l">NPS</div>
          </div>
          <div className="d3-stat">
            <div className="d3-stat-n">$0</div>
            <div className="d3-stat-l">Buyer cost</div>
          </div>
        </section>
      </div>
    </div>
  );
}
