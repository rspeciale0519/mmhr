import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

import { buildDots, MARKET_SIZE, remainingAt, storySteps } from "./designs/sift/model";
import { criteria, vendors } from "./kit/data";
import { validateNeeds } from "./kit/needs-form";
import { mergeClasses } from "./kit/parts-ui";
import { MAX_CONTENDERS, toggleContender } from "./kit/use-scorecard";
import { initialWeights, rankVendors, weightedFit, type Weights } from "./kit/weighted-fit";
import { findDesign, galleryDesigns, neighbors } from "./registry";

const root = path.resolve(__dirname, "../..");

describe("gallery registry", () => {
  test("lists unique, URL-safe designs with complete metadata and files", () => {
    const slugs = galleryDesigns.map((design) => design.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const design of galleryDesigns) {
      expect(design.slug).toMatch(/^[a-z][a-z0-9-]*$/);
      expect(design.name.length).toBeGreaterThan(0);
      expect(design.palette.length).toBeGreaterThanOrEqual(4);
      expect([1, 2, 3, 4]).toContain(design.round);
      for (const color of design.palette) expect(color.hex).toMatch(/^#[0-9A-F]{6}$/i);
      expect(existsSync(path.join(root, "src/gallery/designs", design.slug, "home.tsx"))).toBe(true);
      expect(existsSync(path.join(root, "src/gallery/designs", design.slug, "fonts.ts"))).toBe(true);
    }
  });

  test("finds designs and wraps neighbors at both ends", () => {
    const first = galleryDesigns[0]!;
    const last = galleryDesigns.at(-1)!;
    expect(findDesign(first.slug)).toBe(first);
    expect(findDesign("missing")).toBeUndefined();
    expect(neighbors(first.slug).previous).toBe(last);
    expect(neighbors(last.slug).next).toBe(first);
    expect(() => neighbors("missing")).toThrow("Unknown gallery design");
  });
});

describe("contender selection", () => {
  test("adds, refuses a sixth choice, and removes", () => {
    let state = { selected: [] as string[], message: "" };
    for (const id of ["a", "b", "c", "d", "e"]) state = toggleContender(state, id);
    expect(state.selected).toHaveLength(MAX_CONTENDERS);
    expect(state.message).toBe("Vendor E added. 5 of 5 chosen.");

    const refused = toggleContender(state, "f");
    expect(refused.selected).toEqual(state.selected);
    expect(refused.message).toBe("You can choose up to 5 contenders. Remove one to add Vendor F.");

    const removed = toggleContender(refused, "b", true);
    expect(removed.selected).toEqual(["a", "c", "d", "e"]);
    expect(removed.message).toBe("Quillfield HCM removed. 4 of 5 chosen.");
  });
});

describe("needs form validation", () => {
  const form = (values: Record<string, string | string[]>) => {
    const data = new FormData();
    for (const [key, value] of Object.entries(values)) {
      for (const item of Array.isArray(value) ? value : [value]) data.append(key, item);
    }
    return data;
  };

  test("reports every missing field in field order", () => {
    expect(Object.keys(validateNeeds(form({})))).toEqual(["company", "employees", "features", "email"]);
  });

  test("checks the employee range and email shape", () => {
    expect(validateNeeds(form({ company: "Acme", employees: "0", email: "a@b.co", features: "Payroll" }))).toEqual({
      employees: "Enter a whole number of employees from 1 to 100,000.",
    });
    expect(validateNeeds(form({ company: "Acme", employees: "100001", email: "nope", features: "Payroll" }))).toMatchObject({
      employees: expect.any(String),
      email: "Enter a work email address, like name@company.com.",
    });
  });

  test("accepts a complete answer", () => {
    expect(validateNeeds(form({ company: "Acme", employees: "240", email: "dana@acme.com", features: ["Payroll", "Hiring"] }))).toEqual({});
  });
});

describe("weighted fit", () => {
  test("starts from the criteria weights and ranks the strongest vendor first", () => {
    const fit = weightedFit(initialWeights());
    for (const value of Object.values(fit)) expect(value).toBeGreaterThanOrEqual(0);
    expect(rankVendors(fit)[0]).toBe("a");
    expect(rankVendors(fit)).toHaveLength(vendors.length);
  });

  test("counts unknown evidence as zero and scores everyone zero with no weights", () => {
    const onlyTime = Object.fromEntries(criteria.map((c) => [c.id, c.id === "time" ? 4 : 0])) as Weights;
    expect(weightedFit(onlyTime).c).toBe(0);
    expect(weightedFit(onlyTime).a).toBe(80);
    const none = Object.fromEntries(criteria.map((c) => [c.id, 0])) as Weights;
    expect(Object.values(weightedFit(none))).toEqual(vendors.map(() => 0));
    expect(rankVendors(weightedFit(none))).toEqual(vendors.map((vendor) => vendor.id));
  });

  test("re-ranks when one requirement dominates", () => {
    const launchOnly = Object.fromEntries(criteria.map((c) => [c.id, c.id === "launch" ? 4 : 0])) as Weights;
    expect(rankVendors(weightedFit(launchOnly))[0]).toBe("c");
  });
});

describe("sift story model", () => {
  test("filters the sample market down to the six vendors in every step", () => {
    const dots = buildDots();
    expect(dots).toHaveLength(MARKET_SIZE);
    storySteps.forEach((step, index) => expect(remainingAt(dots, index)).toBe(step.remaining));
    expect(dots.filter((dot) => dot.vendor).map((dot) => dot.vendor).sort()).toEqual(vendors.map((vendor) => vendor.id));
  });

  test("builds the same market every time, so server and client agree", () => {
    expect(buildDots()).toEqual(buildDots());
  });
});

describe("class map merge", () => {
  test("joins shared and design classes key by key", () => {
    expect(mergeClasses({ a: "page-a", b: "page-b" }, { b: "own-b", c: "own-c" })).toEqual({ a: "page-a", b: "page-b own-b", c: "own-c" });
  });
});
