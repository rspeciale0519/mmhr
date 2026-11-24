import { expect, test } from "vitest";

import { defaultNeeds, rankProviders, sampleProviders } from "./match-data";

test("ranks every sample provider, best fit first", () => {
  const ranked = rankProviders(defaultNeeds);
  expect(ranked).toHaveLength(sampleProviders.length);
  expect(ranked[0]).toMatchObject({ id: "03", score: 94, note: "All must-haves", rank: 0 });
  // Each score is no higher than the one before it.
  ranked.forEach((row, index) => {
    if (index > 0) expect(row.score).toBeLessThanOrEqual(ranked[index - 1].score);
  });
});

test("changing the needs changes the order", () => {
  const before = rankProviders(defaultNeeds).map((row) => row.id);
  const after = rankProviders(["recruiting", "global"]).map((row) => row.id);
  expect(after).not.toEqual(before);
});

test("reports gaps before partial matches", () => {
  const row = rankProviders(["time"]).find((item) => item.id === "09");
  expect(row?.note).toBe("1 gap");
});

test("scores nothing when no need is selected", () => {
  expect(rankProviders([])).toEqual([]);
});
