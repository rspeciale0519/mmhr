import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { SplitText } from "./SplitText";
import { installMotionDoubles, observed, observers } from "./test-helpers";

beforeEach(installMotionDoubles);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("keeps the sentence as real text, once, with its spaces, and one span per word", () => {
  render(<SplitText as="h1" text="Every HRIS,  ranked on fit." trigger="load" />);
  const heading = screen.getByRole("heading", { level: 1, name: "Every HRIS, ranked on fit." });
  expect(heading.textContent).toBe("Every HRIS,  ranked on fit.");
  const words = [...heading.querySelectorAll(".co-split-w")];
  expect(words.map((word) => word.textContent)).toEqual(["Every", "HRIS,", "ranked", "on", "fit."]);
  expect(words.map((word) => (word as HTMLElement).style.getPropertyValue("--w"))).toEqual(["0", "1", "2", "3", "4"]);
  // No duplicate hidden copy and no label override.
  expect(heading).not.toHaveAttribute("aria-label");
  expect(heading.querySelector("[aria-hidden]")).toBeNull();
});

test('"load" plays from CSS on first paint and never hides anything with script', () => {
  render(<SplitText as="h1" text="A title" trigger="load" delay={100} />);
  const heading = screen.getByRole("heading");
  expect(heading).toHaveAttribute("data-co-split", "load");
  expect(heading).not.toHaveAttribute("data-co-reveal");
  expect(heading.style.getPropertyValue("--co-delay")).toBe("100ms");
  expect(observers).toEqual([]);
});

test('"view" waits below the screen and plays when it arrives', () => {
  render(
    <div data-testid="below">
      <SplitText id="masking-title" text="Names stay masked" stagger={60} />
    </div>,
  );
  const heading = screen.getByRole("heading", { level: 2, name: "Names stay masked" });
  expect(heading).toHaveAttribute("id", "masking-title");
  expect(heading).toHaveAttribute("data-co-variant", "split");
  expect(heading).toHaveAttribute("data-co-reveal", "wait");
  expect(heading.style.getPropertyValue("--co-stagger")).toBe("60ms");
  observers[0]!.fire(heading);
  expect(heading).toHaveAttribute("data-co-reveal", "in");
  expect(observed()).toEqual([]);
});
