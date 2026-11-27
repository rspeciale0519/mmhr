import Link from "next/link";

import { Magnetic, Parallax, Reveal, Spotlight, Tilt, type RevealVariant } from "@/designs/cobalt/motion";

import { CtaBand } from "../CtaBand";
import { PageHero } from "../PageHero";
import { PageSection } from "../PageSection";
import { QuestionsAndAnswers, type QuestionAndAnswer } from "../QuestionsAndAnswers";
import { FollowTheMoney } from "./FollowTheMoney";
import { ScoreInputs } from "./ScoreInputs";
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
 *   a referral fee; the fee is never an input to the score; the buyer
 *   picks up to five while names are still masked; the advisor review then
 *   names only those picks, and a pick the buyer already knows and does not
 *   want can be swapped for another match; the buyer signs directly with
 *   the provider.
 *
 * Shared blocks are in src/designs/cobalt/pages/: PageHero (the one h1),
 * PageSection, QuestionsAndAnswers, CtaBand.
 *
 * Motion (all from the shared toolkit, src/designs/cobalt/motion): cards
 * and list lines enter with Reveal as they scroll into view (JavaScript
 * driven, so every browser plays them), cards tilt with a light under the
 * cursor, decorative shapes drift with Parallax, the hero buttons lean
 * toward the mouse (Magnetic). Two hands-on pieces: the "Follow the money"
 * diagram (FollowTheMoney.tsx) and "Try an input" (ScoreInputs.tsx).
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
    title: "You pick while names are masked",
    body: "You see every match ranked on fit with provider names hidden, and you choose up to five contenders from the ranking. You judge fit before brand.",
  },
  {
    title: "Names come at your advisor review",
    body: "When you review your requirements with an MMHR advisor, you see the names of the providers you picked. Recognize one you already know and do not want? Swap it for another match. MMHR sends one RFP to each pick, and only after you approve it.",
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
  "Show provider names before you pick.",
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
    answer: "So you judge and pick on fit before brand. You pick up to five while names are masked. The names of your picks are shown when you review your requirements with an MMHR advisor, before any RFP goes out.",
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

/**
 * Small drawn icons for the cards (24px, stroked, currentColor). Each is a
 * plain line drawing, never an emoji. On hover the card's CSS lifts and
 * turns the icon tile (why-its-free.css, "Cards").
 */
const iconPaths = {
  // A wallet with nothing taken out.
  wallet: "M4 7.5h14.5a1.5 1.5 0 0 1 1.5 1.5v8.5a1.5 1.5 0 0 1-1.5 1.5H5.5A1.5 1.5 0 0 1 4 17.5v-11A1.5 1.5 0 0 1 5.5 5H16M16.5 13.2h.01",
  // A payment arrow from a provider into MMHR.
  handoff: "M3.5 12h11M11 8l4 4-4 4M18.5 5v14",
  // A shield: kept out.
  shield: "M12 3.5 5 6.2v5.3c0 4.2 2.9 7.5 7 9 4.1-1.5 7-4.8 7-9V6.2L12 3.5ZM9 12l2 2 4-4",
  // A plug with a gap: not connected.
  unplugged: "M7 4v4M11 4v4M5.5 8h7v3a3.5 3.5 0 0 1-7 0V8ZM9 14.5V17M13.5 18.5l6-6M19.5 18.5l-6-6",
  // Balance scales held level.
  scales: "M12 4v16M7 20h10M5 8h14M5 8l-2.5 6a2.5 2.5 0 0 0 5 0L5 8ZM19 8l-2.5 6a2.5 2.5 0 0 0 5 0L19 8Z",
  // A clock: the fee comes last.
  clock: "M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17ZM12 7.5V12l3 2",
  // An eye with a mask bar.
  masked: "M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6ZM8 12h8",
  // A short list with checks: you pick.
  picks: "M4 6.5l1.4 1.4L8 5.3M4 12.5l1.4 1.4L8 11.3M4 18.5l1.4 1.4L8 17.3M11 7h9M11 13h9M11 19h6",
  // A pen signing on a line.
  sign: "M4 20h16M14.5 4.5l3 3L9 16l-4 1 1-4 8.5-8.5Z",
} as const;

type IconName = keyof typeof iconPaths;

function CardIcon({ name }: { name: IconName }) {
  return (
    <span aria-hidden="true" className="co-wif-ico">
      <svg fill="none" height="24" viewBox="0 0 24 24" width="24">
        <path d={iconPaths[name]} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
      </svg>
    </span>
  );
}

/** The arrow pointing down to the diagram, in the hero's second button. */
function DownIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 16 16" width="16">
      <path d="M8 3v9M4.5 8.5 8 12l3.5-3.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
    </svg>
  );
}

/**
 * One card: tilts toward the mouse with a light under the cursor (Tilt
 * spotlight), and rises, scales or slides in when it scrolls into view
 * (Reveal; `variant` differs per section so the page does not repeat one
 * move). The Reveal element owns the entrance; the Tilt inside it owns the
 * hover, so the two never fight over the same properties.
 */
function Card({
  as = "li",
  icon,
  index,
  number,
  title,
  body,
  variant,
}: {
  as?: "li" | "div";
  icon: IconName;
  index: number;
  number?: boolean;
  title: string;
  body: string;
  variant: RevealVariant;
}) {
  return (
    <Reveal as={as} index={index} variant={variant}>
      <Tilt innerClassName="co-gl co-wif-card" max={5} spotlight>
        <div className="co-wif-card-top">
          <CardIcon name={icon} />
          {number ? (
            <span aria-hidden="true" className="co-wif-n">
              {String(index + 1).padStart(2, "0")}
            </span>
          ) : null}
        </div>
        <h3>{title}</h3>
        <p>{body}</p>
      </Tilt>
    </Reveal>
  );
}

/** Soft decorative shapes that drift at another speed than the page. */
function Decor({ tone }: { tone: "a" | "b" | "c" }) {
  return (
    <div aria-hidden="true" className="co-wif-decor" data-tone={tone}>
      <Parallax className="co-wif-orb co-wif-orb-1" max={90} speed={0.22} />
      <Parallax className="co-wif-orb co-wif-orb-2" max={70} speed={-0.14} />
      <Parallax className="co-wif-ring" max={60} speed={0.12} />
    </div>
  );
}

const whoPays = [
  {
    icon: "wallet",
    title: "You pay nothing",
    body: "Customers never pay MMHR. Not to start, not for the advisor review, not for the RFP, and not when you sign.",
  },
  {
    icon: "handoff",
    title: "The provider you sign with pays",
    body: "Providers pay MMHR a referral fee. It is due from the provider when a buyer signs a contract with them.",
  },
  {
    icon: "shield",
    title: "The fee stays out of your results",
    body: "The fee can differ from one provider to another. It is never an input to the score, so it cannot change your ranking.",
  },
] as const;

const reasonIcons: readonly IconName[] = ["unplugged", "scales", "clock"];
const checkIcons: readonly IconName[] = ["masked", "picks", "sign"];
/** Entrances for the honesty checks: from the left, up, from the right. */
const checkVariants: readonly RevealVariant[] = ["left", "rise", "right"];

export function WhyItsFreeBody() {
  return (
    <>
      <PageHero
        title="Why it's free"
        lede="Buyers never pay MMHR. When you sign with a provider, that provider pays MMHR a referral fee, and that fee is never an input to your ranking."
        actions={
          <>
            <Magnetic>
              <Link className="co-btn co-btn-p" href="/sign-up">Start your needs list</Link>
            </Magnetic>
            <Magnetic>
              <Link className="co-btn co-btn-g co-wif-down" href="#follow-the-money">
                Follow the money
                <DownIcon />
              </Link>
            </Magnetic>
          </>
        }
      />

      <PageSection
        id="who-pays"
        title="Who pays, and when"
        intro="The short answer: providers pay MMHR, buyers do not."
      >
        <div className="co-wif-scene">
          <Decor tone="a" />
          <div className="co-wif-cols">
            {whoPays.map((item, index) => (
              <Card as="div" body={item.body} icon={item.icon} index={index} key={item.title} title={item.title} variant="scale" />
            ))}
          </div>
        </div>
      </PageSection>

      <PageSection
        id="follow-the-money"
        title="Follow the money"
        intro="Step through how your choice and the money move. The fee arrives last, in its own lane, and never touches scoring."
      >
        <Reveal variant="rise">
          <FollowTheMoney />
        </Reveal>
      </PageSection>

      <PageSection
        id="ranking"
        title="Why the fee cannot change your ranking"
        intro="Your scores come only from your needs list."
      >
        <div className="co-wif-scene">
          <Decor tone="b" />
          <ol className="co-wif-cols">
            {rankingReasons.map((reason, index) => (
              <Card body={reason.body} icon={reasonIcons[index]!} index={index} key={reason.title} number title={reason.title} variant="rise" />
            ))}
          </ol>
          <Reveal className="co-wif-try" delay={120} variant="scale">
            <ScoreInputs />
          </Reveal>
        </div>
      </PageSection>

      <PageSection
        id="what-keeps-it-honest"
        title="What keeps it honest"
        intro="Three checks, in the order you meet them."
      >
        <ol className="co-wif-cols">
          {honestyChecks.map((check, index) => (
            <Card
              body={check.body}
              icon={checkIcons[index]!}
              index={index}
              key={check.title}
              number
              title={check.title}
              variant={checkVariants[index]!}
            />
          ))}
        </ol>
      </PageSection>

      <PageSection id="what-mmhr-does-not-do" title="What MMHR does not do">
        <div className="co-wif-scene">
          <Decor tone="c" />
          <ul className="co-wif-nots">
            {doesNot.map((item, index) => (
              // Each line slides in from the left in turn; on hover a light
              // follows the mouse, the icon turns and the text steps aside.
              <Reveal as="li" index={index} key={item} variant="left">
                <Spotlight className="co-wif-not">
                  <span className="co-wif-not-ico">
                    <MinusIcon />
                  </span>
                  <span>{item}</span>
                </Spotlight>
              </Reveal>
            ))}
          </ul>
        </div>
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
