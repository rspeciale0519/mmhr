import { describe, expect, test } from "vitest";

import {
  MAX_INITIAL_CANDIDATES,
  rankCandidates,
  selectInitialCandidates,
} from "./deterministic-matching";

const requirements = [
  { key: "payroll", importance: "must" as const, weight: 3 },
  { key: "benefits", importance: "nice" as const, weight: 1 },
];

describe("deterministic matching", () => {
  test("ranks by approved requirements and breaks ties by candidate id", () => {
    expect(
      rankCandidates(requirements, [
        { id: "vendor-b", capabilities: { payroll: true } },
        { id: "vendor-a", capabilities: { payroll: true } },
        { id: "vendor-c", capabilities: { benefits: true } },
      ]),
    ).toEqual([
      {
        candidateId: "vendor-a",
        eligible: true,
        score: 7500,
        fitReasons: ["payroll"],
        limitations: [],
      },
      {
        candidateId: "vendor-b",
        eligible: true,
        score: 7500,
        fitReasons: ["payroll"],
        limitations: [],
      },
      {
        candidateId: "vendor-c",
        eligible: false,
        score: 2500,
        fitReasons: ["benefits"],
        limitations: ["payroll"],
      },
    ]);
  });

  test("ignores not applicable requirements and has no commercial input", () => {
    expect(() => rankCandidates(
      [{ key: "payroll", importance: "not_applicable", weight: 100 }],
      [{ id: "vendor-a", capabilities: {} }],
    )).toThrow("applicable requirement");
  });

  test("rejects duplicate and invalid inputs", () => {
    expect(() => rankCandidates([
      ...requirements,
      { key: "payroll", importance: "must", weight: 1 },
    ], [])).toThrow("duplicate requirement");
    expect(() => rankCandidates(requirements, [
      { id: "vendor-a", capabilities: {} },
      { id: "vendor-a", capabilities: {} },
    ])).toThrow("duplicate candidate");
  });

  test("enforces the five-candidate initial boundary", () => {
    const candidates = Array.from({ length: MAX_INITIAL_CANDIDATES }, (_, index) => ({
      id: `vendor-${index}`,
      capabilities: {},
    }));
    expect(selectInitialCandidates(candidates)).toHaveLength(5);
    expect(() => selectInitialCandidates([...candidates, { id: "vendor-5", capabilities: {} }]))
      .toThrow("at most 5 candidates");
  });
});
