import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";

import { FeeDemo, feeWord } from "./FeeDemo";

afterEach(cleanup);

const order = () => screen.getAllByRole("listitem").map((item) => item.querySelector(".co-fee-name")?.textContent);

test("is labelled as sample data and names the fee it changes", () => {
  render(<FeeDemo />);
  expect(screen.getByText("Sample data")).toBeInTheDocument();
  expect(screen.getByRole("slider", { name: "Referral fee paid by Provider 01" })).toHaveAttribute("aria-valuetext", "Lowest");
  expect(screen.getByText("Lowest fee. Ranking unchanged.")).toBeInTheDocument();
});

test("raising the lowest-ranked provider's fee never changes the ranking", () => {
  render(<FeeDemo />);
  const before = order();
  expect(before).toEqual(["Provider 03", "Provider 11", "Provider 07", "Provider 01"]);
  const slider = screen.getByRole("slider");
  fireEvent.change(slider, { target: { value: "100" } });
  expect(slider).toHaveAttribute("aria-valuetext", "Highest");
  expect(order()).toEqual(before);
  expect(screen.getByText("Highest fee. Ranking unchanged.")).toBeInTheDocument();
  expect(screen.getAllByRole("listitem")[3]).toHaveTextContent("Referral fee: Highest");
});

test("turns a fee level into a word", () => {
  expect([0, 19, 20, 50, 79, 80, 100].map(feeWord)).toEqual(["Lowest", "Lowest", "Low", "Middle", "High", "Highest", "Highest"]);
});
