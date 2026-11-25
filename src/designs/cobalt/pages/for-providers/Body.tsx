import Link from "next/link";

import { CtaBand } from "../CtaBand";
import { PageHero } from "../PageHero";
import { PageSection } from "../PageSection";
import { QuestionsAndAnswers } from "../QuestionsAndAnswers";
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
    body: "The buyer picks up to five contenders, then reviews requirements with an MMHR advisor. Names are shown after that review.",
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
    title: "Scored on the buyer's needs",
    body: "Each option gets a fit score against the needs list this buyer submitted. A closer fit ranks higher.",
  },
  {
    title: "Fees are not an input",
    body: "The referral fee is never an input to rank. Who pays MMHR, and how much, never changes results.",
  },
  {
    title: "Masked until review",
    body: "Buyers compare fit with provider names masked, until they review requirements with an MMHR advisor.",
  },
] as const;

/** What answering the RFP involves for the provider. */
const answeringFacts = [
  "The email comes from MatchMaker HR, your contact for the RFP.",
  "The private link opens an overview of the buyer and the questions for the topics this buyer needs. No account or password is needed.",
  "Answers save automatically as you go, and you can upload the documents the buyer asks for.",
  "Submitting locks the form. The link stops taking changes after the due date.",
  "Prefer email? Reply to MMHR by email instead, and staff record your reply.",
] as const;

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
            <Link className="co-btn co-btn-p" href="/contact">Contact the MMHR team</Link>
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
        <ol className="co-fp-path">
          {pathSteps.map((step, index) => (
            <li className="co-fp-rv" key={step.title}>
              <span className="co-num">{index + 1}</span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </li>
          ))}
        </ol>
      </PageSection>

      <PageSection id="ranking" title="Rank is earned on fit" intro="Paying MMHR never changes where you rank.">
        <div className="co-fp-rules">
          {rankRules.map((rule) => (
            <div className="co-fp-rv" key={rule.title}>
              <h3>{rule.title}</h3>
              <p>{rule.body}</p>
            </div>
          ))}
        </div>
      </PageSection>

      <PageSection id="answering" title="Answering the RFP" intro="No account, no portal, no sign-in.">
        <ul className="co-fp-facts">
          {answeringFacts.map((fact) => (
            <li className="co-fp-rv" key={fact}>{fact}</li>
          ))}
        </ul>
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
