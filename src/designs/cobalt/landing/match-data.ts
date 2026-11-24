/**
 * Sample data for the home page matching demo.
 *
 * Nothing here is a real vendor or a real score. The page labels it
 * "Sample data". Each provider has a made-up "coverage" number per need,
 * from 0 (does not cover it) to 1 (covers it fully).
 */

/** The needs a visitor can switch on and off in the demo. */
export const sampleNeeds = [
  { id: "payroll", label: "Payroll" },
  { id: "benefits", label: "Benefits" },
  { id: "time", label: "Time tracking" },
  { id: "recruiting", label: "Recruiting" },
  { id: "performance", label: "Performance" },
  { id: "global", label: "Global hiring" },
] as const;

export type NeedId = (typeof sampleNeeds)[number]["id"];

/** Needs that are switched on when the page first loads. */
export const defaultNeeds: readonly NeedId[] = ["payroll", "benefits", "time"];

/** Providers picked as contenders when the page first loads. */
export const defaultPicks: readonly string[] = ["03", "11"];

/** A visitor can pick at most this many contenders, same as the real app. */
export const MAX_PICKS = 5;

/** How many rows the ranking board shows. */
export const BOARD_ROWS = 5;

/** Coverage at or above this counts as fully covering a need. */
const FULL = 0.85;
/** Coverage at or above this (but below FULL) counts as partly covering it. */
const PARTIAL = 0.4;

/** Made-up coverage per need for each masked sample provider. */
export const sampleProviders: readonly { id: string; coverage: Record<NeedId, number> }[] = [
  { id: "01", coverage: { payroll: 0.88, benefits: 0.7, time: 0.76, recruiting: 0.4, performance: 0.95, global: 0.2 } },
  { id: "02", coverage: { payroll: 0.85, benefits: 0.4, time: 0.65, recruiting: 0.9, performance: 0.3, global: 0.98 } },
  { id: "03", coverage: { payroll: 0.97, benefits: 0.93, time: 0.92, recruiting: 0.55, performance: 0.7, global: 0.3 } },
  { id: "04", coverage: { payroll: 0.45, benefits: 0.6, time: 0.7, recruiting: 0.3, performance: 0.65, global: 0.95 } },
  { id: "05", coverage: { payroll: 0.6, benefits: 0.75, time: 0.7, recruiting: 0.96, performance: 0.92, global: 0.5 } },
  { id: "06", coverage: { payroll: 0.3, benefits: 0.5, time: 0.6, recruiting: 0.88, performance: 0.9, global: 0.4 } },
  { id: "07", coverage: { payroll: 0.9, benefits: 0.72, time: 0.9, recruiting: 0.95, performance: 0.6, global: 0.9 } },
  { id: "08", coverage: { payroll: 0.5, benefits: 0.8, time: 0.55, recruiting: 0.75, performance: 0.8, global: 0.1 } },
  { id: "09", coverage: { payroll: 0.95, benefits: 0.88, time: 0.3, recruiting: 0.85, performance: 0.5, global: 0.95 } },
  { id: "10", coverage: { payroll: 0.75, benefits: 0.35, time: 0.5, recruiting: 0.92, performance: 0.45, global: 0.7 } },
  { id: "11", coverage: { payroll: 0.95, benefits: 0.9, time: 0.82, recruiting: 0.9, performance: 0.88, global: 0.6 } },
  { id: "12", coverage: { payroll: 0.7, benefits: 0.55, time: 0.75, recruiting: 0.6, performance: 0.97, global: 0.85 } },
];

/** One provider after scoring. `rank` starts at 0 for the best fit. */
export type RankedProvider = {
  id: string;
  /** Fit score from 0 to 100. */
  score: number;
  /** Short plain-language summary, for example "1 partial". */
  note: string;
  rank: number;
};

/** Adds an "s" when the count is not 1, so we print "2 gaps" but "1 gap". */
function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

/**
 * Scores every sample provider against the needs that are switched on and
 * returns them best fit first. The score is the average coverage of the
 * selected needs, as a whole number out of 100. With no needs selected there
 * is nothing to score, so the list is empty.
 */
export function rankProviders(selected: readonly NeedId[]): RankedProvider[] {
  if (selected.length === 0) return [];
  const scored = sampleProviders.map((provider) => {
    const values = selected.map((need) => provider.coverage[need]);
    const total = values.reduce((sum, value) => sum + value, 0);
    const gaps = values.filter((value) => value < PARTIAL).length;
    const partials = values.filter((value) => value >= PARTIAL && value < FULL).length;
    // Gaps matter most, so they are reported first.
    const note = gaps > 0
      ? plural(gaps, "gap")
      : partials > 0
        ? `${partials} partial`
        : "All must-haves";
    return { id: provider.id, score: Math.round((total / values.length) * 100), note };
  });
  // Highest score first. Ties keep a steady order by sorting on the id.
  scored.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return scored.map((row, rank) => ({ ...row, rank }));
}
