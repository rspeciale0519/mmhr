/**
 * Content and sample data for the "Follow the money" diagram on /why-its-free.
 *
 * The diagram walks a buyer through seven stages, from their needs list to
 * the referral fee. Every word the diagram shows lives here, so the copy can
 * be checked in one place (see why-its-free-claims.test.tsx).
 *
 * The ranking at the bottom of the file is sample data: made-up, anonymous
 * providers ("Provider A" to "Provider D") with made-up fit numbers. The page
 * labels it "Sample data". Fee levels are relative bars only (1 = lowest,
 * 5 = highest in the sample). They are never amounts or percentages: the
 * public site must not state what any provider pays.
 */

/** One stage of the diagram. */
export type FlowStage = {
  /** Short heading shown in the box and above the explanation. */
  readonly title: string;
  /** A few words under the title inside the box. */
  readonly tag: string;
  /** One or two plain sentences shown when this stage is selected. */
  readonly body: string;
};

/**
 * The seven stages, in order. The last one is the only stage where money
 * moves, and it sits in its own "money" lane in the diagram, away from
 * scoring.
 */
export const flowStages: readonly FlowStage[] = [
  {
    title: "Your needs list",
    tag: "What you need",
    body: "You answer one needs list: your company size, the modules you need, your must-haves and your timeline. Everything after this starts from your answers.",
  },
  {
    title: "Scoring",
    tag: "Only input: your needs list",
    body: "Every matching option is scored on how well it fits your needs list. Your list is the only input. No fee, and nothing about who pays, goes into the score.",
  },
  {
    title: "Ranked, names masked",
    tag: "Ranked on fit",
    body: "You see every match ranked by fit, with provider names masked. You judge fit first, before any brand gets a say.",
  },
  {
    title: "Your five picks",
    tag: "You choose",
    body: "You pick up to five contenders from the ranking while names are still masked. The choice is yours, not MMHR's.",
  },
  {
    title: "One approved RFP",
    tag: "Sent once you approve",
    body: "You review your requirements with an MMHR advisor and see the names of your picks. Recognize one you already know and do not want? Swap it for another match. MMHR then sends one RFP that you approved to each provider you picked.",
  },
  {
    title: "You sign direct",
    tag: "Your contract, your provider",
    body: "You compare the replies, choose a provider and sign the contract directly with them.",
  },
  {
    title: "Referral fee",
    tag: "Provider pays MMHR",
    body: "The provider you signed with pays MMHR a referral fee. You pay MMHR nothing, here or at any other step. Your ranking was made long before this fee existed, and the fee was never part of it.",
  },
];

/** The stage number (counted from 0) of the scoring step. */
export const SCORING_STAGE = 1;

/** The stage number (counted from 0) where money moves: the last one. */
export const FEE_STAGE = flowStages.length - 1;

/** Words for "how much money has moved", shown above the diagram. */
export function moneyMoved(stage: number): string {
  return stage === FEE_STAGE ? "provider to MMHR. You paid nothing." : "none yet.";
}

/** The sample needs list the sample ranking is scored against. */
export const sampleNeeds = ["payroll", "benefits", "time"] as const;

export type SampleNeed = (typeof sampleNeeds)[number];

/** Plain words for the sample needs, used in the table caption. */
export const sampleNeedsLabel = "payroll, benefits and time tracking";

/**
 * What scoring is allowed to see about a provider: how well it covers each
 * need, from 0 (not at all) to 1 (fully). There is deliberately no fee here.
 */
export type FitProfile = {
  readonly id: string;
  readonly coverage: Readonly<Record<SampleNeed, number>>;
};

/** A sample provider: its fit profile plus a relative fee level (1 to 5). */
export type SampleProvider = FitProfile & { readonly feeLevel: number };

/** The highest relative fee level in the sample. */
export const MAX_FEE_LEVEL = 5;

/** Four made-up, masked providers. */
export const sampleProviders: readonly SampleProvider[] = [
  { id: "A", coverage: { payroll: 0.95, benefits: 0.9, time: 0.86 }, feeLevel: 2 },
  { id: "B", coverage: { payroll: 0.88, benefits: 0.8, time: 0.75 }, feeLevel: 4 },
  { id: "C", coverage: { payroll: 0.7, benefits: 0.85, time: 0.6 }, feeLevel: 1 },
  { id: "D", coverage: { payroll: 0.62, benefits: 0.5, time: 0.7 }, feeLevel: 3 },
];

/** The provider the "what if a provider paid more?" switch raises. */
export const RAISED_PROVIDER = "D";

/**
 * The same four providers, except that Provider D now pays the highest fee
 * in the sample. Everything scoring can see is untouched.
 */
export const sampleProvidersPayingMore: readonly SampleProvider[] = sampleProviders.map((provider) =>
  provider.id === RAISED_PROVIDER ? { ...provider, feeLevel: MAX_FEE_LEVEL } : provider,
);

/** One provider after scoring. `rank` starts at 1 for the best fit. */
export type FitResult = { readonly id: string; readonly score: number; readonly rank: number };

/**
 * Scores providers against the needs list and returns them best fit first.
 *
 * The score is the average coverage of the needs, as a whole number out of
 * 100. The parameter type is `FitProfile`, which has no fee field, so this
 * function cannot read a fee even when it is handed providers that carry one.
 * That mirrors the product rule: fees are never an input to the ranking.
 */
export function rankOnFit(needs: readonly SampleNeed[], providers: readonly FitProfile[]): FitResult[] {
  const scored = providers.map((provider) => {
    const total = needs.reduce((sum, need) => sum + provider.coverage[need], 0);
    return { id: provider.id, score: Math.round((total / needs.length) * 100) };
  });
  // Highest score first. Ties keep a steady order by id.
  scored.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return scored.map((row, index) => ({ ...row, rank: index + 1 }));
}

/** Ordinal words for the four sample ranks, used in plain sentences. */
const ORDINALS = ["first", "second", "third", "fourth"] as const;

/**
 * The sentence under the switch. It is built from the ranking the page just
 * computed, so the words always match what the table shows.
 */
export function verdict(paidMore: boolean, ranked: readonly FitResult[]): string {
  const row = ranked.find((result) => result.id === RAISED_PROVIDER);
  if (!row) return "";
  const place = ORDINALS[row.rank - 1] ?? `number ${row.rank}`;
  if (!paidMore) {
    return `Provider ${row.id} ranks ${place} with a fit score of ${row.score}. Switch on the question to raise its fee to the highest in this sample.`;
  }
  return `Provider ${row.id} now pays the highest fee in this sample. It is still ${place}, with a fit score of ${row.score}, because the score measures only fit with your needs list. A bigger fee has nothing to change.`;
}
