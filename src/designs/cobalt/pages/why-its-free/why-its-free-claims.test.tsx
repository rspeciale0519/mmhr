import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { WhyItsFreeBody } from "./Body";

afterEach(cleanup);

// Every source file of this page (copy lives in Body.tsx and money-flow.ts).
const folder = join(process.cwd(), "src/designs/cobalt/pages/why-its-free");
const sources = readdirSync(folder)
  .filter((name) => /\.(tsx?|css)$/.test(name) && !name.includes(".test."))
  .map((name) => ({ name, source: readFileSync(join(folder, name), "utf8") }));

// The same pattern as src/app/(marketing)/_site/public-commission-claims.test.ts.
const EQUAL_RATE_CLAIM =
  /same rate|identical commission|flat commission|flat rate|same commission|paid the same|same no matter|no commission on implementation/i;

describe("why-its-free claims", () => {
  test("no file makes an equal-rate or unsupported commission claim", () => {
    expect(sources.filter(({ source }) => EQUAL_RATE_CLAIM.test(source)).map(({ name }) => name)).toEqual([]);
  });

  test("the page states no fee amount, percentage or range", () => {
    const text = render(<WhyItsFreeBody />).container.textContent ?? "";
    expect(text).not.toMatch(/%|percent|\$|£|€|\bper cent\b/i);
  });

  test("states who pays, keeps fees out of ranking, and labels sample figures", () => {
    const text = render(<WhyItsFreeBody />).container.textContent ?? "";
    expect(text).toContain("Customers never pay MMHR");
    expect(text).toContain("Providers pay MMHR a referral fee");
    expect(text).toContain("never an input");
    expect(text).toContain("Sample data");
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getAllByRole("link", { name: "Start your needs list" }).length).toBeGreaterThan(0);
  });

  test("publishes one FAQPage with five to seven questions", () => {
    const { container } = render(<WhyItsFreeBody />);
    const scripts = [...container.querySelectorAll('script[type="application/ld+json"]')];
    const faqs = scripts.map((script) => JSON.parse(script.textContent ?? "")).filter((data) => data["@type"] === "FAQPage");
    expect(faqs).toHaveLength(1);
    expect(faqs[0].mainEntity.length).toBeGreaterThanOrEqual(5);
    expect(faqs[0].mainEntity.length).toBeLessThanOrEqual(7);
  });
});
