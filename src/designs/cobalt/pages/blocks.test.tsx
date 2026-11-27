import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { VENDORS } from "../../_content";
import { CtaBand } from "./CtaBand";
import { JsonLd, serializeJsonLd } from "./JsonLd";
import { PageHero } from "./PageHero";
import { PageSection } from "./PageSection";
import { QuestionsAndAnswers } from "./QuestionsAndAnswers";
import { ForProvidersBody } from "./for-providers/Body";
import { HowItWorksBody } from "./how-it-works/Body";
import { ResourcesBody } from "./resources/Body";
import { WhyItsFreeBody } from "./why-its-free/Body";

afterEach(cleanup);

describe("JSON-LD", () => {
  test("escapes characters that could end the script tag, and keeps the data", () => {
    const data = { name: "</script><script>alert(1)</script>", note: "A & B > C", line: "a\u2028b" };
    const text = serializeJsonLd(data);
    expect(text).not.toMatch(/[<>&\u2028]/);
    expect(text).toContain("\\u003c/script\\u003e");
    expect(JSON.parse(text)).toEqual(data);
  });

  test("renders one data script that the page does not run", () => {
    const { container } = render(<JsonLd data={{ "@type": "Thing", name: "</script>" }} />);
    const scripts = container.querySelectorAll("script");
    expect(scripts).toHaveLength(1);
    expect(scripts[0]).toHaveAttribute("type", "application/ld+json");
    expect(scripts[0]!.innerHTML).not.toContain("</script>");
    expect(JSON.parse(scripts[0]!.textContent ?? "")).toEqual({ "@type": "Thing", name: "</script>" });
  });
});

describe("QuestionsAndAnswers", () => {
  const items = [
    { question: "Do customers pay MMHR?", answer: "No. Customers never pay MMHR." },
    { question: "Does the referral fee change rank?", answer: "No. It is never an input to rank." },
  ];

  test("lists every question as an expandable row, keeps every answer in the page, and describes the same text as an FAQPage", () => {
    const { container } = render(<QuestionsAndAnswers items={items} />);
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(items.map((i) => i.question));
    const buttons = items.map((item) => screen.getByRole("button", { name: item.question }));
    // The first row starts open; the others open on click.
    expect(buttons.map((button) => button.getAttribute("aria-expanded"))).toEqual(["true", "false"]);
    expect(screen.getByText(items[0]!.answer)).toBeVisible();
    // A closed answer is still in the HTML (search engines, find-in-page).
    expect(container.textContent).toContain(items[1]!.answer);
    fireEvent.click(buttons[1]!);
    expect(screen.getByText(items[1]!.answer)).toBeVisible();

    const data = JSON.parse(container.querySelector('script[type="application/ld+json"]')?.textContent ?? "");
    expect(data).toEqual({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: items.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: { "@type": "Answer", text: item.answer },
      })),
    });
  });
});

describe("page blocks", () => {
  test("PageHero renders one h1, the lede, and optional actions", () => {
    render(<PageHero title="A title" lede="A lede." actions={<a href="/sign-up">Go</a>} />);
    expect(screen.getAllByRole("heading", { level: 1 }).map((h) => h.textContent)).toEqual(["A title"]);
    // The h1 rises word by word on first paint; lede and actions follow.
    const h1 = screen.getByRole("heading", { level: 1, name: "A title" });
    expect(h1).toHaveAttribute("data-co-split", "load");
    expect(h1.querySelectorAll(".co-split-w")).toHaveLength(2);
    expect(screen.getByText("A lede.")).toHaveClass("co-enter");
    expect(screen.getByText("A lede.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go" })).toBeInTheDocument();
  });

  test("PageSection is a labelled region with a stable anchor", () => {
    render(<PageSection id="masking" title="Names stay masked" intro="Until review."><p>Body</p></PageSection>);
    const region = screen.getByRole("region", { name: "Names stay masked" });
    expect(region).toHaveAttribute("id", "masking");
    expect(screen.getByRole("heading", { level: 2, name: "Names stay masked" })).toHaveAttribute("id", "masking-title");
    // The heading and intro play in on scroll (reveal engine, every browser).
    expect(screen.getByRole("heading", { level: 2, name: "Names stay masked" })).toHaveAttribute("data-co-variant", "split");
    expect(screen.getByText("Until review.")).toHaveAttribute("data-co-reveal");
  });

  test("CtaBand defaults to the buyer sign-up and accepts another action", () => {
    const { rerender } = render(<CtaBand title="Start." body="Free for buyers." />);
    expect(screen.getByRole("link", { name: "Start your needs list" })).toHaveAttribute("href", "/sign-up");
    rerender(<CtaBand title="Talk." body="Ask us." action={{ href: "/contact", label: "Contact MMHR" }} />);
    expect(screen.getByRole("link", { name: "Contact MMHR" })).toHaveAttribute("href", "/contact");
    expect(screen.getByRole("link", { name: "Contact MMHR" }).parentElement).toHaveClass("co-mag");
    expect(screen.getByRole("heading", { level: 2, name: "Talk." })).toHaveAttribute("data-co-variant", "split");
  });
});

describe("menu page bodies", () => {
  test.each([
    ["how-it-works", HowItWorksBody],
    ["why-its-free", WhyItsFreeBody],
    ["for-providers", ForProvidersBody],
    ["resources", ResourcesBody],
  ] as const)("%s has exactly one h1 and names no vendor", (_slug, Body) => {
    const { container } = render(<Body />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    const text = container.textContent ?? "";
    expect(VENDORS.filter((vendor) => text.includes(vendor))).toEqual([]);
  });
});
