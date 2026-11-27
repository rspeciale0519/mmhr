import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { sixSteps } from "../../landing/sample-ranking";
import { HowItWorksBody } from "./Body";
import { buyerQuestions, journeySteps } from "./journey";

afterEach(cleanup);

/** Every JSON-LD block on the rendered page, parsed. */
function structuredData(container: HTMLElement) {
  return Array.from(container.querySelectorAll('script[type="application/ld+json"]')).map((script) =>
    JSON.parse(script.textContent ?? ""),
  );
}

describe("/how-it-works", () => {
  test("explains all six steps, in the home page order, with what you do, what MMHR does, and what you get", () => {
    render(<HowItWorksBody />);
    const list = screen.getByRole("region", { name: /Six steps/ }).querySelector("ol");
    expect(list).not.toBeNull();
    const items = within(list!).getAllByRole("listitem");
    expect(items.map((item) => within(item).getByRole("heading", { level: 3 }).textContent)).toEqual(
      sixSteps.map((step) => step.title),
    );
    for (const item of items) {
      expect(within(item).getAllByRole("term").map((term) => term.textContent)).toEqual(["You", "MMHR", "You get"]);
    }
  });

  test("has the sections buyers look for, with stable anchors", () => {
    render(<HowItWorksBody />);
    for (const id of ["steps", "masking", "advisor-review", "after-the-rfp", "questions"]) {
      expect(document.getElementById(id)).not.toBeNull();
    }
    const headings = screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent);
    expect(headings.at(-1)).toBe("Start with your needs list.");
  });

  test("states the payment roles and the masking rule", () => {
    const { container } = render(<HowItWorksBody />);
    const text = container.textContent ?? "";
    expect(text).toContain("Customers never pay MMHR");
    expect(text).toContain("Providers pay MMHR a referral fee");
    expect(text).toContain("never an input to the ranking");
    // Pick first: names come after picking, at the advisor review, and only for the picks.
    expect(text).toContain("You pick up to five contenders while the names are still masked");
    expect(text).toContain("you see the names of the providers you picked. Matches you did not pick stay masked.");
    expect(text).toContain("Swap it for another match.");
    expect(text).toContain("Your contract is with the provider, not with MMHR");
  });

  test("labels the pictures as an illustration and makes no number claims", () => {
    const { container } = render(<HowItWorksBody />);
    expect(screen.getAllByText("Illustration").length).toBeGreaterThan(0);
    // The pictures are decoration; screen readers get the step text.
    for (const still of container.querySelectorAll(".co-hiw-still")) {
      expect(still.closest('[aria-hidden="true"]')).not.toBeNull();
    }
    const words = [
      ...journeySteps.flatMap((step) => [step.you, step.mmhr, step.get]),
      ...buyerQuestions.flatMap((item) => [item.question, item.answer]),
    ].join(" ");
    expect(words).not.toMatch(/\d+\s*%|\d{2,}/);
  });

  test("publishes FAQ and HowTo data that match the visible text", () => {
    const { container } = render(<HowItWorksBody />);
    const data = structuredData(container);
    const faq = data.find((item) => item["@type"] === "FAQPage");
    expect(faq.mainEntity.map((entry: { name: string }) => entry.name)).toEqual(buyerQuestions.map((item) => item.question));
    expect(buyerQuestions.length).toBeGreaterThanOrEqual(5);
    expect(buyerQuestions.length).toBeLessThanOrEqual(7);

    const howTo = data.find((item) => item["@type"] === "HowTo");
    expect(howTo.step).toHaveLength(6);
    for (const step of howTo.step) {
      expect(container.textContent).toContain(step.name);
      expect(container.textContent).toContain(step.text);
    }
    // The HowTo order is pick first: picking (step 3) before the advisor review (step 4).
    expect(howTo.step.map((step: { name: string }) => step.name)).toEqual([
      "Share your needs",
      "Compare masked",
      "Pick up to five",
      "Advisor review",
      "One approved RFP",
      "Sign direct",
    ]);
  });
});
