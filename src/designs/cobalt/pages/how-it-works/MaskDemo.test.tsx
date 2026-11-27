import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { MaskDemo } from "./MaskDemo";

afterEach(cleanup);

/** The text a screen reader gets for each row (hidden layers left out). */
function readRows(container: HTMLElement) {
  return Array.from(container.querySelectorAll(".co-hiw-board li")).map((row) =>
    Array.from(row.querySelectorAll(".co-hiw-name > *, .co-hiw-score, .co-hiw-pick, .co-hiw-fee"))
      .filter((part) => part.getAttribute("aria-hidden") !== "true")
      .map((part) => part.textContent?.trim())
      // The pick cell is empty for a match that was not picked.
      .filter(Boolean)
      .join(" | "),
  );
}

const live = (container: HTMLElement) => container.querySelector("[aria-live='polite']")?.textContent;

describe("the masking demo", () => {
  test("starts masked, labelled as sample data, with the picks made on fit", () => {
    const { container } = render(<MaskDemo />);
    expect(screen.getByText("Sample data")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Masked" }).getAttribute("aria-pressed")).toBe("true");
    // Pick first: the sample buyer has picked while every name is masked.
    expect(readRows(container)).toEqual(["Masked | 93 | Pick", "Masked | 86 | Pick", "Masked | 78 | Pick", "Masked | 71"]);
    // The swap is offered in words, but there is nothing to swap before names show.
    expect(screen.getByText(/Swap it for another match/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Swap Provider/ })).toBeNull();
  });

  test("after the advisor review only the picks are named, in the same order with the same scores", () => {
    const { container } = render(<MaskDemo />);
    fireEvent.click(screen.getByRole("button", { name: "After advisor review" }));
    expect(screen.getByRole("button", { name: "After advisor review" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Masked" }).getAttribute("aria-pressed")).toBe("false");
    expect(readRows(container)).toEqual([
      "Provider A | 93 | Pick",
      "Provider B | 86 | Pick",
      "Provider C | 78 | Pick",
      // Not picked, so never named.
      "Masked | 71",
    ]);
    expect(live(container)).toContain("Names shown for your picks after the advisor review");
  });

  test("after the review a known pick can be swapped for the next match, and undone", () => {
    const { container } = render(<MaskDemo />);
    fireEvent.click(screen.getByRole("button", { name: "After advisor review" }));
    fireEvent.click(screen.getByRole("button", { name: "Swap Provider B" }));
    expect(readRows(container)).toEqual([
      "Provider A | 93 | Pick",
      "Provider B | 86 | Out",
      "Provider C | 78 | Pick",
      "Provider D | 71 | Pick",
    ]);
    expect(live(container)).toContain("The next match, Provider D, is now a pick");
    fireEvent.click(screen.getByRole("button", { name: "Undo swap" }));
    expect(readRows(container)[1]).toBe("Provider B | 86 | Pick");
    // Back to masked: no swap before names are shown.
    fireEvent.click(screen.getByRole("button", { name: "Swap Provider B" }));
    fireEvent.click(screen.getByRole("button", { name: "Masked" }));
    expect(readRows(container)).toEqual(["Masked | 93 | Pick", "Masked | 86 | Pick", "Masked | 78 | Pick", "Masked | 71"]);
  });

  test("showing referral fees changes no score and no order, and says why", () => {
    const { container } = render(<MaskDemo />);
    const toggle = screen.getByRole("button", { name: "Show referral fees" });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(readRows(container)).toEqual([
      "Masked | 93 | Pick | Pays MMHR a referral fee",
      "Masked | 86 | Pick | Pays MMHR a referral fee",
      "Masked | 78 | Pick | Pays MMHR a referral fee",
      "Masked | 71 | Pays MMHR a referral fee",
    ]);
    expect(live(container)).toBe("Referral fees shown. Referral fees are never an input to the score.");
    fireEvent.click(toggle);
    expect(live(container)).toBe("Referral fees hidden.");
  });
});
