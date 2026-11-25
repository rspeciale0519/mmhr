import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { VENDORS } from "../../_content";
import { CobaltBody } from "./Body";
import { homeQuestions } from "./home-content";
import { HOME_DESCRIPTION, homeStructuredData } from "./home-structured-data";

afterEach(cleanup);

const homeText = () => render(<CobaltBody />).container.textContent ?? "";

/** Parses every JSON-LD script on the rendered page. */
const jsonLd = (container: HTMLElement) =>
  [...container.querySelectorAll('script[type="application/ld+json"]')].map((script) =>
    JSON.parse(script.textContent ?? ""),
  );

test("names no vendor", () => {
  const text = homeText();
  expect(VENDORS.filter((vendor) => text.includes(vendor))).toEqual([]);
});

test("keeps the sign-up call to action and the payment roles", () => {
  const { container } = render(<CobaltBody />);
  const start = container.querySelector('a[href="/sign-up"]');
  expect(start).not.toBeNull();
  expect(start?.textContent).toContain("Start your needs list");
  expect(container.textContent).toContain("Providers pay MMHR a referral fee");
  expect(container.textContent).toContain("Customers never pay MMHR");
  expect(container.textContent).toContain("Buyers never pay");
});

test("labels ranking figures as sample data", () => {
  const { container } = render(<CobaltBody />);
  expect(container.textContent).toContain("Sample data");
  expect(container.textContent).toContain("Every HRIS, ranked on fit.");
});

test("makes no equal-rate commission claim", () => {
  // Same pattern as src/app/(marketing)/_site/public-commission-claims.test.ts,
  // applied to the rendered text so copy kept in home-content.ts is covered too.
  expect(homeText()).not.toMatch(
    /same rate|identical commission|flat commission|flat rate|same commission|paid the same|same no matter|no commission on implementation/i,
  );
});

test("makes no invented figures: the only numbers are the service rules", () => {
  // Percentages, "x times faster", and counts of systems or customers are
  // not approved claims. Sample scores live in the labelled demo only.
  const { container } = render(<CobaltBody />);
  const outsideDemo = [...container.children]
    .filter((element) => !element.classList.contains("co-hero"))
    .map((element) => element.textContent ?? "")
    .join(" ");
  expect(outsideDemo).not.toMatch(/\d+\s*%|\d+x\b|\d{2,}\+|\b\d+ (systems|vendors|providers|customers|companies)\b/i);
});

describe("page structure", () => {
  test("has one h1 and links each topic to its own page", () => {
    render(<CobaltBody />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    for (const href of ["/how-it-works", "/why-its-free", "/for-providers"]) {
      expect(document.querySelector(`a[href="${href}"]`)).not.toBeNull();
    }
  });

  test("introduces who it's for, how it works, why it's free, providers, and questions", () => {
    render(<CobaltBody />);
    const regions = ["Built for the moment you choose an HRIS.", "Six steps. One RFP. A contract you sign yourself.",
      "Free for you. Never ranked by who pays.", "HRIS provider? You do not need an account.", "Common questions"];
    for (const name of regions) expect(screen.getByRole("region", { name })).toBeInTheDocument();
  });

  test("states that providers need no account to receive an RFP", () => {
    render(<CobaltBody />);
    const band = screen.getByRole("region", { name: "HRIS provider? You do not need an account." });
    expect(within(band).getByRole("link", { name: "Information for providers" })).toHaveAttribute("href", "/for-providers");
  });
});

describe("structured data", () => {
  test("describes the visible questions as an FAQPage", () => {
    const { container } = render(<CobaltBody />);
    const faq = jsonLd(container).find((data) => data["@type"] === "FAQPage");
    expect(faq.mainEntity.map((entry: { name: string }) => entry.name)).toEqual(homeQuestions.map((item) => item.question));
    expect(homeQuestions.length).toBeGreaterThanOrEqual(5);
    expect(homeQuestions.length).toBeLessThanOrEqual(7);
    for (const item of homeQuestions) expect(screen.getByText(item.answer)).toBeInTheDocument();
  });

  test("adds Organization and WebSite data on the page", () => {
    const { container } = render(<CobaltBody />);
    const graph = jsonLd(container).find((data) => data["@graph"]);
    expect(graph["@graph"].map((entry: { "@type": string }) => entry["@type"])).toEqual(["Organization", "WebSite"]);
  });

  test("uses the configured site address and leaves URLs out without one", () => {
    expect(homeStructuredData("MatchMaker HR", "https://example.com")).toEqual({
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "Organization",
          "@id": "https://example.com/#organization",
          url: "https://example.com/",
          name: "MatchMaker HR",
          description: HOME_DESCRIPTION,
        },
        {
          "@type": "WebSite",
          "@id": "https://example.com/#website",
          url: "https://example.com/",
          name: "MatchMaker HR",
          description: HOME_DESCRIPTION,
          publisher: { "@id": "https://example.com/#organization" },
        },
      ],
    });
    expect(JSON.stringify(homeStructuredData("MatchMaker HR"))).not.toMatch(/url|@id|publisher/);
  });
});
