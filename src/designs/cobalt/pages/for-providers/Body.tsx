import Link from "next/link";
import type { CSSProperties } from "react";

import { Magnetic, Tilt } from "../../motion/pointer";
import { Reveal, type RevealVariant } from "../../motion/Reveal";
import { Parallax } from "../../motion/scroll";
import { CtaBand } from "../CtaBand";
import { PageHero } from "../PageHero";
import { PageSection } from "../PageSection";
import { QuestionsAndAnswers } from "../QuestionsAndAnswers";
import { RuleIcon } from "./icons";
import { PathTrack } from "./PathTrack";
import { ReplyPaths } from "./ReplyPaths";
import { RfpFlow } from "./RfpFlow";
import "./for-providers.css";

/**
 * Body of /for-providers, for HR software providers (vendors). The route file
 * (src/app/(marketing)/(site)/for-providers/page.tsx) only sets the metadata
 * and renders this, so all page content lives here.
 *
 * Every claim here follows how the launch path really works
 * (docs/LAUNCH.md steps 6 and 7, docs/vendor-entry.md): providers do not
 * join or sign in, MMHR staff list them and email each shortlisted provider
 * one RFP, and the provider answers on a private web form link or by email.
 * Never add fee amounts, percentages, or ranges: see
 * src/app/(marketing)/_site/public-commission-claims.test.ts.
 *
 * Styles: ./for-providers.css. Shared blocks: src/designs/cobalt/pages/.
 *
 * Motion (toolkit: src/designs/cobalt/motion/): every card and list row
 * enters as it scrolls into view, with a different entrance per section;
 * cards tilt toward the mouse with a light under the cursor; the path's
 * lines draw in as the page scrolls (PathTrack); soft glows behind two
 * sections drift at their own rate (Parallax); the main buttons lean toward
 * the mouse (Magnetic). The interactive parts are RfpFlow (stepper, pause,
 * replay) and ReplyPaths (web form or email).
 */

/** The path from listing to signed contract, as six short steps. */
const pathSteps = [
  {
    title: "MMHR lists your product",
    body: "MMHR staff add providers and record product facts from official sources. You do not fill in a profile or sign in.",
  },
  {
    title: "A buyer answers one needs list",
    body: "Every matching option is scored against that list. Your name stays masked while the buyer compares.",
  },
  {
    title: "The buyer shortlists up to five",
    body: "The buyer picks up to five contenders while names are masked, then reviews requirements with an MMHR advisor and sees the names of its picks. A pick the buyer already knows and does not want can be swapped for another match.",
  },
  {
    title: "MMHR emails you one RFP",
    body: "Once the buyer approves the RFP, your RFP contact gets one structured RFP with the buyer's requirements, a private link, and a due date.",
  },
  {
    title: "You answer",
    body: "Answer on the private web form, or reply by email. MMHR staff track each reply.",
  },
  {
    title: "The buyer signs with you",
    body: "The contract is between the buyer and you. A referral fee to MMHR applies only when a buyer signs.",
  },
] as const;

/** Why rank cannot be bought: three short rules. */
const rankRules = [
  {
    icon: "fit",
    title: "Scored on the buyer's needs",
    body: "Each option gets a fit score against the needs list this buyer submitted. A closer fit ranks higher.",
  },
  {
    icon: "fee",
    title: "Fees are not an input",
    body: "The referral fee is never an input to rank. Who pays MMHR, and how much, never changes results.",
  },
  {
    icon: "mask",
    title: "Masked until review",
    body: "Buyers compare fit and pick with provider names masked. Only their picks are named, when they review requirements with an MMHR advisor.",
  },
] as const satisfies readonly { icon: "fit" | "fee" | "mask"; title: string; body: string }[];

/** What answering the RFP involves for the provider. */
const answeringFacts = [
  "The email comes from MatchMaker HR, your contact for the RFP.",
  "The private link opens an overview of the buyer and the questions for the topics this buyer needs. No account or password is needed.",
  "Answers save automatically as you go, and you can upload the documents the buyer asks for.",
  "Submitting locks the form. The link stops taking changes after the due date.",
  "Prefer email? Reply to MMHR by email instead, and staff record your reply.",
] as const;

/** Entrances for the six path steps and the three rules, in turn. */
const stepVariants: readonly RevealVariant[] = ["rise", "scale", "rise", "scale", "rise", "scale"];
// No "right" entrance: while it waits off to the right, it would widen a
// phone's page for a moment.
const ruleVariants: readonly RevealVariant[] = ["left", "rise", "scale"];

const questions = [
  {
    question: "Do we need to join MatchMaker HR or create an account?",
    answer: "No. MMHR staff list providers, and you receive RFPs by email. You answer through a private web form link or by email, without signing in.",
  },
  {
    question: "How does our product get listed?",
    answer: "MMHR staff list providers and record product facts from official sources. To ask about your listing, contact the MMHR team.",
  },
  {
    question: "What is in the RFP we receive?",
    answer: "One structured RFP for one buyer: an overview of the buyer's company, the questions for the topics that buyer needs, any documents requested, and a due date.",
  },
  {
    question: "Can paying MMHR improve our rank?",
    answer: "No. Rank comes from fit to each buyer's needs. The referral fee is never an input to rank, and who pays MMHR never changes results.",
  },
  {
    question: "When does a referral fee apply?",
    answer: "Only when a buyer signs a contract with you. Buyers never pay MMHR. To discuss terms, contact the MMHR team.",
  },
  {
    question: "When do buyers see our name?",
    answer: "After they review their requirements with an MMHR advisor. Until then, buyers compare options with provider names masked.",
  },
  {
    question: "Can we reply by email instead of the web form?",
    answer: "Yes. Reply to MMHR by email and staff record your reply. The web form keeps your answers in one place and saves them as you go.",
  },
] as const;

export function ForProvidersBody() {
  return (
    <>
      <PageHero
        title="For HRIS providers"
        lede="You do not need to join MatchMaker HR or create an account. When a buyer shortlists your product, MMHR emails you one RFP with that buyer's real requirements, and you answer through a private link."
        actions={
          <>
            <Magnetic>
              <Link className="co-btn co-btn-p" href="/contact">Contact the MMHR team</Link>
            </Magnetic>
            <a className="co-btn co-btn-g" href="#rfp-flow">See how an RFP reaches you</a>
          </>
        }
      />

      <PageSection
        id="rfp-flow"
        title="How an RFP reaches you"
        intro="A buyer can shortlist up to five providers. Each one gets the same RFP and answers in its own time."
      >
        <RfpFlow />
      </PageSection>

      <PageSection
        id="path"
        title="From listing to signed contract"
        intro="MMHR staff do the listing and the send-out. You answer one RFP per buyer."
      >
        <PathTrack>
          {pathSteps.map((step, index) => (
            <Reveal
              as="li"
              className="co-fp-path-step"
              index={index % 3}
              key={step.title}
              // --s: the step's place on the path, for the line that draws in.
              style={{ "--s": index } as CSSProperties}
              variant={stepVariants[index]}
            >
              <Tilt innerClassName="co-fp-card" max={4} spotlight>
                <span className="co-num">{index + 1}</span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </Tilt>
            </Reveal>
          ))}
        </PathTrack>
      </PageSection>

      <PageSection id="ranking" title="Rank is earned on fit" intro="Paying MMHR never changes where you rank.">
        <div className="co-fp-rules">
          {/* Decorative depth: two soft glows that drift as the page scrolls. */}
          <Parallax aria-hidden="true" className="co-fp-deco co-fp-deco-a" max={90} speed={0.25} />
          <Parallax aria-hidden="true" className="co-fp-deco co-fp-deco-b" max={70} speed={-0.18} />
          {rankRules.map((rule, index) => (
            <Reveal index={index} key={rule.title} variant={ruleVariants[index]}>
              <Tilt className="co-fp-rule" innerClassName="co-fp-card co-fp-rule-in" max={6} spotlight>
                <span className="co-fp-ico">
                  <RuleIcon name={rule.icon} />
                </span>
                <h3>{rule.title}</h3>
                <p>{rule.body}</p>
              </Tilt>
            </Reveal>
          ))}
        </div>
      </PageSection>

      <PageSection id="answering" title="Answering the RFP" intro="No account, no portal, no sign-in.">
        <div className="co-fp-answer">
          <ul className="co-fp-facts">
            {answeringFacts.map((fact, index) => (
              <Reveal as="li" index={index} key={fact} variant="left">
                <span className="co-fp-fact">{fact}</span>
              </Reveal>
            ))}
          </ul>
          <Reveal delay={160} variant="scale">
            <ReplyPaths />
          </Reveal>
        </div>
      </PageSection>

      <PageSection id="questions" title="Questions from providers">
        <QuestionsAndAnswers items={questions} />
      </PageSection>

      <CtaBand
        title="Talk to the MMHR team."
        body="Ask about your listing, an RFP you received, or how referral fees work."
        action={{ href: "/contact", label: "Contact the MMHR team" }}
      />
    </>
  );
}
