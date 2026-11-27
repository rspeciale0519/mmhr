import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { StepStory } from "./StepStory";
import { journeySteps } from "./journey";

/** Pretends to be a wide screen (story on) or a phone (story off). */
function setScreen({ wide }: { wide: boolean }) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: wide && (query.includes("min-width: 761px") || query.includes("pointer: fine")),
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

let scrollTo: ReturnType<typeof vi.fn>;
beforeEach(() => {
  scrollTo = vi.fn();
  vi.stubGlobal("scrollTo", scrollTo);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("the step story's controls", () => {
  test("a wide screen gets a step rail with six steps plus previous and next", () => {
    setScreen({ wide: true });
    render(<StepStory steps={journeySteps} />);
    const rail = screen.getByRole("navigation", { name: "Story steps" });
    const steps = within(rail).getAllByRole("listitem");
    expect(steps).toHaveLength(6);
    // Each button is named by its number and title.
    expect(within(rail).getByRole("button", { name: "03 Advisor review" })).toBeTruthy();
    expect(within(rail).getByRole("button", { name: "Previous step" }).getAttribute("aria-disabled")).toBe("true");
    expect(within(rail).getByRole("button", { name: "Next step" }).getAttribute("aria-disabled")).toBe("false");
    // The first step is the current one.
    expect(within(rail).getByRole("button", { name: /^01/ }).getAttribute("aria-current")).toBe("step");
  });

  test("a step button scrolls the page smoothly (never hijacks the wheel) and says where it went", () => {
    setScreen({ wide: true });
    render(<StepStory steps={journeySteps} />);
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /^05/ }));
    });
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo.mock.calls[0][0]).toMatchObject({ behavior: "smooth" });
    expect(typeof scrollTo.mock.calls[0][0].top).toBe("number");
    const rail = screen.getByRole("navigation", { name: "Story steps" });
    expect(rail.querySelector("[aria-live='polite']")?.textContent).toBe("Step 05 of 06: One approved RFP");
  });

  test("next moves one step on; previous does nothing on the first step", () => {
    setScreen({ wide: true });
    render(<StepStory steps={journeySteps} />);
    fireEvent.click(screen.getByRole("button", { name: "Previous step" }));
    expect(scrollTo).not.toHaveBeenCalled();
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Next step" }));
    });
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Step 02 of 06: Compare masked", { selector: "p" })).toBeTruthy();
  });

  test("phones and the server HTML get no rail: each step keeps its own picture", () => {
    setScreen({ wide: false });
    const { container } = render(<StepStory steps={journeySteps} />);
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(container.querySelectorAll(".co-hiw-step-pic")).toHaveLength(6);
    // The stage repeats the text, so screen readers skip it.
    expect(container.querySelector(".co-hiw-stage")?.closest("[aria-hidden='true']")).not.toBeNull();
  });
});
