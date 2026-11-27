import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { RfpFlow } from "./RfpFlow";
import { FLOW_END_SECONDS, flowProviders, flowStages, statusAt } from "./rfp-flow";

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

  test("the stepper jumps to a stage, marks it current, and the list follows", () => {
    setReducedMotion(false);
    render(<RfpFlow />);
    const opened = screen.getByRole("button", { name: "Opened" });
    fireEvent.click(opened);
    expect(opened).toHaveAttribute("aria-current", "step");
    expect(listedStatuses()).toEqual(flowProviders.map((provider) => statusAt(provider, flowStages[1].at)));
    fireEvent.click(screen.getByRole("button", { name: "Answered" }));
    expect(listedStatuses()).toEqual(flowProviders.map(() => "Answered"));
    expect(opened).not.toHaveAttribute("aria-current");
  });

  test("pointing at a stage lights the providers that have reached it", () => {
    setReducedMotion(false);
    render(<RfpFlow />);
    fireEvent.click(screen.getByRole("button", { name: "Opened" }));
    fireEvent.pointerEnter(screen.getByRole("button", { name: "Answering" }));
    const rows = within(screen.getByRole("list")).getAllByRole("listitem");
    rows.forEach((row, index) => {
      const reached = statusAt(flowProviders[index], flowStages[1].at) === "Answering";
      expect(row).toHaveAttribute("data-lit", reached ? "on" : "off");
    });
    fireEvent.pointerLeave(screen.getByRole("button", { name: "Answering" }));
    for (const row of rows) expect(row).not.toHaveAttribute("data-lit");
  });

  test("Pause holds the timeline and Play carries on from there", () => {
    setReducedMotion(false);
    vi.useFakeTimers();
    render(<RfpFlow />);
    fireEvent.click(screen.getByRole("button", { name: "Replay" }));
    act(() => {
      vi.advanceTimersByTime(flowProviders[0].sentAt * 1000);
    });
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    const held = listedStatuses();
    act(() => {
      vi.advanceTimersByTime(FLOW_END_SECONDS * 1000);
    });
    expect(listedStatuses()).toEqual(held);

    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    act(() => {
      vi.advanceTimersByTime(FLOW_END_SECONDS * 1000);
    });
    expect(listedStatuses()).toEqual(flowProviders.map(() => "Answered"));
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
  });

  test("with reduced motion the stepper still jumps, with no Play or Pause", () => {
    setReducedMotion(true);
    render(<RfpFlow />);
    expect(screen.queryByRole("button", { name: "Pause" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Play" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Sent" }));
    expect(listedStatuses()).toEqual(flowProviders.map(() => "Sent"));
  });
});
