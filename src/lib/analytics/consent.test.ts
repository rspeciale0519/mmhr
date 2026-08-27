import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  ANALYTICS_CONSENT_COOKIE,
  grantAnalyticsConsent,
  denyAnalyticsConsent,
  hasAnalyticsConsent,
} from "@/lib/analytics/consent";
import { initAnalytics } from "@/lib/analytics/posthog";

vi.mock("posthog-js", () => ({
  default: { init: vi.fn(), __loaded: false },
}));

import posthog from "posthog-js";

function clearConsent() {
  document.cookie = `${ANALYTICS_CONSENT_COOKIE}=; Max-Age=0; path=/`;
}

describe("analytics consent", () => {
  beforeEach(() => {
    clearConsent();
    vi.mocked(posthog.init).mockClear();
  });

  test("no consent recorded by default", () => {
    expect(hasAnalyticsConsent()).toBe(false);
  });

  test("granting consent is readable back", () => {
    grantAnalyticsConsent();
    expect(hasAnalyticsConsent()).toBe(true);
  });

  test("denying consent reads back as no consent", () => {
    grantAnalyticsConsent();
    denyAnalyticsConsent();
    expect(hasAnalyticsConsent()).toBe(false);
  });
});

/**
 * The load-bearing tests. A cookie banner that renders but does not actually
 * gate the tracker is a compliance failure (FR-MKT-09), so assert on posthog.init
 * itself rather than on UI state.
 */
describe("analytics initialisation is gated on consent", () => {
  beforeEach(() => {
    clearConsent();
    vi.mocked(posthog.init).mockClear();
    // Next inlines NEXT_PUBLIC_* at build time; Vitest does not, so supply it.
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test_key");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("does NOT initialise PostHog when the key is missing, even with consent", () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "");
    grantAnalyticsConsent();
    initAnalytics();
    expect(posthog.init).not.toHaveBeenCalled();
  });

  test("does NOT initialise PostHog without consent", () => {
    initAnalytics();
    expect(posthog.init).not.toHaveBeenCalled();
  });

  test("does NOT initialise PostHog when consent is explicitly denied", () => {
    denyAnalyticsConsent();
    initAnalytics();
    expect(posthog.init).not.toHaveBeenCalled();
  });

  test("initialises PostHog once consent is granted", () => {
    grantAnalyticsConsent();
    initAnalytics();
    expect(posthog.init).toHaveBeenCalledTimes(1);
  });
});
