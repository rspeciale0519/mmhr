import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { CobaltSiteChrome } from "./SiteChrome";

// The nav reads the current path; a fixed path is enough here.
vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

beforeEach(() => {
  // Start unconfigured, whatever the machine's environment holds.
  vi.stubEnv("RESEND_API_KEY", "");
  vi.stubEnv("RESEND_NEWSLETTER_SEGMENT_ID", "");
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

const footer = () => screen.getByRole("contentinfo");

describe("site footer newsletter signup", () => {
  test("is left out while the newsletter is not configured", () => {
    render(<CobaltSiteChrome>Page</CobaltSiteChrome>);
    expect(within(footer()).queryByRole("button", { name: "Subscribe" })).toBeNull();
    expect(footer().querySelector(".co-foot-news")).toBeNull();
  });

  test("is shown once the Resend key and the newsletter segment are set", () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("RESEND_NEWSLETTER_SEGMENT_ID", "78261eea-8f8b-4381-83c6-79fa7120f1cf");
    render(<CobaltSiteChrome>Page</CobaltSiteChrome>);
    expect(within(footer()).getByRole("button", { name: "Subscribe" })).toBeInTheDocument();
    expect(within(footer()).getByLabelText("Email address")).toHaveAttribute("type", "email");
  });
});
