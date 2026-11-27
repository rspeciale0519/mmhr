import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { MaskDemo } from "./MaskDemo";

afterEach(cleanup);

/** The text a screen reader gets for each row (hidden layers left out). */
function readRows(container: HTMLElement) {
  return Array.from(container.querySelectorAll(".co-hiw-board li")).map((row) =>
    Array.from(row.querySelectorAll(".co-hiw-name > *, .co-hiw-score, .co-hiw-fee"))
      .filter((part) => part.getAttribute("aria-hidden") !== "true")
      .map((part) => part.textContent?.trim())
      .join(" | "),
  );
}

const live = (container: HTMLElement) => container.querySelector("[aria-live='polite']")?.textContent;

describe("the masking demo", () => {
  test("starts masked, labelled as sample data, with every score readable", () => {
    const { container } = render(<MaskDemo />);
    expect(screen.getByText("Sample data")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Masked" }).getAttribute("aria-pressed")).toBe("true");
    expect(readRows(container)).toEqual(["Masked | 93", "Masked | 86", "Masked | 78", "Masked | 71"]);
  });

  test("after the advisor review the names show, in the same order with the same scores", () => {
    const { container } = render(<MaskDemo />);
    fireEvent.click(screen.getByRole("button", { name: "After advisor review" }));
    expect(screen.getByRole("button", { name: "After advisor review" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Masked" }).getAttribute("aria-pressed")).toBe("false");
    expect(readRows(container)).toEqual(["Provider A | 93", "Provider B | 86", "Provider C | 78", "Provider D | 71"]);
    expect(live(container)).toContain("Names shown after the advisor review");
  });

  test("showing referral fees changes no score and no order, and says why", () => {
    const { container } = render(<MaskDemo />);
    const toggle = screen.getByRole("button", { name: "Show referral fees" });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(readRows(container)).toEqual([
      "Masked | 93 | Pays MMHR a referral fee",
      "Masked | 86 | Pays MMHR a referral fee",
      "Masked | 78 | Pays MMHR a referral fee",
      "Masked | 71 | Pays MMHR a referral fee",
    ]);
    expect(live(container)).toBe("Referral fees shown. Referral fees are never an input to the score.");
    fireEvent.click(toggle);
    expect(live(container)).toBe("Referral fees hidden.");
  });
});
