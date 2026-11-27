import { describe, expect, test } from "vitest";

import { glossaryTerms } from "./content";
import { firstLetter, letters, matchesTerm, relatedTerms, splitMatches, termId } from "./glossary-filter";

describe("glossary filter", () => {
  test("matches the name, the expansion, or the definition, ignoring case", () => {
    const hris = glossaryTerms.find((entry) => entry.term === "HRIS")!;
    expect(matchesTerm(hris, "", null)).toBe(true);
    expect(matchesTerm(hris, "hris", null)).toBe(true);
    expect(matchesTerm(hris, "INFORMATION system", null)).toBe(true);
    expect(matchesTerm(hris, "time off", null)).toBe(true);
    expect(matchesTerm(hris, "recruiting", null)).toBe(false);
  });

  test("narrows to one first letter, together with the search", () => {
    const hTerms = glossaryTerms.filter((entry) => matchesTerm(entry, "", "H")).map((entry) => entry.term);
    expect(hTerms).toEqual(["HRIS", "HCM", "HRMS"]);
    expect(glossaryTerms.filter((entry) => matchesTerm(entry, "capital", "H")).map((entry) => entry.term)).toEqual(["HCM"]);
    expect(letters(glossaryTerms)).toEqual([...new Set(glossaryTerms.map((entry) => firstLetter(entry.term)))].sort());
  });

  test("splits text around matches without losing a character", () => {
    const parts = splitMatches("Payroll software automates payroll.", "payroll");
    expect(parts.map((part) => part.text).join("")).toBe("Payroll software automates payroll.");
    expect(parts.filter((part) => part.hit).map((part) => part.text)).toEqual(["Payroll", "payroll"]);
    expect(splitMatches("No match here", "")).toEqual([{ text: "No match here", hit: false }]);
  });

  test("links terms only through the glossary's own words", () => {
    const related = relatedTerms(glossaryTerms);
    expect(related.get("HRMS")).toEqual(expect.arrayContaining(["HRIS", "HCM", "Payroll"]));
    // Links go both ways and never point at the term itself.
    expect(related.get("HRIS")).toContain("HRMS");
    for (const [term, links] of related) expect(links).not.toContain(term);
  });

  test("gives every term a unique anchor id", () => {
    const ids = glossaryTerms.map((entry) => termId(entry.term));
    expect(new Set(ids).size).toBe(ids.length);
    expect(termId("Time and attendance")).toBe("term-time-and-attendance");
  });
});
