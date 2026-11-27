import { describe, expect, test } from "vitest";

import {
  FEE_STAGE,
  MAX_FEE_LEVEL,
  RAISED_PROVIDER,
  flowStages,
  moneyMoved,
  rankOnFit,
  sampleNeeds,
  sampleProviders,
  sampleProvidersPayingMore,
  verdict,
} from "./money-flow";

describe("follow the money data", () => {
  test("the referral fee is the last stage and the only one where money moves", () => {
    expect(FEE_STAGE).toBe(flowStages.length - 1);
    expect(flowStages[FEE_STAGE]!.title).toBe("Referral fee");
    for (let stage = 0; stage < FEE_STAGE; stage += 1) expect(moneyMoved(stage)).toBe("none yet.");
    expect(moneyMoved(FEE_STAGE)).toContain("You paid nothing");
  });

  test("raising one provider's fee changes only that fee", () => {
    const raised = sampleProvidersPayingMore.find((provider) => provider.id === RAISED_PROVIDER);
    const before = sampleProviders.find((provider) => provider.id === RAISED_PROVIDER);
    expect(raised?.feeLevel).toBe(MAX_FEE_LEVEL);
    expect(before?.feeLevel).toBeLessThan(MAX_FEE_LEVEL);
    expect(sampleProvidersPayingMore.map(({ id, coverage }) => ({ id, coverage }))).toEqual(
      sampleProviders.map(({ id, coverage }) => ({ id, coverage })),
    );
  });

  test("a higher fee leaves every score and the whole order unchanged", () => {
    expect(rankOnFit(sampleNeeds, sampleProvidersPayingMore)).toEqual(rankOnFit(sampleNeeds, sampleProviders));
  });

  test("ranks on fit, best first, with whole-number scores", () => {
    const ranked = rankOnFit(sampleNeeds, sampleProviders);
    expect(ranked.map((row) => row.id)).toEqual(["A", "B", "C", "D"]);
    expect(ranked.map((row) => row.rank)).toEqual([1, 2, 3, 4]);
    for (const row of ranked) expect(Number.isInteger(row.score)).toBe(true);
  });

  test("the verdict sentence matches the computed ranking", () => {
    const ranked = rankOnFit(sampleNeeds, sampleProvidersPayingMore);
    const row = ranked.find((result) => result.id === RAISED_PROVIDER)!;
    const text = verdict(true, ranked);
    expect(text).toContain(`fit score of ${row.score}`);
    expect(text).toContain("still fourth");
  });
});
