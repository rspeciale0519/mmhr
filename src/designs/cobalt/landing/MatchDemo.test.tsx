import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";

import { MatchDemo } from "./MatchDemo";

afterEach(cleanup);

/** The provider names on the board, top row first. */
const boardOrder = () => screen.getAllByRole("listitem").map((item) => item.textContent?.slice(0, 11));

test("starts with the sample ranking and two picks", () => {
  render(<MatchDemo />);
  expect(boardOrder()[0]).toBe("Provider 03");
  expect(screen.getByText("Sample data")).toBeTruthy();
  expect(screen.getByText(/2 of 5 contenders picked/)).toBeTruthy();
});

test("re-ranks when a need is switched", () => {
  render(<MatchDemo />);
  const before = boardOrder();
  fireEvent.click(screen.getByRole("button", { name: "Payroll" }));
  fireEvent.click(screen.getByRole("button", { name: "Recruiting" }));
  expect(boardOrder()).not.toEqual(before);
  expect(screen.getByRole("button", { name: "Payroll" }).getAttribute("aria-pressed")).toBe("false");
});

test("asks for a need when all are switched off", () => {
  render(<MatchDemo />);
  for (const name of ["Payroll", "Benefits", "Time tracking"]) {
    fireEvent.click(screen.getByRole("button", { name }));
  }
  expect(screen.getByText("Switch on at least one need to score the providers.")).toBeTruthy();
});

test("picks and unpicks a contender", () => {
  render(<MatchDemo />);
  const row = screen.getByRole("button", { name: /Provider 07/ });
  fireEvent.click(row);
  expect(row.getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByText(/3 of 5 contenders picked/)).toBeTruthy();
  fireEvent.click(row);
  expect(screen.getByText(/2 of 5 contenders picked/)).toBeTruthy();
});

test("unpicks a provider that drops off the board", () => {
  render(<MatchDemo />);
  // With only "Global hiring" on, neither default pick is in the top five.
  fireEvent.click(screen.getByRole("button", { name: "Global hiring" }));
  for (const name of ["Payroll", "Benefits", "Time tracking"]) {
    fireEvent.click(screen.getByRole("button", { name }));
  }
  expect(screen.getByText(/0 of 5 contenders picked/)).toBeTruthy();
});
