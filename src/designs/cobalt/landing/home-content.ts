/**
 * Copy for the home page sections below the hero (see Body.tsx).
 *
 * FR-MKT-03: every public claim must be true and traceable. Each line here
 * restates the approved buyer journey in docs/PRD.md ("Approved Customer
 * Journey"): one needs list, every matching option scored against it with
 * names masked, up to five contenders picked while still masked, an advisor
 * review that names only the picks (one the buyer already knows and does not
 * want can be swapped for another match), one approved RFP, a contract
 * signed directly with the provider, and providers (never
 * customers) paying MMHR a referral fee that is never an input to rank.
 * Do not add figures, counts, time savings, customer names, or vendor names.
 */

import type { QuestionAndAnswer } from "../pages/QuestionsAndAnswers";

/**
 * The four numbers in the strip under the hero. These are rules of the
 * service, not statistics.
 *
 * `value` is the number shown. `from` is where its rolling digit starts when
 * the strip scrolls into view, so 1 and 5 count up and 0 counts down from 9
 * (see Odometer in HomeFacts.tsx).
 */
export const homeFacts = [
  { value: 1, from: 0, label: "needs list to answer. Every matching option is scored against it." },
  { value: 5, from: 0, label: "contenders at most, and you pick them." },
  { value: 1, from: 0, label: "approved RFP, sent by MMHR to each provider you pick." },
  { value: 0, from: 9, label: "fees for buyers. Customers never pay MMHR." },
] as const;

/** Buyer situations MMHR fits, for the "Who it's for" section. */
export const buyerSituations = [
  {
    title: "Buying your first HRIS",
    body: "HR runs on spreadsheets, email and a payroll login, and you want one system. Answer the needs list and see what fits before you talk to anyone.",
  },
  {
    title: "Outgrowing payroll-only tools",
    body: "Payroll works, but onboarding, time off, benefits or performance live somewhere else. Compare systems on the modules you actually need.",
  },
  {
    title: "Replacing a system that no longer fits",
    body: "Your current HRIS is missing modules, hard to use, or up for renewal. Score every matching option against today's requirements before you commit again.",
  },
  {
    title: "Choosing without a selection team",
    body: "No consultant or procurement team? An MMHR advisor reviews your requirements with you, and MMHR sends the RFP to the providers you pick.",
  },
] as const;

/**
 * Common buyer questions. The same strings feed the visible answers and the
 * FAQPage structured data (QuestionsAndAnswers), so keep them plain text.
 * Each answer starts with the direct answer, then one supporting sentence.
 */
export const homeQuestions: readonly QuestionAndAnswer[] = [
  {
    question: "Is MatchMaker HR free for buyers?",
    answer: "Yes. Customers never pay MMHR. Providers pay MMHR a referral fee, which is how the service stays free for you.",
  },
  {
    question: "Does the referral fee change which providers rank highest?",
    answer: "No. The fee is never an input to the ranking. Every matching option is scored against your needs list, and who pays, and how much, never changes your results.",
  },
  {
    question: "Why are provider names hidden at first?",
    answer: "So you compare and pick on fit before brand. You pick up to five while names are masked, then see your picks' names when you review your requirements with an MMHR advisor. Recognize one you already know and do not want? Swap it for another match.",
  },
  {
    question: "How many providers receive my RFP?",
    answer: "Up to five. You pick up to five contenders, review them with an advisor, approve the RFP, and MMHR sends it to each provider you picked.",
  },
  {
    question: "Do the providers I pick need to be on MMHR?",
    answer: "No. MMHR staff list providers and email the approved RFP to each provider's contact. Providers reply through a private web form link or by email, without an account.",
  },
  {
    question: "Who do I sign the contract with?",
    answer: "The provider you choose. You sign directly with that provider; your contract is with them, not with MMHR.",
  },
  {
    question: "What do I need to get started?",
    answer: "A free account and your needs list. The needs list asks about your company size, the HR modules you need, your must-haves, and your timeline.",
  },
];
