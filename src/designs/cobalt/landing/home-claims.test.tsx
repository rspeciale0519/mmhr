import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";

import { VENDORS } from "../../_content";
import { CobaltBody } from "./Body";

afterEach(cleanup);

const homeText = () => render(<CobaltBody />).container.textContent ?? "";

test("names no vendor", () => {
  const text = homeText();
  expect(VENDORS.filter((vendor) => text.includes(vendor))).toEqual([]);
});

test("keeps the sign-up call to action and the payment roles", () => {
  const { container } = render(<CobaltBody />);
  const start = container.querySelector('a[href="/sign-up"]');
  expect(start).not.toBeNull();
  expect(start?.textContent).toContain("Start your needs list");
  expect(container.textContent).toContain("Providers pay MMHR a referral fee");
  expect(container.textContent).toContain("Customers never pay MMHR");
  expect(container.textContent).toContain("Buyers never pay");
});

test("labels ranking figures as sample data", () => {
  const { container } = render(<CobaltBody />);
  expect(container.textContent).toContain("Sample data");
  expect(container.textContent).toContain("Every HRIS, ranked on fit.");
});
