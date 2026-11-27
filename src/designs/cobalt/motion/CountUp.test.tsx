import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { CountUp } from "./CountUp";
import { flushFrames, installMotionDoubles, observers, setMedia } from "./test-helpers";

beforeEach(installMotionDoubles);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const number = (testId: string) => screen.getByTestId(testId).querySelector(".co-count-n")?.textContent;

test("renders the real value, and reserves its width with the final text", () => {
  render(
    <p data-testid="top">
      <CountUp value={1200} prefix="$" suffix="/mo" />
    </p>,
  );
  expect(number("top")).toBe("$1,200/mo");
  expect(screen.getByTestId("top").querySelector(".co-count")).toHaveAttribute("data-co-final", "$1,200/mo");
  // Already on screen: nothing is reset, nothing is watched.
  expect(observers).toEqual([]);
});

test("a number below the screen starts at `from` and counts to its value when it arrives", () => {
  vi.spyOn(performance, "now").mockReturnValue(0);
  render(
    <p data-testid="below">
      <CountUp value={5} from={1} duration={1000} />
    </p>,
  );
  const count = screen.getByTestId("below").querySelector(".co-count")!;
  expect(number("below")).toBe("1");
  expect(count).toHaveAttribute("data-co-count", "wait");

  observers[0]!.fire(count);
  expect(count).toHaveAttribute("data-co-count", "run");
  flushFrames(500);
  const halfway = Number(number("below"));
  expect(halfway).toBeGreaterThan(1);
  expect(halfway).toBeLessThanOrEqual(5);
  flushFrames(1000);
  expect(number("below")).toBe("5");
  expect(count).toHaveAttribute("data-co-count", "done");
});

test("shows the real value again if it unmounts mid-count", () => {
  const { unmount } = render(
    <p data-testid="below">
      <CountUp value={12} decimals={1} />
    </p>,
  );
  const node = screen.getByTestId("below").querySelector(".co-count-n")!;
  expect(node.textContent).toBe("0.0");
  unmount();
  expect(node.textContent).toBe("12.0");
});

test("never counts with reduced motion", () => {
  setMedia({ reduce: true });
  render(
    <p data-testid="below">
      <CountUp value={5} />
    </p>,
  );
  expect(number("below")).toBe("5");
  expect(observers).toEqual([]);
});
