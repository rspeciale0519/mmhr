import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { Reveal, RevealAll, RevealGroup } from "./Reveal";
import { installMotionDoubles, observed, observers, setMedia } from "./test-helpers";

beforeEach(installMotionDoubles);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Reveal", () => {
  test("leaves an element that is already on screen exactly as the server drew it", () => {
    render(<Reveal data-testid="top">Visible</Reveal>);
    const element = screen.getByTestId("top");
    expect(element).toHaveAttribute("data-co-reveal", "");
    expect(element).toHaveAttribute("data-co-variant", "rise");
    expect(observed()).toEqual([]);
  });

  test("hides an element below the screen, then plays it in once it arrives", () => {
    render(
      <Reveal data-testid="below" variant="scale" index={2} delay={120} as="li">
        Later
      </Reveal>,
    );
    const element = screen.getByTestId("below");
    expect(element.tagName).toBe("LI");
    expect(element).toHaveAttribute("data-co-reveal", "wait");
    expect(element).toHaveAttribute("data-co-variant", "scale");
    expect(element.style.getPropertyValue("--i")).toBe("2");
    expect(element.style.getPropertyValue("--co-delay")).toBe("120ms");

    observers[0]!.fire(element);
    expect(element).toHaveAttribute("data-co-reveal", "in");
    expect(observed()).toEqual([]);
  });

  test("shows a waiting element at once when keyboard focus lands inside it", () => {
    render(
      <Reveal data-testid="below">
        <a href="/x">Link</a>
      </Reveal>,
    );
    screen.getByRole("link").focus();
    expect(screen.getByTestId("below")).toHaveAttribute("data-co-reveal", "in");
  });

  test("shows the element again on unmount, so nothing stays hidden", () => {
    const { unmount } = render(<Reveal data-testid="below">Later</Reveal>);
    const element = screen.getByTestId("below");
    unmount();
    expect(element).toHaveAttribute("data-co-reveal", "");
  });

  test("hides nothing for visitors who ask for reduced motion", () => {
    setMedia({ reduce: true });
    render(<Reveal data-testid="below">Later</Reveal>);
    expect(screen.getByTestId("below")).toHaveAttribute("data-co-reveal", "");
    expect(observers).toEqual([]);
  });

  test("hides nothing in a browser without IntersectionObserver", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    render(<Reveal data-testid="below">Later</Reveal>);
    expect(screen.getByTestId("below")).toHaveAttribute("data-co-reveal", "");
  });
});

describe("RevealGroup", () => {
  test("is one watched wrapper whose children stagger, with the step it was given", () => {
    render(
      <RevealGroup as="ul" data-testid="below-group" stagger={90}>
        <li>One</li>
        <li>Two</li>
      </RevealGroup>,
    );
    const group = screen.getByTestId("below-group");
    expect(group).toHaveAttribute("data-co-variant", "group");
    expect(group).toHaveAttribute("data-co-reveal", "wait");
    expect(group.style.getPropertyValue("--co-stagger")).toBe("90ms");
    expect(observed()).toEqual([group]);
  });
});

describe("RevealAll", () => {
  test("watches every data-co-reveal element in the page and skips ones a Reveal owns", () => {
    render(
      <>
        <div data-co-reveal="" data-testid="below-a" />
        <div data-co-reveal="" data-co-variant="fade" data-testid="below-b" />
        <div data-co-reveal="" data-testid="top" />
        <Reveal data-testid="below-owned">Owned</Reveal>
        <RevealAll />
      </>,
    );
    expect(screen.getByTestId("below-a")).toHaveAttribute("data-co-reveal", "wait");
    expect(screen.getByTestId("below-b")).toHaveAttribute("data-co-reveal", "wait");
    expect(screen.getByTestId("top")).toHaveAttribute("data-co-reveal", "");
    // Each element is observed once, even though two components saw the owned one.
    expect(observed()).toHaveLength(3);
  });
});
