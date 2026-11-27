import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { HomeFacts } from "./HomeFacts";
import { ScrollReveal } from "./ScrollReveal";

/** The callback and observed elements of the one IntersectionObserver made. */
let observed: Element[] = [];
let notify: IntersectionObserverCallback = () => {};

class FakeObserver {
  constructor(callback: IntersectionObserverCallback) {
    notify = callback;
  }
  observe(element: Element) {
    observed.push(element);
  }
  unobserve(element: Element) {
    observed = observed.filter((item) => item !== element);
  }
  disconnect() {
    observed = [];
  }
}

/** Pretends the device does (true) or does not (false) ask for less motion. */
function setReducedMotion(reduce: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: reduce && query.includes("reduce") }));
}

/** Two blocks: one on screen (top 100px) and one far below it (top 5000px). */
function renderPage() {
  const result = render(
    <>
      <div data-co-reveal="" data-testid="above" />
      <div data-co-reveal="" data-testid="below" />
      <ScrollReveal />
    </>,
  );
  return result;
}

beforeEach(() => {
  observed = [];
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const top = this.dataset.testid === "below" ? 5000 : 100;
    return { top, bottom: top + 10, left: 0, right: 0, width: 0, height: 10, x: 0, y: top, toJSON: () => ({}) };
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("hides only blocks below the screen, then reveals each one as it arrives", () => {
  setReducedMotion(false);
  const { getByTestId } = renderPage();
  const above = getByTestId("above");
  const below = getByTestId("below");

  expect(above).toHaveAttribute("data-co-reveal", "");
  expect(below).toHaveAttribute("data-co-reveal", "wait");
  expect(observed).toEqual([below]);

  notify([{ target: below, isIntersecting: true } as unknown as IntersectionObserverEntry], {} as IntersectionObserver);
  expect(below).toHaveAttribute("data-co-reveal", "in");
  expect(observed).toEqual([]);
});

test("shows every block again when it unmounts, so none stays hidden", () => {
  setReducedMotion(false);
  const { getByTestId, unmount } = renderPage();
  const below = getByTestId("below");
  expect(below).toHaveAttribute("data-co-reveal", "wait");
  unmount();
  expect(below).toHaveAttribute("data-co-reveal", "");
});

test("reveals a waiting block as soon as something inside it gets keyboard focus", () => {
  setReducedMotion(false);
  render(
    <>
      <div data-co-reveal="" data-testid="below">
        <a href="/for-providers">Information for providers</a>
      </div>
      <ScrollReveal />
    </>,
  );
  const block = document.querySelector('[data-testid="below"]')!;
  expect(block).toHaveAttribute("data-co-reveal", "wait");
  (block.querySelector("a") as HTMLAnchorElement).focus();
  expect(block).toHaveAttribute("data-co-reveal", "in");
  expect(observed).toEqual([]);
});

test("does nothing for visitors who ask for reduced motion", () => {
  setReducedMotion(true);
  const { getByTestId } = renderPage();
  expect(getByTestId("below")).toHaveAttribute("data-co-reveal", "");
  expect(observed).toEqual([]);
});

test("the number strip reads each real value and rolls toward it", () => {
  const { container } = render(<HomeFacts />);
  const items = [...container.querySelectorAll("li")];
  expect(items.map((item) => item.querySelector("p")?.textContent?.split(" ")[0])).toEqual(["1", "5", "1", "0"]);
  // Each rolling column ends on the real value; 0 counts down from 9.
  const columns = [...container.querySelectorAll(".co-odo-col")];
  expect(columns.map((column) => column.lastElementChild?.textContent)).toEqual(["1", "5", "1", "0"]);
  expect(columns[3]?.firstElementChild?.textContent).toBe("9");
  expect(container.querySelector(".co-odo")).toHaveAttribute("aria-hidden", "true");
});
