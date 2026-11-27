import Link from "next/link";

import { Magnetic, Parallax, Reveal, RevealAll, RevealGroup, Tilt } from "../../motion";
import { CtaBand } from "../CtaBand";
import { JsonLd } from "../JsonLd";
import { PageHero } from "../PageHero";
import { PageSection } from "../PageSection";
import { QuestionsAndAnswers } from "../QuestionsAndAnswers";
import { MaskDemo } from "./MaskDemo";
import { StepStory } from "./StepStory";
import { afterRfp, afterRfpWho, buyerQuestions, journeySteps } from "./journey";
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
 *
 * Motion and things to try (all from the toolkit in ../../motion, all with
 * a still version for reduced motion):
 * - Hero buttons lean toward the mouse (Magnetic).
 * - The step story: a 3D stage that follows the scroll, leans toward the
 *   mouse, and has a step rail with previous / next (StepStory.tsx).
 * - Masking: a hands-on sample comparison (MaskDemo.tsx) over drifting
 *   decorative shapes (Parallax).
 * - Paragraphs and cards arrive one after another as they scroll in
 *   (Reveal, RevealGroup, and RevealAll for the step parts); the four
 *   "after the RFP" cards tilt and light up under the mouse.
 */
export function HowItWorksBody() {
  return (
    <>
      <PageHero
        title="How MatchMaker HR works"
        lede="You answer one needs list. MMHR scores every matching option against it with provider names masked, reviews your requirements with you, and sends one approved RFP to up to five contenders you pick. You sign directly with the provider you choose."
        actions={
          <>
            <Magnetic>
              <Link className="co-btn co-btn-p" href="/sign-up">Start your needs list</Link>
            </Magnetic>
            <Magnetic>
              <Link className="co-btn co-btn-g" href="#steps">Read the six steps</Link>
            </Magnetic>
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
        <div className="co-hiw-masking">
          {/* Decorative depth: two soft shapes drifting at their own pace. */}
          <Parallax aria-hidden="true" className="co-hiw-deco co-hiw-deco-ring" max={90} speed={0.18} />
          <Parallax aria-hidden="true" className="co-hiw-deco co-hiw-deco-blob" max={70} speed={-0.12} />
          <RevealGroup className="co-page-copy" stagger={110}>
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
          </RevealGroup>
          <Reveal className="co-hiw-mask-wrap" variant="scale" delay={120}>
            <MaskDemo />
          </Reveal>
        </div>
      </PageSection>

      <PageSection
        id="advisor-review"
        title="What the advisor review is."
        intro="A conversation with MMHR about your requirements, before anything is sent. It is free, like the rest of the service."
      >
        <RevealGroup className="co-page-copy co-hiw-review" stagger={120}>
          <p>
            You go over your needs list with an MMHR advisor: what you must have, what would be nice, and any
            customization you are asking for. The goal is an RFP that asks providers the right questions.
          </p>
          <p>
            The advisor does not pick providers for you. You choose your contenders, and the RFP goes out only
            once it is approved. After the review, you see the provider names behind the scores.
          </p>
        </RevealGroup>
      </PageSection>

      <PageSection
        id="after-the-rfp"
        title="What happens after the RFP goes out."
        intro="Providers reply to MMHR, you compare the replies, and you sign with the provider you choose."
      >
        <div className="co-hiw-after-wrap">
          <Parallax aria-hidden="true" className="co-hiw-deco co-hiw-deco-line" max={60} speed={0.1} />
          {/* The wrapper draws a connecting line when it arrives; the cards
              rise one after another, then tilt and light up under the mouse. */}
          <RevealGroup as="ol" className="co-hiw-after" stagger={110}>
            {afterRfp.map((line, index) => (
              <li key={line}>
                <Tilt innerClassName="co-gl co-hiw-card" max={6} spotlight>
                  <span className="co-hiw-card-top">
                    <span aria-hidden="true" className="co-hiw-card-n">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="co-chip co-hiw-who" data-who={afterRfpWho[index]}>
                      {afterRfpWho[index]}
                    </span>
                  </span>
                  <span className="co-hiw-card-text">{line}</span>
                  {index < afterRfp.length - 1 ? (
                    <svg aria-hidden="true" className="co-hiw-card-arrow" fill="none" height="18" viewBox="0 0 24 18" width="24">
                      <path d="M2 9h18M14 3l6 6-6 6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                    </svg>
                  ) : (
                    <svg aria-hidden="true" className="co-hiw-card-arrow" fill="none" height="18" viewBox="0 0 24 18" width="24">
                      <path d="M4 9.5l5 5L20 3.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                    </svg>
                  )}
                </Tilt>
              </li>
            ))}
          </RevealGroup>
        </div>
      </PageSection>

      <PageSection id="questions" title="Questions buyers ask.">
        <QuestionsAndAnswers items={buyerQuestions} />
      </PageSection>

      <CtaBand
        title="Start with your needs list."
        body="Free for buyers. Customers never pay MMHR. You sign directly with the provider you choose."
      />
      {/* Watches every data-co-reveal="" in the server HTML above (the step
          parts in StepStory.tsx) and plays each entrance as it scrolls in. */}
      <RevealAll />
    </>
  );
}
