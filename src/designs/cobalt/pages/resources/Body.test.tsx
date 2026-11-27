import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { ResourcesBody } from "./Body";
import { checklistSteps, glossaryTerms } from "./content";

afterEach(cleanup);

describe("/resources", () => {
  test("never links to a page below /resources (those stay blocked)", () => {
    const { container } = render(<ResourcesBody />);
    const hrefs = [...container.querySelectorAll("a")].map((link) => link.getAttribute("href") ?? "");
    expect(hrefs.filter((href) => href.startsWith("/resources/"))).toEqual([]);
  });

  test("shows a checklist of eight to twelve steps", () => {
    render(<ResourcesBody />);
    expect(checklistSteps.length).toBeGreaterThanOrEqual(8);
    expect(checklistSteps.length).toBeLessThanOrEqual(12);
    for (const step of checklistSteps) {
      expect(screen.getByRole("heading", { level: 3, name: step.title })).toBeInTheDocument();
      expect(screen.getByText(step.body)).toBeVisible();
    }
  });

  test("defines eight to twelve terms and describes exactly those as a DefinedTermSet", () => {
    const { container } = render(<ResourcesBody />);
    expect(glossaryTerms.length).toBeGreaterThanOrEqual(8);
    expect(glossaryTerms.length).toBeLessThanOrEqual(12);
    for (const entry of glossaryTerms) expect(screen.getByText(entry.definition)).toBeVisible();

    const data = [...container.querySelectorAll('script[type="application/ld+json"]')]
      .map((script) => JSON.parse(script.textContent ?? ""))
      .find((item) => item["@type"] === "DefinedTermSet");
    expect(data.hasDefinedTerm).toEqual(
      glossaryTerms.map((entry) => ({
        "@type": "DefinedTerm",
        name: entry.term,
        description: entry.definition,
        ...(entry.expansion ? { alternateName: entry.expansion } : {}),
      })),
    );
  });

  test("publishes no statistics", () => {
    const { container } = render(<ResourcesBody />);
    expect(container.textContent ?? "").not.toMatch(/\d\s*%|percent/i);
  });
});
