import Link from "next/link";

import { CobaltGlow } from "../Glow";
import { MatchDemo } from "./MatchDemo";
import { RuleIcon } from "./RuleIcons";
import { rankingRules, sixSteps } from "./sample-ranking";

/**
 * Cobalt homepage body. Nav and footer live in the shared site chrome.
 */
export function CobaltBody() {
  return (
    <>
      <section className="co-hero">
        <div className="co-hero-meta">
          <span>MatchMaker HR</span>
          <span>Free HRIS software brokerage</span>
          <span>Buyers never pay</span>
          <span>Rankings ignore fees</span>
        </div>
        <h1 className="co-h1">
          Every HRIS, ranked on fit. <em>Free to you.</em>
        </h1>
        <div className="co-board-wrap">
          <div>
            <p className="co-lede">
              Answer one needs list. See every match scored against it, with vendor
              names masked until you review your requirements with an advisor. Pick
              up to five contenders and we send one approved RFP.
            </p>
            <div className="co-ctas">
              <Link className="co-btn co-btn-p" href="/sign-up">Start your needs list</Link>
              <Link className="co-btn co-btn-g" href="/how-it-works">How ranking works</Link>
            </div>
            <div className="co-gl co-fee-note">
              <span className="co-chip co-chip-m">Fees excluded</span>
              <span style={{ fontSize: 14, color: "var(--co-ink2)" }}>
                Providers pay MMHR a referral fee. It is never an input to rank.
              </span>
            </div>
          </div>
          <MatchDemo />
        </div>
      </section>

      <section className="co-sec" id="how-it-works">
        <div className="co-sech">
          <h2>Six steps. One RFP. A contract you sign yourself.</h2>
          <p>You stay in charge from the first question to the signature. MMHR handles the legwork in between.</p>
        </div>
        <div className="co-six">
          {sixSteps.map((step, index) => (
            // --i tells the CSS which step this is, so the steps can
            // light up one after another as the section scrolls into view.
            <div key={step.n} style={{ ["--i" as string]: index }}>
              <span className="co-num">{step.n}</span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="co-blue" id="ranking-policy">
        <CobaltGlow tone="mint" placement="hero" />
        <h2>The rules that keep the ranking honest.</h2>
        <div className="co-rules3">
          {rankingRules.map((rule) => (
            <div className="co-rule" key={rule.title}>
              <span className="co-ic"><RuleIcon name={rule.icon} /></span>
              <h3>{rule.title}</h3>
              <p>{rule.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="co-final">
        <h2>Start with your needs list.</h2>
        <div>
          <p>Free for buyers. You sign directly with the provider you choose. Customers never pay MMHR.</p>
          <Link className="co-btn co-btn-p" href="/sign-up">Start your needs list</Link>
        </div>
      </section>
    </>
  );
}
