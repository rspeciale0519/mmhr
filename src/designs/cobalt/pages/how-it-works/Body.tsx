import Link from "next/link";

import { CtaBand } from "../CtaBand";
import { JsonLd } from "../JsonLd";
import { PageHero } from "../PageHero";
import { PageSection } from "../PageSection";
import { QuestionsAndAnswers } from "../QuestionsAndAnswers";
import { StepStory } from "./StepStory";
import { afterRfp, buyerQuestions, journeySteps } from "./journey";
import "./how-it-works.css";

/**
 * Body of /how-it-works. The route file
 * (src/app/(marketing)/(site)/how-it-works/page.tsx) only sets the metadata
 * and renders this, so all page content lives here.
 *
 * Sections, in order:
 * 1. Hero: the page's one h1 and a direct answer to "how does it work?".
 * 2. The six steps as a scroll story (StepStory.tsx): each step says what
 *    you do, what MMHR does, and what you get, beside a picture of it.
 * 3. What "masked" means and when names appear.
 * 4. What the advisor review is.
 * 5. What happens after the RFP goes out.
 * 6. Buyer questions (visible text plus FAQPage structured data).
 * 7. Closing call to action.
 *
 * The words live in journey.ts. Shared blocks are in
 * src/designs/cobalt/pages/.
 */
export function HowItWorksBody() {
  return (
    <>
      <PageHero
        title="How MatchMaker HR works"
        lede="You answer one needs list. MMHR scores every matching option against it with provider names masked, reviews your requirements with you, and sends one approved RFP to up to five contenders you pick. You sign directly with the provider you choose."
        actions={
          <>
            <Link className="co-btn co-btn-p" href="/sign-up">Start your needs list</Link>
            <Link className="co-btn co-btn-g" href="#steps">Read the six steps</Link>
          </>
        }
      />

      <PageSection
        id="steps"
        title="Six steps, from needs list to signed contract."
        intro="At each step: what you do, what MMHR does, and what you get. The picture beside the steps is an illustration with sample data."
      >
        <StepStory steps={journeySteps} />
        {/* HowTo structured data: the same step titles and "You" sentences
            the visitor reads above, in the same order. */}
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "HowTo",
            name: "How to choose HRIS software with MatchMaker HR",
            step: journeySteps.map((step, index) => ({
              "@type": "HowToStep",
              position: index + 1,
              name: step.title,
              text: step.you,
            })),
          }}
        />
      </PageSection>

      <PageSection
        id="masking"
        title="What masked means, and when names appear."
        intro="Masked means you see every matching option and its fit score, but not the provider's name."
      >
        <div className="co-page-copy">
          <p>
            In the first comparison, each option shows how well it fits your needs list. The provider&apos;s
            name is hidden, so the comparison is about fit, not about a brand you already know.
          </p>
          <p>
            Fees stay out of it too. Providers pay MMHR a referral fee, and that fee is never an input to the
            ranking. Who pays, and how much, never changes your results.
          </p>
          <p>
            Names appear after you review your requirements with an MMHR advisor. MMHR records when the names
            are shown to you. That always happens before any RFP goes out, so you know exactly who receives
            your request.
          </p>
        </div>
      </PageSection>

      <PageSection
        id="advisor-review"
        title="What the advisor review is."
        intro="A conversation with MMHR about your requirements, before anything is sent. It is free, like the rest of the service."
      >
        <div className="co-page-copy">
          <p>
            You go over your needs list with an MMHR advisor: what you must have, what would be nice, and any
            customization you are asking for. The goal is an RFP that asks providers the right questions.
          </p>
          <p>
            The advisor does not pick providers for you. You choose your contenders, and the RFP goes out only
            once it is approved. After the review, you see the provider names behind the scores.
          </p>
        </div>
      </PageSection>

      <PageSection
        id="after-the-rfp"
        title="What happens after the RFP goes out."
        intro="Providers reply to MMHR, you compare the replies, and you sign with the provider you choose."
      >
        <ol className="co-hiw-after">
          {afterRfp.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ol>
      </PageSection>

      <PageSection id="questions" title="Questions buyers ask.">
        <QuestionsAndAnswers items={buyerQuestions} />
      </PageSection>

      <CtaBand
        title="Start with your needs list."
        body="Free for buyers. Customers never pay MMHR. You sign directly with the provider you choose."
      />
    </>
  );
}
