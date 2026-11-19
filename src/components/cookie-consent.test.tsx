import { afterEach, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { usePathname } from "next/navigation";

import { initAnalytics } from "@/lib/analytics/posthog";
import { CookieConsent } from "./cookie-consent";

vi.mock("next/navigation", () => ({ usePathname: vi.fn() }));
vi.mock("@/lib/analytics/posthog", () => ({ initAnalytics: vi.fn() }));
vi.mock("@/lib/analytics/consent", () => ({
  denyAnalyticsConsent: vi.fn(), grantAnalyticsConsent: vi.fn(), isConsentDecisionMade: () => false,
}));

afterEach(() => { cleanup(); vi.mocked(initAnalytics).mockClear(); });

test("shows the banner and may start analytics on ordinary pages", () => {
  vi.mocked(usePathname).mockReturnValue("/contact");
  render(<CookieConsent />);
  expect(screen.getByRole("region", { name: "Cookie consent" })).toBeInTheDocument();
  expect(initAnalytics).toHaveBeenCalledOnce();
});

test("never starts analytics or shows the banner on a vendor's private RFP form", () => {
  // The address of this page contains the private link token.
  vi.mocked(usePathname).mockReturnValue(`/rfp/${"A".repeat(43)}`);
  render(<CookieConsent />);
  expect(screen.queryByRole("region", { name: "Cookie consent" })).not.toBeInTheDocument();
  expect(initAnalytics).not.toHaveBeenCalled();
});
