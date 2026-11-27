import { sixSteps } from "../../landing/sample-ranking";

/**
 * The words of the /how-it-works page: the six steps in full, and the
 * buyer questions.
 *
 * The step numbers, titles, and one-line summaries come from `sixSteps`,
 * the same list the home page shows, so the two pages never disagree. This
 * file adds, for each step, what the buyer does, what MMHR does, and what
 * the buyer gets.
 *
 * Every sentence must stay true to the product: customers never pay MMHR;
 * providers pay MMHR a referral fee that is never an input to the ranking;
 * names stay masked until the advisor review; up to five contenders; one
 * approved RFP emailed to each; the buyer signs directly with the provider.
 * No statistics, counts, or provider names. Tests in journey.test.ts guard
 * the key claims.
 */

type StepDetail = {
  /** What the buyer does at this step. */
  you: string;
  /** What MMHR does at this step. */
  mmhr: string;
  /** What the buyer has once the step is done. */
  get: string;
};

const details: Record<(typeof sixSteps)[number]["n"], StepDetail> = {
  "01": {
    you: "Answer one needs list: your company size, the modules you want, your must-haves, and your timeline.",
    mmhr: "Keeps your answers in a private workspace for your organization and uses them as the yardstick for every match.",
    get: "A free account and one needs list that every option is measured against. You fill it in once.",
  },
  "02": {
    you: "Look through every matching option side by side, each with a fit score against your needs list.",
    mmhr: "Scores every matching option on fit and hides the provider names. Referral fees are never an input to the score.",
    get: "A comparison of every match, ranked on fit alone, with names masked.",
  },
  "03": {
    you: "Review your requirements with an MMHR advisor: what you must have, what would be nice, and any customization you need.",
    mmhr: "Checks that your needs list says what you mean, records the review, and then shows you the provider names.",
    get: "Confirmed requirements, and the real names behind the scores, before any RFP goes out.",
  },
  "04": {
    you: "Choose up to five contenders to receive your RFP. You decide who is on the list.",
    mmhr: "Keeps the list to five at most. Only the providers you choose receive your request.",
    get: "A shortlist of up to five contenders, chosen by you.",
  },
  "05": {
    you: "Read the RFP (request for proposal) that MMHR prepares from your confirmed requirements, and approve it.",
    mmhr: "Once it is approved, emails the same RFP to the contact at each provider you picked. Nothing goes out before approval.",
    get: "One request, sent once, to each of your contenders. Providers reply by a private web form link or by email.",
  },
  "06": {
    you: "Compare the replies, choose a provider, and sign your contract directly with them.",
    mmhr: "Tracks each reply and follow-up along the way. Providers pay MMHR a referral fee; you never pay MMHR.",
    get: "A contract with the provider you chose. Your contract is with the provider, not with MMHR.",
  },
};

/** The six steps with their full explanation, in order. */
export const journeySteps = sixSteps.map((step) => ({ ...step, ...details[step.n] }));

export type JourneyStep = (typeof journeySteps)[number];

/** What happens after the RFP goes out, in order. */
export const afterRfp = [
  "MMHR emails the approved RFP to the contact at each provider you picked.",
  "Each provider replies through a private web form link or by email. Providers do not need an MMHR account.",
  "MMHR tracks due dates, follows up, and records each reply as it comes in.",
  "You compare the replies, choose one provider, and sign your contract directly with them.",
] as const;

/**
 * Who acts in each line of `afterRfp`, shown as a small chip on its card.
 * Same order as `afterRfp`; each one names the subject of its sentence.
 */
export const afterRfpWho = ["MMHR", "Provider", "MMHR", "You"] as const;

/**
 * Buyer questions, answered directly. These exact strings are both shown on
 * the page and published as FAQPage structured data, so keep them identical
 * and true.
 */
export const buyerQuestions = [
  {
    question: "Is MatchMaker HR free for buyers?",
    answer: "Yes. Customers never pay MMHR. Providers pay MMHR a referral fee, and that fee is never an input to the ranking.",
  },
  {
    question: "Why are provider names hidden at first?",
    answer: "So your first comparison is about fit, not brand. Names are shown after you review your requirements with an MMHR advisor, before any RFP goes out.",
  },
  {
    question: "Does a referral fee change my results?",
    answer: "No. Who pays MMHR, and how much, never changes your results. The fee is never an input to the ranking.",
  },
  {
    question: "How many providers receive my RFP?",
    answer: "Up to five, and only the ones you pick. Each of them receives the same approved RFP.",
  },
  {
    question: "Do providers need an MMHR account to reply?",
    answer: "No. MMHR emails the RFP to each provider's contact, and the provider replies through a private web form link or by email.",
  },
  {
    question: "Who do I sign the contract with?",
    answer: "With the provider you choose. You sign directly with them; your contract is not with MMHR.",
  },
  {
    question: "What is an RFP?",
    answer: "A request for proposal: one document that sets out your requirements and asks each provider to respond. MMHR prepares it from your confirmed needs list, and it goes out only once it is approved.",
  },
] as const;
