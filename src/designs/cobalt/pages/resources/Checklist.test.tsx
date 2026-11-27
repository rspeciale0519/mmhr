import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { Checklist, stepId } from "./Checklist";
import { CHECKLIST_KEY, resetChecklistMemory } from "./checklist-store";
import { checklistSteps } from "./content";

beforeEach(() => {
  window.localStorage.clear();
  resetChecklistMemory();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const total = checklistSteps.length;

describe("Checklist", () => {
  test("starts with every step unticked, each checkbox named by its step", () => {
    render(<Checklist steps={checklistSteps} />);
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes).toHaveLength(total);
    for (const box of boxes) expect(box).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: checklistSteps[0].title })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reset checklist" })).toBeDisabled();
  });

  test("ticking counts progress, announces it, and keeps it in this browser", async () => {
    const { container, unmount } = render(<Checklist steps={checklistSteps} />);
    fireEvent.click(screen.getByRole("checkbox", { name: checklistSteps[0].title }));
    fireEvent.click(screen.getByRole("checkbox", { name: checklistSteps[2].title }));
    expect(screen.getByRole("status")).toHaveTextContent(`2 of ${total} done`);
    // The visible number counts up to its new value.
    await waitFor(() => expect(container.querySelector(".co-res-count")).toHaveTextContent(`2 of ${total} done`));
    expect(container.querySelectorAll(".co-res-pips i[data-on]")).toHaveLength(2);
    expect(JSON.parse(window.localStorage.getItem(CHECKLIST_KEY) ?? "[]")).toEqual([
      stepId(checklistSteps[0].title),
      stepId(checklistSteps[2].title),
    ]);

    // A later visit restores the ticks, without announcing them.
    unmount();
    render(<Checklist steps={checklistSteps} />);
    expect(screen.getByRole("checkbox", { name: checklistSteps[0].title })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: checklistSteps[2].title })).toBeChecked();
    expect(screen.getByRole("status")).toHaveTextContent("");
  });

  test("reset clears every tick", () => {
    render(<Checklist steps={checklistSteps} />);
    fireEvent.click(screen.getByRole("checkbox", { name: checklistSteps[1].title }));
    fireEvent.click(screen.getByRole("button", { name: "Reset checklist" }));
    for (const box of screen.getAllByRole("checkbox")) expect(box).not.toBeChecked();
    expect(screen.getByRole("status")).toHaveTextContent(`0 of ${total} done`);
  });

  test("still works when the browser refuses storage", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    render(<Checklist steps={checklistSteps} />);
    const box = screen.getByRole("checkbox", { name: checklistSteps[3].title });
    fireEvent.click(box);
    expect(box).toBeChecked();
    expect(screen.getByRole("status")).toHaveTextContent(`1 of ${total} done`);
  });

  test("ignores stored ids that are not steps any more", () => {
    window.localStorage.setItem(CHECKLIST_KEY, JSON.stringify(["gone", stepId(checklistSteps[4].title)]));
    render(<Checklist steps={checklistSteps} />);
    expect(screen.getAllByRole("checkbox").filter((box) => (box as HTMLInputElement).checked)).toHaveLength(1);
  });
});
