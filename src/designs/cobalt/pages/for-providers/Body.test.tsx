import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { ForProvidersBody } from "./Body";

afterEach(cleanup);

describe("/for-providers", () => {
  test("sends providers to /contact, from the hero and the closing band", () => {
    render(<ForProvidersBody />);
    const contact = screen.getAllByRole("link", { name: "Contact the MMHR team" });
    expect(contact.length).toBeGreaterThanOrEqual(2);
    for (const link of contact) expect(link).toHaveAttribute("href", "/contact");
  });

  test("answers five to seven provider questions", () => {
    const { container } = render(<ForProvidersBody />);
    const questions = container.querySelectorAll(".co-qa-item");
    expect(questions.length).toBeGreaterThanOrEqual(5);
    expect(questions.length).toBeLessThanOrEqual(7);
  });

  test("states how it works: no account, emailed RFP, fit-only rank, fee only on signing", () => {
    const { container } = render(<ForProvidersBody />);
    const text = container.textContent ?? "";
    expect(text).toContain("You do not need to join MatchMaker HR or create an account");
    expect(text).toContain("The referral fee is never an input to rank");
    expect(text).toContain("applies only when a buyer signs");
    expect(text).toContain("names masked");
  });

  test("publishes no fee amount, percentage, or range", () => {
    const { container } = render(<ForProvidersBody />);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/\d\s*%|percent|\$\s*\d|\d+\s*(?:-|to)\s*\d+\s*%/i);
  });
});
