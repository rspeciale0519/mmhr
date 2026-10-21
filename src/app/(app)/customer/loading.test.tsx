import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import CustomerLoading from "./loading";

afterEach(cleanup);

test("announces loading without showing private records or animated content", () => {
  const { container } = render(<CustomerLoading />);
  expect(screen.getByRole("status")).toHaveTextContent("Loading saved intake information.");
  expect(screen.getByRole("heading", { name: "Your software needs" })).toBeInTheDocument();
  expect(screen.queryByRole("article")).not.toBeInTheDocument();
  expect(container.querySelector('[class*="animate-"]')).toBeNull();
});
