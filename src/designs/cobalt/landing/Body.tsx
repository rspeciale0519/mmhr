import Link from "next/link";

import { brand } from "@/lib/brand";
import { getSiteMetadataBase } from "@/lib/site-metadata";

import { CobaltGlow } from "../Glow";
import { JsonLd } from "../pages/JsonLd";
import { PageSection } from "../pages/PageSection";
import { QuestionsAndAnswers } from "../pages/QuestionsAndAnswers";
import { HomeFacts } from "./HomeFacts";
import { MatchDemo } from "./MatchDemo";
import { RuleIcon } from "./RuleIcons";
import { ScrollReveal } from "./ScrollReveal";
import { buyerSituations, homeQuestions } from "./home-content";
import { homeStructuredData } from "./home-structured-data";
import { rankingRules, sixSteps } from "./sample-ranking";
import "./home.css";

/**
 * Cobalt home page body (route `/`). Nav and footer live in the shared site
 * chrome; the route file only sets metadata and renders this.
 *
 * The home page introduces each topic briefly and links to the menu page
 * that covers it in depth:
 *   hero with the live matching demo -> four-number strip -> who it's for ->
 *   how it works (/how-it-works) -> why it's free (/why-its-free) ->
 *   for providers (/for-providers) -> common questions -> closing call to action.
 *
 * Motion: blocks marked `data-co-reveal=""` settle into place as they scroll
 * into view (ScrollReveal + home.css); the six steps light up in order
 * (motion.css). Everything has a still version for reduced motion.
 */
export function CobaltBody() {
  return (
    <>
      <JsonLd data={homeStructuredData(brand.name, getSiteMetadataBase()?.origin)} />
      <ScrollReveal />

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

      <HomeFacts />

      {/* Who it's for: heading on the left, the four buyer situations on the right. */}
      <section className="co-sec co-home-who" id="who-its-for" aria-labelledby="who-its-for-title">
        <div className="co-home-who-head">
          <h2 id="who-its-for-title">Built for the moment you choose an HRIS.</h2>
          <p>MatchMaker HR is for companies choosing HR software, whatever started the search.</p>
        </div>
        <ul className="co-home-who-list">
          {buyerSituations.map((situation, index) => (
            <li key={situation.title} data-co-reveal="" style={{ ["--i" as string]: index }}>
              <h3>{situation.title}</h3>
              <p>{situation.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="co-sec" id="how-it-works" aria-labelledby="how-it-works-title">
        <div className="co-sech">
          <h2 id="how-it-works-title">Six steps. One RFP. A contract you sign yourself.</h2>
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
        <div className="co-home-more">
          <Link className="co-btn co-btn-g" href="/how-it-works">How it works, step by step</Link>
        </div>
      </section>

      <section className="co-blue co-home-free" id="why-its-free" aria-labelledby="why-its-free-title">
        <CobaltGlow tone="mint" placement="hero" />
        <h2 id="why-its-free-title">Free for you. Never ranked by who pays.</h2>
        <p className="co-home-free-lede">
          MMHR is free for buyers because providers pay MMHR a referral fee. Every matching
          option is scored against your needs list, and the fee is never an input to that score.
        </p>
        <div className="co-rules3">
          {rankingRules.map((rule, index) => (
            <div className="co-rule" key={rule.title} data-co-reveal="" style={{ ["--i" as string]: index }}>
              <span className="co-ic"><RuleIcon name={rule.icon} /></span>
              <h3>{rule.title}</h3>
              <p>{rule.body}</p>
            </div>
          ))}
        </div>
        <div className="co-home-more">
          <Link className="co-btn co-btn-g" href="/why-its-free">Why it&apos;s free, in full</Link>
        </div>
      </section>

      {/* For providers: one short band. Most providers never join the app. */}
      <section className="co-gl co-home-prov" id="for-providers" aria-labelledby="for-providers-title" data-co-reveal="">
        <h2 id="for-providers-title">HRIS provider? You do not need an account.</h2>
        <div>
          <p>
            MMHR staff list providers and email each approved RFP to the provider&apos;s contact.
            Reply through a private web form link or by email. Who pays, and how much, never
            changes the ranking.
          </p>
          <Link className="co-btn co-btn-g" href="/for-providers">Information for providers</Link>
        </div>
      </section>

      <PageSection
        id="questions"
        title="Common questions"
        intro="Straight answers to what buyers ask before they start."
      >
        <div data-co-reveal="">
          <QuestionsAndAnswers items={homeQuestions} />
        </div>
      </PageSection>

      <section className="co-final" aria-labelledby="start-title">
        <h2 id="start-title">Start with your needs list.</h2>
        <div>
          <p>Free for buyers. You sign directly with the provider you choose. Customers never pay MMHR.</p>
          <Link className="co-btn co-btn-p" href="/sign-up">Start your needs list</Link>
        </div>
      </section>
    </>
  );
}
