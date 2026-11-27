import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { setMedia } from "@/designs/cobalt/motion/test-helpers";

import { ScoreInputs, scoreInputs } from "./ScoreInputs";

// jsdom has no Element.animate; one test puts in a stand-in, restored here.
const originalAnimate = Element.prototype.animate;

afterEach(() => {
  cleanup();
  Element.prototype.animate = originalAnimate;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** The sample ranking as visible text, top to bottom. */
function rankingOrder() {
  return within(screen.getByRole("list", { name: "Sample ranking" }))
    .getAllByRole("listitem")
    .map((row) => row.textContent);
}

const live = (container: HTMLElement) => container.querySelector('[aria-live="polite"]');

describe("Try an input", () => {
  test("offers three inputs as buttons, labelled as an illustration", () => {
    render(<ScoreInputs />);
    const inputs = within(screen.getByRole("list", { name: "Inputs to try" })).getAllByRole("button");
    expect(inputs.map((button) => button.textContent)).toEqual([
      "Your needs listInput",
      "Referral feeNot an input",
      "Who pays, and how muchNot an input",
    ]);
    expect(screen.getByText("Illustration")).toBeInTheDocument();
    expect(rankingOrder()[0]).toContain("Provider A");
  });

  test("a fee input is blocked: the ranking stays exactly the same and the try is counted", () => {
    const { container } = render(<ScoreInputs />);
    const before = rankingOrder();
    fireEvent.click(screen.getByRole("button", { name: /Referral fee/ }));
    fireEvent.click(screen.getByRole("button", { name: /Who pays, and how much/ }));

    expect(rankingOrder()).toEqual(before);
    expect(live(container)).toHaveTextContent("Who pays MMHR, and how much, never changes your results.");
    expect(container.querySelector(".co-si-count")).toHaveTextContent("Blocked tries: 2");
    expect(container.querySelector(".co-si-count")).toHaveTextContent("Ranking moved: 0");
  });

  test("the needs list is the one input scoring takes", () => {
    const { container } = render(<ScoreInputs />);
    fireEvent.click(screen.getByRole("button", { name: /Your needs list/ }));
    expect(live(container)).toHaveTextContent("Scoring has one input: your needs list.");
    expect(container.querySelector(".co-si-count")).toHaveTextContent("Blocked tries: 0");
  });

  test("a blocked try animates the locks; reduced motion keeps the result without the movement", () => {
    const animate = vi.fn();
    Element.prototype.animate = animate as unknown as Element["animate"];
    setMedia({ reduce: false });
    const { unmount } = render(<ScoreInputs />);
    fireEvent.click(screen.getByRole("button", { name: /Referral fee/ }));
    // Token bounce + scoring lock + a lock pulse and a flash per ranking row.
    expect(animate.mock.calls.length).toBeGreaterThanOrEqual(2 + 4 * 2);
    unmount();

    animate.mockClear();
    setMedia({ reduce: true });
    const { container } = render(<ScoreInputs />);
    fireEvent.click(screen.getByRole("button", { name: /Referral fee/ }));
    expect(animate).not.toHaveBeenCalled();
    expect(live(container)).toHaveTextContent("not part of the calculation");
  });

  test("every sentence it shows is copy the page already makes", () => {
    for (const input of scoreInputs) expect(input.message).not.toMatch(/%|percent|\$|£|€/);
  });
});
