import { describe, expect, test } from "vitest";

import { estimateEmployeeCountKey } from "@/lib/intake-estimate";
import {
  formatMapAnswer, intakeQuestionSetVersion, isIsoDate, listSections, mapQuestionLabel, mapQuestions, orderedMapEntries,
  parseStateCodes, prefixFor, usStateCodes,
} from "./intake-questions";

describe("guided intake question set", () => {
  test("is version 1 and keeps every stored key unique and versioned", () => {
    expect(intakeQuestionSetVersion).toBe(1);
    const keys = Object.values(mapQuestions).flatMap((questions) => questions.map((question) => question.key));
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) expect(key).toMatch(/V1$/);
    expect(keys).toContain(estimateEmployeeCountKey);
  });

  test("keeps list prefixes inside the 200-character list limit", () => {
    for (const section of Object.values(listSections)) {
      for (const question of section.prefixQuestions) expect(prefixFor(question).length).toBeLessThan(60);
      for (const option of section.checklist?.options ?? []) expect(option.length).toBeLessThanOrEqual(200);
    }
  });

  test("has the 50 states and DC", () => {
    expect(usStateCodes).toHaveLength(51);
    expect(new Set(usStateCodes).size).toBe(51);
  });
});

describe("saved answer readers", () => {
  test("parses only plain state code lists", () => {
    expect(parseStateCodes("tx, FL")).toEqual(["FL", "TX"]);
    expect(parseStateCodes("")).toEqual([]);
    expect(parseStateCodes("Remote only")).toBeNull();
    expect(parseStateCodes(3)).toBeNull();
  });

  test("accepts only real calendar dates", () => {
    expect(isIsoDate("2027-02-28")).toBe(true);
    expect(isIsoDate("2027-02-30")).toBe(false);
    expect(isIsoDate("soon")).toBe(false);
  });

  test("labels guided keys and leaves earlier labels as saved", () => {
    expect(mapQuestionLabel("budget", "annualBudgetRangeV1")).toBe("Budget range per year");
    expect(mapQuestionLabel("budget", "Range")).toBeNull();
    expect(mapQuestionLabel("timeline", "annualBudgetRangeV1")).toBeNull();
  });

  test("formats answers for readers without changing unknown values", () => {
    expect(formatMapAnswer("timeline", "targetStartDateV1", "2027-01-15")).toBe("January 15, 2027");
    expect(formatMapAnswer("timeline", "targetStartDateV1", "soon")).toBe("soon");
    expect(formatMapAnswer("timeline", "Target", "2027-01-15")).toBe("2027-01-15");
    expect(formatMapAnswer("budget", "budgetApprovedV1", false)).toBe("No");
    expect(formatMapAnswer("budget", "Limit", 0)).toBe("0");
    expect(formatMapAnswer("budget", "Notes", "")).toBe("Not provided");
  });

  test("orders guided answers first and keeps earlier answers in saved order", () => {
    const entries = orderedMapEntries("companyContext", { sector: "services", usStatesV1: "FL", industryV1: "Retail", zone: "East" });
    expect(entries.map(([key]) => key)).toEqual(["industryV1", "usStatesV1", "sector", "zone"]);
  });
});
