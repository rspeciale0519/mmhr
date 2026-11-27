import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { installMotionDoubles, observers } from "@/designs/cobalt/motion/test-helpers";

import { FollowTheMoney, STEP_MS } from "./FollowTheMoney";
import { flowStages } from "./money-flow";

afterEach(cleanup);

/** The seven stage buttons, in order. */
function stageButtons() {
  const list = screen.getByRole("list", { name: /seven stages/i });
  return within(list).getAllByRole("button");
}

/** The polite live region that screen readers announce. */
function liveText(container: HTMLElement) {
  return container.querySelector('[aria-live="polite"]')?.textContent ?? "";
}

/** The sample table as [rank, provider, fit] rows. */
function tableRows() {
  return within(screen.getByRole("table"))
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("cell").slice(0, 3).map((cell) => cell.textContent));
}

describe("Follow the money", () => {
  test("every stage is a real button with its title, and the first one is selected", () => {
    const { container } = render(<FollowTheMoney />);
    const buttons = stageButtons();
    expect(buttons).toHaveLength(flowStages.length);
    flowStages.forEach((stage, index) => expect(buttons[index]).toHaveTextContent(stage.title));
    expect(buttons[0]).toHaveAttribute("aria-current", "step");
    // Only the selected stage is in the Tab order; arrow keys reach the rest.
    expect(buttons.filter((button) => button.tabIndex === 0)).toEqual([buttons[0]]);
    expect(container.querySelector(".co-fm-money")).toHaveTextContent("none yet.");
  });

  test("Next and Previous step through and announce each stage", () => {
    const { container } = render(<FollowTheMoney />);
    expect(liveText(container)).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Next step" }));
    expect(stageButtons()[1]).toHaveAttribute("aria-current", "step");
    expect(liveText(container)).toContain("Step 2 of 7: Scoring.");
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    expect(stageButtons()[0]).toHaveAttribute("aria-current", "step");
    // Previous does nothing at the first stage.
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    expect(stageButtons()[0]).toHaveAttribute("aria-current", "step");
    expect(screen.getByRole("button", { name: "Previous" })).toHaveAttribute("aria-disabled", "true");
  });

  test("arrow keys, Home and End move the selection and the focus", () => {
    render(<FollowTheMoney />);
    const first = stageButtons()[0]!;
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowRight" });
    expect(stageButtons()[1]).toHaveFocus();
    fireEvent.keyDown(stageButtons()[1]!, { key: "End" });
    expect(stageButtons()[6]).toHaveFocus();
    expect(stageButtons()[6]).toHaveAttribute("aria-current", "step");
    fireEvent.keyDown(stageButtons()[6]!, { key: "ArrowUp" });
    expect(stageButtons()[5]).toHaveAttribute("aria-current", "step");
    fireEvent.keyDown(stageButtons()[5]!, { key: "Home" });
    expect(stageButtons()[0]).toHaveFocus();
  });

  test("clicking the fee stage shows that money moved only at the end", () => {
    const { container } = render(<FollowTheMoney />);
    fireEvent.click(stageButtons()[6]!);
    expect(container.querySelector(".co-fm-money")).toHaveTextContent("provider to MMHR. You paid nothing.");
    expect(liveText(container)).toContain("Step 7 of 7: Referral fee.");
    expect(screen.getByRole("button", { name: "Next step" })).toHaveAttribute("aria-disabled", "true");
  });

  test("raising a provider's fee leaves the sample ranking exactly the same", () => {
    const { container } = render(<FollowTheMoney />);
    expect(screen.getAllByText("Sample data").length).toBeGreaterThan(0);
    const before = tableRows();
    const toggle = screen.getByRole("button", { name: /Raise Provider D/ });
    expect(toggle).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(tableRows()).toEqual(before);
    expect(screen.getByText("Highest fee in the sample")).toBeInTheDocument();
    expect(liveText(container)).toContain("Provider D now pays the highest fee in this sample. It is still fourth");
  });
});

describe("Follow the money: play, preview and motion hooks", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test("Play the story steps on by itself and any manual step pauses it", () => {
    vi.useFakeTimers();
    const { container } = render(<FollowTheMoney />);
    fireEvent.click(screen.getByRole("button", { name: "Play the story" }));
    expect(screen.getByRole("button", { name: "Pause the story" })).toBeInTheDocument();
    expect(container.querySelector(".co-fm")).toHaveAttribute("data-playing");

    act(() => vi.advanceTimersByTime(STEP_MS));
    expect(stageButtons()[1]).toHaveAttribute("aria-current", "step");
    expect(liveText(container)).toContain("Step 2 of 7: Scoring.");
    act(() => vi.advanceTimersByTime(STEP_MS));
    expect(stageButtons()[2]).toHaveAttribute("aria-current", "step");

    // Previous is a manual step: the story pauses and stays put.
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    expect(screen.getByRole("button", { name: "Play the story" })).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(STEP_MS * 3));
    expect(stageButtons()[1]).toHaveAttribute("aria-current", "step");
  });

  test("the story stops at the referral fee, and Play then starts again from step 1", () => {
    vi.useFakeTimers();
    render(<FollowTheMoney />);
    fireEvent.click(stageButtons()[5]!);
    fireEvent.click(screen.getByRole("button", { name: "Play the story" }));
    act(() => vi.advanceTimersByTime(STEP_MS));
    expect(stageButtons()[6]).toHaveAttribute("aria-current", "step");
    expect(screen.getByRole("button", { name: "Play the story" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Play the story" }));
    expect(stageButtons()[0]).toHaveAttribute("aria-current", "step");
    expect(screen.getByRole("button", { name: "Pause the story" })).toBeInTheDocument();
  });

  test("off screen the story holds its place; particles run only on screen", () => {
    installMotionDoubles();
    vi.useFakeTimers();
    const { container } = render(<FollowTheMoney />);
    const stage = container.querySelector<HTMLElement>(".co-fm")!;
    const watcher = observers.find((observer) => observer.elements.includes(stage))!;
    expect(stage).not.toHaveAttribute("data-live");

    act(() => watcher.fire(stage, true));
    expect(stage).toHaveAttribute("data-live");
    act(() => watcher.fire(stage, false));
    expect(stage).not.toHaveAttribute("data-live");

    fireEvent.click(screen.getByRole("button", { name: "Play the story" }));
    act(() => vi.advanceTimersByTime(STEP_MS * 2));
    expect(stageButtons()[0]).toHaveAttribute("aria-current", "step");

    act(() => watcher.fire(stage, true));
    act(() => vi.advanceTimersByTime(STEP_MS));
    expect(stageButtons()[1]).toHaveAttribute("aria-current", "step");
  });

  test("hovering a stage previews it and lights its lines without selecting it", () => {
    const { container } = render(<FollowTheMoney />);
    const third = stageButtons()[2]!;
    fireEvent.pointerEnter(third, { pointerType: "mouse" });

    expect(screen.getByRole("heading", { level: 3, name: "Ranked, names masked" })).toBeInTheDocument();
    expect(screen.getByText("Preview")).toBeInTheDocument();
    expect(third).toHaveAttribute("data-shown");
    expect(stageButtons()[0]).toHaveAttribute("aria-current", "step");
    // The lines into and out of stage 3 glow; the others do not.
    const hot = [...container.querySelectorAll(".co-fm-wire")].map((wire) => wire.hasAttribute("data-hot"));
    expect(hot).toEqual([false, true, true, false, false, false]);
    // A preview is not a change of step: nothing is announced.
    expect(liveText(container)).toBe("");

    fireEvent.pointerLeave(screen.getByRole("list", { name: /seven stages/i }), { pointerType: "mouse" });
    expect(screen.getByRole("heading", { level: 3, name: "Your needs list" })).toBeInTheDocument();
    expect(screen.queryByText("Preview")).toBeNull();
  });

  test("a touch does not preview; the light and depth stay off without a mouse", () => {
    const { container } = render(<FollowTheMoney />);
    fireEvent.pointerEnter(stageButtons()[3]!, { pointerType: "touch" });
    expect(screen.queryByText("Preview")).toBeNull();
    expect(container.querySelector(".co-fm")).not.toHaveAttribute("data-pointer");
  });
});
