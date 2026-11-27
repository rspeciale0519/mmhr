import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { ReplyPaths, replyPaths } from "./ReplyPaths";

afterEach(cleanup);

/** The step texts listed under the preview. */
function listedSteps() {
  return within(screen.getByRole("list")).getAllByRole("listitem").map((item) => item.textContent);
}

describe("ReplyPaths", () => {
  test("starts on the web form, labelled an illustration, with its steps in words", () => {
    const { container } = render(<ReplyPaths />);
    expect(screen.getByText("Illustration")).toBeVisible();
    expect(screen.getByRole("button", { name: "Web form link" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Email reply" })).toHaveAttribute("aria-pressed", "false");
    expect(listedSteps()).toEqual(replyPaths.form.steps.map((step) => step.text));
    // The drawing is decorative; the list says the same in words.
    expect(container.querySelector(".co-fp-win-in")).toHaveAttribute("aria-hidden", "true");
  });

  test("switching to email swaps the preview and the steps", () => {
    const { container } = render(<ReplyPaths />);
    fireEvent.click(screen.getByRole("button", { name: "Email reply" }));
    expect(screen.getByRole("button", { name: "Email reply" })).toHaveAttribute("aria-pressed", "true");
    expect(container.querySelector(".co-fp-win-in")).toHaveAttribute("data-kind", "email");
    expect(listedSteps()).toEqual(replyPaths.email.steps.map((step) => step.text));
  });

  test("publishes no fee amount, percentage, or range", () => {
    const { container } = render(<ReplyPaths />);
    fireEvent.click(screen.getByRole("button", { name: "Email reply" }));
    expect(container.textContent ?? "").not.toMatch(/\d\s*%|percent|\$\s*\d/i);
  });
});
