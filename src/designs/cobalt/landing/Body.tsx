import Link from "next/link";

import { brand } from "@/lib/brand";
import { getSiteMetadataBase } from "@/lib/site-metadata";

import { CobaltGlow } from "../Glow";
import { Magnetic, Parallax, Reveal, RevealGroup, SplitText, Spotlight, Tilt } from "../motion";
import { JsonLd } from "../pages/JsonLd";
import { PageSection } from "../pages/PageSection";
import { QuestionsAndAnswers } from "../pages/QuestionsAndAnswers";
import { FeeDemo } from "./FeeDemo";
import { HomeFacts } from "./HomeFacts";
import { MatchDemo } from "./MatchDemo";
import { ArrowIcon, RuleIcon, WhoIcon } from "./RuleIcons";
import { SixSteps } from "./SixSteps";
import { buyerSituations, homeQuestions } from "./home-content";
import { homeStructuredData } from "./home-structured-data";
import { rankingRules, sixSteps } from "./sample-ranking";
import "./home.css";

/**
 * The hero headline, split into words that rise one after another as soon
 * as the page paints (the motion toolkit's SplitText "load" styles in
 * motion-kit.css, pure CSS). Written by hand instead of with <SplitText>
 * because the second line is an <em> with its own weight and color.
 * The words stay plain text with real spaces, so the heading reads
 * normally for screen readers, search and find-in-page.
 */
function HeroTitle() {
  const lines = [["Every", "HRIS,", "ranked", "on", "fit."], ["Free", "to", "you."]];
  let position = 0;
  const words = (line: string[]) =>
    line.map((word, index) => (
      <span key={word}>
        {index > 0 ? " " : null}
        <span className="co-split-w" style={{ ["--w" as string]: position++ }}>
          <span className="co-split-i">{word}</span>
        </span>
      </span>
    ));
  return (
    <h1 className="co-h1 co-split" data-co-split="load" style={{ ["--co-stagger" as string]: "75ms", ["--co-delay" as string]: "60ms" }}>
      {words(lines[0])} <em>{words(lines[1])}</em>
    </h1>
  );
}

/**
 * A decorative set of thin orbit rings (no meaning, hidden from screen
 * readers). Used behind the hero, in "Who it's for" and on the blue band,
 * inside <Parallax> so it drifts at its own depth while the page scrolls.
 */
function Orbits({ className }: { className: string }) {
  return (
    <Parallax aria-hidden="true" className={`co-home-orbits ${className}`} max={90} speed={0.18}>
      <svg fill="none" viewBox="0 0 600 600">
        <circle cx="300" cy="300" r="290" />
        <circle cx="300" cy="300" r="220" strokeDasharray="2 10" />
        <circle cx="300" cy="300" r="150" />
        <circle cx="300" cy="300" r="80" strokeDasharray="1 8" />
        <circle className="co-home-orbit-dot" cx="300" cy="10" r="6" />
        <circle className="co-home-orbit-dot co-home-orbit-dot-2" cx="300" cy="450" r="4" />
      </svg>
    </Parallax>
  );
}

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
 * Motion (toolkit in ../motion; every effect has a still version for
 * reduced motion and works in every browser):
 * - Hero: headline words rise on paint, then the meta row, lede, buttons
 *   and fee note; the main button leans toward the mouse (Magnetic); the
 *   demo card has a cursor light and its 3D field leans toward the pointer.
 * - Section headings rise word by word as they scroll in (SplitText).
 * - Cards enter in a stagger (Reveal / RevealGroup, varied variants) and
 *   tilt toward the mouse with a light under the cursor (Tilt / Spotlight);
 *   their icons and arrows move on hover (home.css).
 * - The six steps are a stepper that plays by itself (SixSteps.tsx).
 * - The blue band has a fee slider that proves fees never move the ranking
 *   (FeeDemo.tsx).
 * - Thin orbit rings drift at their own depth behind three sections (Parallax).
 */
export function CobaltBody() {
  return (
    <>
      <JsonLd data={homeStructuredData(brand.name, getSiteMetadataBase()?.origin)} />

      <section className="co-hero">
        {/* Full-bleed clip box: the rings may reach the screen edge but never
            widen the page (phones would otherwise zoom out). */}
        <div aria-hidden="true" className="co-home-bleed">
          <Orbits className="co-home-orbits-hero" />
        </div>
        <div className="co-hero-meta">
          {["MatchMaker HR", "Free HRIS software brokerage", "Buyers never pay", "Rankings ignore fees"].map((text, index) => (
            <span className="co-enter" key={text} style={{ ["--co-delay" as string]: `${index * 70}ms` }}>
              {text}
            </span>
          ))}
        </div>
        <HeroTitle />
        <div className="co-board-wrap">
          <div>
            <p className="co-lede co-enter" style={{ ["--co-delay" as string]: "420ms" }}>
              Answer one needs list. See every match scored against it, with vendor
              names masked until you review your requirements with an advisor. Pick
              up to five contenders and we send one approved RFP.
            </p>
            <div className="co-ctas co-enter" style={{ ["--co-delay" as string]: "520ms" }}>
              <Magnetic>
                <Link className="co-btn co-btn-p" href="/sign-up">Start your needs list</Link>
              </Magnetic>
              <Magnetic strength={0.2}>
                <Link className="co-btn co-btn-g" href="/how-it-works">How ranking works</Link>
              </Magnetic>
            </div>
            <div className="co-enter" style={{ ["--co-delay" as string]: "620ms" }}>
              <Spotlight className="co-gl co-fee-note">
                <span className="co-chip co-chip-m">Fees excluded</span>
                <span style={{ fontSize: 14, color: "var(--co-ink2)" }}>
                  Providers pay MMHR a referral fee. It is never an input to rank.
                </span>
              </Spotlight>
            </div>
          </div>
          <MatchDemo />
        </div>
      </section>

      <HomeFacts />

      {/* Who it's for: heading on the left, the four buyer situations on the right. */}
      <section className="co-sec co-home-who" id="who-its-for" aria-labelledby="who-its-for-title">
        <Orbits className="co-home-orbits-who" />
        <div className="co-home-who-head">
          <SplitText as="h2" id="who-its-for-title" text="Built for the moment you choose an HRIS." />
          <Reveal as="p" delay={200} variant="fade">
            MatchMaker HR is for companies choosing HR software, whatever started the search.
          </Reveal>
        </div>
        <RevealGroup as="ul" className="co-home-who-list" stagger={110}>
          {buyerSituations.map((situation, index) => (
            <Tilt as="li" innerClassName="co-gl co-home-who-card" key={situation.title} max={6} spotlight>
              <span className="co-home-who-ic">
                <WhoIcon index={index} />
              </span>
              <h3>{situation.title}</h3>
              <p>{situation.body}</p>
            </Tilt>
          ))}
        </RevealGroup>
      </section>

      <section className="co-sec" id="how-it-works" aria-labelledby="how-it-works-title">
        <div className="co-sech">
          <SplitText as="h2" id="how-it-works-title" text="Six steps. One RFP. A contract you sign yourself." />
          <Reveal as="p" delay={200} variant="rise">
            You stay in charge from the first question to the signature. MMHR handles the legwork in between.
          </Reveal>
        </div>
        <SixSteps steps={sixSteps} />
        <div className="co-home-more">
          <Magnetic strength={0.2}>
            <Link className="co-btn co-btn-g" href="/how-it-works">
              How it works, step by step
              <ArrowIcon />
            </Link>
          </Magnetic>
        </div>
      </section>

      <section className="co-blue co-home-free" id="why-its-free" aria-labelledby="why-its-free-title">
        <CobaltGlow tone="mint" placement="hero" />
        <Orbits className="co-home-orbits-free" />
        <SplitText as="h2" id="why-its-free-title" stagger={55} text="Free for you. Never ranked by who pays." />
        <Reveal as="p" className="co-home-free-lede" delay={220} variant="fade">
          MMHR is free for buyers because providers pay MMHR a referral fee. Every matching
          option is scored against your needs list, and the fee is never an input to that score.
        </Reveal>
        <div className="co-rules3">
          {rankingRules.map((rule, index) => (
            <Reveal key={rule.title} index={index} variant="scale">
              <Tilt innerClassName="co-rule" max={7} spotlight>
                <span className="co-ic"><RuleIcon name={rule.icon} /></span>
                <h3>{rule.title}</h3>
                <p>{rule.body}</p>
              </Tilt>
            </Reveal>
          ))}
        </div>
        <Reveal className="co-home-fee" delay={120} variant="right">
          <FeeDemo />
        </Reveal>
        <div className="co-home-more">
          <Magnetic strength={0.2}>
            <Link className="co-btn co-btn-g" href="/why-its-free">
              Why it&apos;s free, in full
              <ArrowIcon />
            </Link>
          </Magnetic>
        </div>
      </section>

      {/* For providers: one short band. Most providers never join the app. */}
      <Reveal className="co-home-prov-wrap" variant="clip">
        <Spotlight as="section" className="co-gl co-home-prov" id="for-providers" aria-labelledby="for-providers-title">
          <SplitText as="h2" id="for-providers-title" text="HRIS provider? You do not need an account." />
          <div>
            <p>
              MMHR staff list providers and email each approved RFP to the provider&apos;s contact.
              Reply through a private web form link or by email. Who pays, and how much, never
              changes the ranking.
            </p>
            <Magnetic strength={0.2}>
              <Link className="co-btn co-btn-g" href="/for-providers">
                Information for providers
                <ArrowIcon />
              </Link>
            </Magnetic>
          </div>
        </Spotlight>
      </Reveal>

      <PageSection
        id="questions"
        title="Common questions"
        intro="Straight answers to what buyers ask before they start."
      >
        <QuestionsAndAnswers items={homeQuestions} />
      </PageSection>

      <section className="co-final" aria-labelledby="start-title">
        <SplitText as="h2" id="start-title" stagger={70} text="Start with your needs list." />
        <Reveal delay={260} variant="rise">
          <p>Free for buyers. You sign directly with the provider you choose. Customers never pay MMHR.</p>
          <Magnetic>
            <Link className="co-btn co-btn-p" href="/sign-up">
              Start your needs list
              <ArrowIcon />
            </Link>
          </Magnetic>
        </Reveal>
      </section>
    </>
  );
}
