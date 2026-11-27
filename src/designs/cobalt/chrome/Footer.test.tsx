import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";

import { CobaltFooter } from "./Footer";

afterEach(cleanup);

test("links to the four menu pages, contact, and the legal pages", () => {
  render(<CobaltFooter />);
  const nav = screen.getByRole("navigation", { name: "Footer" });
  expect(within(nav).getAllByRole("link").map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
    ["How it works", "/how-it-works"],
    ["Why it's free", "/why-its-free"],
    ["For providers", "/for-providers"],
    ["Resources", "/resources"],
    ["Contact", "/contact"],
    ["Privacy", "/privacy"],
    ["Terms", "/terms"],
  ]);
});

test("states the payment roles without unapproved claims", () => {
  const { container } = render(<CobaltFooter />);
  expect(container.textContent).toContain("Customers never pay MMHR.");
  expect(container.textContent).toContain("it is never an input to rank");
});

test("shows the newsletter slot only when one is passed", () => {
  const { container, rerender } = render(<CobaltFooter />);
  expect(container.querySelector(".co-foot-news")).toBeNull();
  rerender(<CobaltFooter newsletter={<p>Signup goes here</p>} />);
  expect(container.querySelector(".co-foot-news")).toHaveTextContent("Signup goes here");
});
