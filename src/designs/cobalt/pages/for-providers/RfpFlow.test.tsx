import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { RfpFlow } from "./RfpFlow";
import { FLOW_END_SECONDS, flowProviders } from "./rfp-flow";

/** Makes the page believe the device does (or does not) ask for less motion. */
function setReducedMotion(reduce: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: reduce && query.includes("reduce"),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

/** The text status of each provider, in list order. */
function listedStatuses() {
  const list = screen.getByRole("list");
  return within(list).getAllByRole("listitem").map((item) => item.querySelector(".co-fp-status-word")?.textContent);
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("RfpFlow", () => {
  test("is labelled an illustration and hides the 3D view from screen readers", () => {
    setReducedMotion(false);
    const { container } = render(<RfpFlow />);
    expect(screen.getByText("Illustration")).toBeVisible();
    expect(container.querySelector(".co-fp-stage")).toHaveAttribute("aria-hidden", "true");
  });

  test("shows the finished state as text before any replay", () => {
    setReducedMotion(false);
    render(<RfpFlow />);
    expect(listedStatuses()).toEqual(flowProviders.map(() => "Answered"));
    expect(screen.getByRole("status")).toHaveTextContent(`${flowProviders.length} of ${flowProviders.length}`);
  });

  test("Replay starts from Not sent and moves every provider through to Answered", () => {
    setReducedMotion(false);
    vi.useFakeTimers();
    render(<RfpFlow />);

    fireEvent.click(screen.getByRole("button", { name: "Replay" }));
    expect(listedStatuses()).toEqual(flowProviders.map(() => "Not sent"));

    // Part way through: the first provider has its RFP, the list says so.
    act(() => {
      vi.advanceTimersByTime(flowProviders[0].sentAt * 1000);
    });
    expect(listedStatuses()[0]).toBe("Sent");

    act(() => {
      vi.advanceTimersByTime(FLOW_END_SECONDS * 1000);
    });
    expect(listedStatuses()).toEqual(flowProviders.map(() => "Answered"));
  });

  test("with reduced motion shows the finished state and offers no replay", () => {
    setReducedMotion(true);
    render(<RfpFlow />);
    expect(listedStatuses()).toEqual(flowProviders.map(() => "Answered"));
    expect(screen.queryByRole("button", { name: "Replay" })).toBeNull();
  });
});
