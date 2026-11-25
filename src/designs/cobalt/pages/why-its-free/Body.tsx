import Link from "next/link";

import { CtaBand } from "../CtaBand";
import { PageHero } from "../PageHero";
import { PageSection } from "../PageSection";
import { QuestionsAndAnswers, type QuestionAndAnswer } from "../QuestionsAndAnswers";
import { FollowTheMoney } from "./FollowTheMoney";
import "./why-its-free.css";

/**
 * Body of /why-its-free. The route file
 * (src/app/(marketing)/(site)/why-its-free/page.tsx) only sets the metadata
 * and renders this, so all page content lives here.
 *
 * The page answers one doubt: "if it's free, how does MMHR make money, and
 * does that bias the ranking?". Copy rules that apply to every word here:
 * - Never state a fee amount, percentage or range, and never say every
 *   provider pays the same (src/app/(marketing)/_site/public-commission-claims.test.ts
 *   and ./why-its-free-claims.test.tsx check this).
 * - Say "provider" for vendors, as the home page does.
 * - Only claim what the product does today: buyers never pay; providers pay
 *   a referral fee; the fee is never an input to the score; names stay
 *   masked until the advisor review; the buyer picks up to five and signs
 *   directly with the provider.
 *
 * Shared blocks are in src/designs/cobalt/pages/: PageHero (the one h1),
 * PageSection, QuestionsAndAnswers, CtaBand.
 */

/** The three reasons the fee cannot move a ranking. */
const rankingReasons = [
  {
    title: "The fee is never an input",
    body: "Scoring has one input: your needs list. The referral fee is not part of the calculation at any point, so there is nothing for it to push.",
  },
  {
    title: "Who pays never changes results",
    body: "Who pays MMHR, and how much, never changes your results. A provider cannot buy a higher score or a better place.",
  },
  {
    title: "The fee comes last",
    body: "A referral fee only exists after you sign a contract. By then your ranking was made, your picks were yours, and the RFP had gone out.",
  },
] as const;

/** The checks a buyer controls, in the order they happen. */
const honestyChecks = [
  {
    title: "Names stay masked until your advisor review",
    body: "You see every match ranked on fit with provider names hidden. Names are shown only after you review your requirements with an MMHR advisor, so you judge fit before brand.",
  },
  {
    title: "You pick the contenders",
    body: "You choose up to five providers from the ranking. MMHR sends one RFP to each of them, and only after you approve it.",
  },
  {
    title: "You sign directly with the provider",
    body: "The contract is between you and the provider you choose. MMHR does not charge you for it, before or after you sign.",
  },
] as const;

/** Things MMHR does not do. Each one is a current product rule. */
const doesNot = [
  "Charge buyers anything, at any step.",
  "Let a fee, or who pays it, change a score or a ranking.",
  "Show provider names before your advisor review.",
  "Send an RFP you have not approved, or send it to providers you did not pick.",
  "Sign the contract for you. You sign it directly with the provider.",
] as const;

/** Sceptical buyer questions, answered directly. Also published as FAQPage data. */
const questions: readonly QuestionAndAnswer[] = [
  {
    question: "If MatchMaker HR is free, how does it make money?",
    answer: "Providers pay MMHR. When you sign with a provider, that provider pays MMHR a referral fee. You never pay MMHR anything.",
  },
  {
    question: "Can a provider pay to rank higher?",
    answer: "No. The referral fee is never an input to the score, so who pays and how much never changes your results. Your ranking comes only from fit with your needs list.",
  },
  {
    question: "Does every provider pay MMHR the same fee?",
    answer: "Not necessarily. The fee is set in MMHR's agreement with each provider and can differ. That is one reason it is kept out of scoring completely.",
  },
  {
    question: "Why are provider names hidden at first?",
    answer: "So you judge fit before brand. Names stay masked until you review your requirements with an MMHR advisor, and then they are shown before any RFP goes out.",
  },
  {
    question: "Who contacts the providers?",
    answer: "MMHR does, and only the providers you picked. MMHR sends one RFP that you approved to each of your contenders, up to five.",
  },
  {
    question: "Who do I sign the contract with?",
    answer: "The provider. You sign directly with the provider you choose, and you pay MMHR nothing for it.",
  },
];

/** A small drawn minus sign for the "does not do" list. */
function MinusIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="20" viewBox="0 0 20 20" width="20">
      <circle cx="10" cy="10" r="8.25" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6.5 10h7" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  );
}

export function WhyItsFreeBody() {
  return (
    <>
      <PageHero
        title="Why it's free"
        lede="Buyers never pay MMHR. When you sign with a provider, that provider pays MMHR a referral fee, and that fee is never an input to your ranking."
        actions={
          <>
            <Link className="co-btn co-btn-p" href="/sign-up">Start your needs list</Link>
            <Link className="co-btn co-btn-g" href="#follow-the-money">Follow the money</Link>
          </>
        }
      />

      <PageSection
        id="who-pays"
        title="Who pays, and when"
        intro="The short answer: providers pay MMHR, buyers do not."
      >
        <div className="co-wif-cols">
          <div style={{ ["--i" as string]: 0 }}>
            <h3>You pay nothing</h3>
            <p>Customers never pay MMHR. Not to start, not for the advisor review, not for the RFP, and not when you sign.</p>
          </div>
          <div style={{ ["--i" as string]: 1 }}>
            <h3>The provider you sign with pays</h3>
            <p>Providers pay MMHR a referral fee. It is due from the provider when a buyer signs a contract with them.</p>
          </div>
          <div style={{ ["--i" as string]: 2 }}>
            <h3>The fee stays out of your results</h3>
            <p>The fee can differ from one provider to another. It is never an input to the score, so it cannot change your ranking.</p>
          </div>
        </div>
      </PageSection>

      <PageSection
        id="follow-the-money"
        title="Follow the money"
        intro="Step through how your choice and the money move. The fee arrives last, in its own lane, and never touches scoring."
      >
        <FollowTheMoney />
      </PageSection>

      <PageSection
        id="ranking"
        title="Why the fee cannot change your ranking"
        intro="Your scores come only from your needs list."
      >
        <ol className="co-wif-cols">
          {rankingReasons.map((reason, index) => (
            <li key={reason.title} style={{ ["--i" as string]: index }}>
              <h3>{reason.title}</h3>
              <p>{reason.body}</p>
            </li>
          ))}
        </ol>
      </PageSection>

      <PageSection
        id="what-keeps-it-honest"
        title="What keeps it honest"
        intro="Three checks, in the order you meet them."
      >
        <ol className="co-wif-cols">
          {honestyChecks.map((check, index) => (
            <li key={check.title} style={{ ["--i" as string]: index }}>
              <h3>{check.title}</h3>
              <p>{check.body}</p>
            </li>
          ))}
        </ol>
      </PageSection>

      <PageSection id="what-mmhr-does-not-do" title="What MMHR does not do">
        <ul className="co-wif-nots">
          {doesNot.map((item, index) => (
            <li key={item} style={{ ["--i" as string]: index }}>
              <MinusIcon />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </PageSection>

      <PageSection id="questions" title="Questions buyers ask">
        <QuestionsAndAnswers items={questions} />
      </PageSection>

      <CtaBand
        title="Start with your needs list."
        body="Free for buyers. You sign directly with the provider you choose."
      />
    </>
  );
}
