import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { installMotionDoubles, observers, setMedia } from "../motion/test-helpers";
import { SixSteps } from "./SixSteps";
import { sixSteps } from "./sample-ranking";

beforeEach(installMotionDoubles);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const stepButton = (title: string) => screen.getByRole("button", { name: title });
const current = () => document.querySelector('[aria-current="step"]')?.textContent;
const runningBar = () => document.querySelector(".co-step-run");

/** Pretends the stepper scrolled into view (the useInView observer fires). */
function scrollIntoView(root: Element) {
  const observer = observers.find((item) => item.elements.includes(root));
  act(() => observer?.fire(root));
}

/**
 * Pretends the timer bar's CSS animation finished. jsdom has no
 * AnimationEvent, so React listens for the prefixed name there; fire both
 * (the stepper ignores a second end for a step that already moved on).
 */
function finishTimer(bar: Element) {
  fireEvent.animationEnd(bar);
  fireEvent(bar, new Event("webkitAnimationEnd", { bubbles: true }));
}

function renderSteps() {
  const result = render(<SixSteps steps={sixSteps} />);
  return { ...result, root: result.container.querySelector(".co-steps")! };
}

test("shows all six steps in the HTML, the first one selected", () => {
  renderSteps();
  for (const step of sixSteps) {
    expect(stepButton(step.title)).toBeInTheDocument();
    expect(screen.getAllByText(step.body).length).toBeGreaterThan(0);
  }
  expect(current()).toBe("Share your needs");
  expect(screen.getByText("Step 01 of 06")).toBeInTheDocument();
});

test("selecting a step marks it current and shows its detail", () => {
  renderSteps();
  fireEvent.click(stepButton("Advisor review"));
  expect(current()).toBe("Advisor review");
  expect(stepButton("Share your needs")).not.toHaveAttribute("aria-current");
  expect(screen.getByText("Step 03 of 06")).toBeInTheDocument();
  expect(screen.getByText("Then: Pick up to five")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Next step" }));
  expect(current()).toBe("Pick up to five");
});

test("arrow keys move the selection and the focus", () => {
  renderSteps();
  const first = stepButton("Share your needs");
  first.focus();
  fireEvent.keyDown(first, { key: "ArrowRight" });
  expect(current()).toBe("Compare masked");
  expect(document.activeElement).toBe(stepButton("Compare masked"));
  fireEvent.keyDown(document.activeElement!, { key: "End" });
  expect(current()).toBe("Sign direct");
});

test("plays on its own while in view, then stops for good once the visitor chooses", () => {
  const { root } = renderSteps();
  // Off screen: nothing plays.
  expect(runningBar()).toBeNull();
  scrollIntoView(root);
  expect(runningBar()).not.toBeNull();
  // The timer bar filled up: the next step comes.
  finishTimer(runningBar()!);
  expect(current()).toBe("Compare masked");
  // The visitor takes over: no more timer.
  fireEvent.click(stepButton("Sign direct"));
  expect(runningBar()).toBeNull();
  expect(current()).toBe("Sign direct");
});

test("pauses while the mouse is over it or focus is inside", () => {
  const { root } = renderSteps();
  scrollIntoView(root);
  expect(root).not.toHaveAttribute("data-paused");
  fireEvent.pointerOver(root, { pointerType: "mouse" });
  expect(root).toHaveAttribute("data-paused");
  fireEvent.pointerOut(root, { pointerType: "mouse" });
  expect(root).not.toHaveAttribute("data-paused");
  fireEvent.focus(stepButton("Advisor review"));
  expect(root).toHaveAttribute("data-paused");
  // Focus alone does not choose a step, so it still waits to play on.
  expect(runningBar()).not.toBeNull();
});

test("never plays on its own with reduced motion", () => {
  setMedia({ reduce: true });
  const { root } = renderSteps();
  scrollIntoView(root);
  expect(runningBar()).toBeNull();
  expect(current()).toBe("Share your needs");
});
