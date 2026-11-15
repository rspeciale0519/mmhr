import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";

import { VENDORS } from "../_content";
import { PulseBody } from "./Body";

afterEach(cleanup);

// FR-MKT-03: the homepage must not publish placeholder or unapproved claims.
const homeText = () => render(<PulseBody />).container.textContent ?? "";

test("publishes no figures except step and section markers", () => {
  // textContent joins elements without spaces, so markers have no word boundary.
  const text = homeText().replace(/(?:CH\.|M\.)?0\d|Step \d/g, "");
  expect(text).not.toMatch(/\d/);
});

test("publishes no freshness, live, or verification claims", () => {
  expect(homeText()).not.toMatch(/verif|\blive\b|re-check|monitor|stale|online|\bago\b|every \d|last 24|this week/i);
});

test("names no vendor", () => {
  const text = homeText();
  expect(VENDORS.filter((vendor) => text.includes(vendor))).toEqual([]);
});

test("keeps the hero sign-up call to action and the payment roles", () => {
  const { container } = render(<PulseBody />);
  const form = container.querySelector('form[action="/sign-up"]');
  expect(form).not.toBeNull();
  expect(form?.querySelector('input[type="email"][name="email"]')).not.toBeNull();
  expect(container.textContent).toContain("Providers pay us under commission or referral arrangements.");
  expect(container.textContent).toContain("Customers never pay MMHR.");
});
