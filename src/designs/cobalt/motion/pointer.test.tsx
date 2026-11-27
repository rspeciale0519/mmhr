import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { Magnetic, Spotlight, Tilt } from "./pointer";
import { flushFrames, installMotionDoubles, setMedia } from "./test-helpers";

// The doubles measure every element as 200 x 100 px at (0, 100).
beforeEach(installMotionDoubles);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** A mouse entering, then moving to (x, y) inside the 200 x 100 box. */
function hover(element: Element, x: number, y: number) {
  fireEvent.pointerEnter(element, { pointerType: "mouse", clientX: x, clientY: 100 + y });
  fireEvent.pointerMove(element, { pointerType: "mouse", clientX: x, clientY: 100 + y });
  flushFrames();
}

describe("Spotlight", () => {
  test("puts the light under the mouse and marks the surface as hovered", () => {
    render(<Spotlight className="co-gl co-card" data-testid="card">Text</Spotlight>);
    const card = screen.getByTestId("card");
    expect(card).toHaveClass("co-spot", "co-gl", "co-card");
    expect(card.querySelector(".co-spot-light")).toHaveAttribute("aria-hidden", "true");

    hover(card, 50, 20);
    expect(card).toHaveAttribute("data-co-hover");
    expect(card.style.getPropertyValue("--co-mx")).toBe("50.0px");
    expect(card.style.getPropertyValue("--co-my")).toBe("20.0px");

    fireEvent.pointerLeave(card, { pointerType: "mouse" });
    expect(card).not.toHaveAttribute("data-co-hover");
  });

  test("on touch, a press lights the spot under the finger instead", () => {
    render(<Spotlight data-testid="card">Text</Spotlight>);
    const card = screen.getByTestId("card");
    fireEvent.pointerEnter(card, { pointerType: "touch", clientX: 10, clientY: 110 });
    expect(card).not.toHaveAttribute("data-co-hover");
    fireEvent.pointerDown(card, { pointerType: "touch", clientX: 10, clientY: 110 });
    expect(card).toHaveAttribute("data-co-press");
    expect(card.style.getPropertyValue("--co-mx")).toBe("10.0px");
    fireEvent.pointerUp(card, { pointerType: "touch" });
    expect(card).not.toHaveAttribute("data-co-press");
  });

  test("does nothing on a device without a fine pointer or with reduced motion", () => {
    setMedia({ fine: false });
    const { unmount } = render(<Spotlight data-testid="card">Text</Spotlight>);
    hover(screen.getByTestId("card"), 50, 20);
    expect(screen.getByTestId("card")).not.toHaveAttribute("data-co-hover");
    unmount();

    setMedia({ reduce: true });
    render(<Spotlight data-testid="card">Text</Spotlight>);
    hover(screen.getByTestId("card"), 50, 20);
    expect(screen.getByTestId("card").style.getPropertyValue("--co-mx")).toBe("");
  });
});

describe("Tilt", () => {
  test("tilts the inner layer toward the mouse and springs back on leave; the outer box never moves", () => {
    render(
      <Tilt data-testid="outer" innerClassName="co-gl co-card" max={6} spotlight>
        Card
      </Tilt>,
    );
    const outer = screen.getByTestId("outer");
    const inner = outer.firstElementChild as HTMLElement;
    expect(inner).toHaveClass("co-tilt-in", "co-spot", "co-gl", "co-card");

    // Top-right corner: tilts back (rx +6) and to the right (ry +6).
    hover(outer, 200, 0);
    expect(inner.style.getPropertyValue("--co-rx")).toBe("6.00deg");
    expect(inner.style.getPropertyValue("--co-ry")).toBe("6.00deg");
    expect(inner.style.getPropertyValue("--co-mx")).toBe("200.0px");
    expect(outer.style.cssText).toBe("");

    fireEvent.pointerLeave(outer, { pointerType: "mouse" });
    expect(inner.style.getPropertyValue("--co-rx")).toBe("0deg");
    expect(inner.style.getPropertyValue("--co-ry")).toBe("0deg");
  });
});

describe("Magnetic", () => {
  test("leans the child toward the mouse, never further than max, and back on leave", () => {
    render(
      <Magnetic max={8} strength={0.3}>
        <a className="co-btn co-btn-p" href="/sign-up">Start free</a>
      </Magnetic>,
    );
    const wrapper = screen.getByRole("link").parentElement!;
    expect(wrapper).toHaveClass("co-mag");

    // 30px right of center x 0.3 = 9px, clamped to 8px; 10px above center = -3px.
    hover(wrapper, 130, 40);
    expect(wrapper.style.getPropertyValue("--co-mag-x")).toBe("8.0px");
    expect(wrapper.style.getPropertyValue("--co-mag-y")).toBe("-3.0px");

    fireEvent.pointerLeave(wrapper, { pointerType: "mouse" });
    expect(wrapper.style.getPropertyValue("--co-mag-x")).toBe("0px");
  });
});
