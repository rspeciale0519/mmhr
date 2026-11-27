import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { flushFrames, installMotionDoubles, observers, setMedia } from "../../motion/test-helpers";
import { StepPicture } from "./StepPicture";

/** The provider tags the picture draws right now (sorted: drawing order is by depth). */
const tagNames = (container: HTMLElement) =>
  Array.from(container.querySelectorAll(".co-hiw-ptag"))
    .map((tag) => tag.firstChild?.textContent ?? "")
    .sort();

beforeEach(() => {
  installMotionDoubles();
  // Laid out (the phone layout shows it).
  vi.spyOn(Element.prototype, "getClientRects").mockReturnValue([{}] as unknown as DOMRectList);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("a step's own picture (phones)", () => {
  test("on screen at load: shows the settled step and offers Replay", () => {
    const { container } = render(<StepPicture index={3} n="04" />);
    expect(tagNames(container)).toEqual(["Provider A", "Provider B", "Provider C", "Provider D", "Provider E"]);
    expect(screen.getByRole("button", { name: "Replay the step 04 picture" })).toBeTruthy();
  });

  test("below the screen at load: rewinds to the step's start, then plays it on arrival", () => {
    const { container } = render(
      <div data-testid="below">
        <StepPicture index={3} n="04" />
      </div>,
    );
    // Step 04 (the advisor review) starts with the picks still masked.
    expect(tagNames(container).every((name) => name === "Masked")).toBe(true);
    const picture = container.querySelector(".co-hiw-step-pic")!;
    const watcher = observers.find((observer) => observer.elements.includes(picture));
    act(() => watcher!.fire(picture));
    // The film runs on animation frames; let it reach its end.
    act(() => flushFrames(performance.now() + 5000));
    act(() => flushFrames(performance.now() + 5000));
    expect(tagNames(container)).toEqual(["Provider A", "Provider B", "Provider C", "Provider D", "Provider E"]);
  });

  test("with less motion: the settled still, no rewind, no Replay", () => {
    setMedia({ reduce: true });
    const { container } = render(
      <div data-testid="below">
        <StepPicture index={3} n="04" />
      </div>,
    );
    expect(tagNames(container)).toContain("Provider A");
    expect(screen.queryByRole("button", { name: /Replay/ })).toBeNull();
  });
});
