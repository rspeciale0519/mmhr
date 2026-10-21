import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  ANALYTICS_CONSENT_COOKIE,
  buildConsentCookie,
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

  test("marks the consent cookie SameSite=Lax and Secure on HTTPS", () => {
    expect(buildConsentCookie(ANALYTICS_CONSENT_COOKIE, "granted", "https:")).toBe(
      `${ANALYTICS_CONSENT_COOKIE}=granted; Max-Age=31536000; path=/; SameSite=Lax; Secure`,
    );
    expect(buildConsentCookie(ANALYTICS_CONSENT_COOKIE, "denied", "http:")).toBe(
      `${ANALYTICS_CONSENT_COOKIE}=denied; Max-Age=31536000; path=/; SameSite=Lax`,
    );
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
  test("removes email and token parameters before analytics events leave the browser", () => {
    grantAnalyticsConsent();
    initAnalytics();
    const config = vi.mocked(posthog.init).mock.calls[0]![1]!;
    expect(config).toMatchObject({ autocapture: false, disable_session_recording: true, disable_capture_url_hashes: true,
      mask_personal_data_properties: true, custom_personal_data_properties: ["email", "token", "code"] });
    const filter = config.before_send;
    if (typeof filter !== "function") throw new Error("Analytics privacy filter missing");
    const result = filter({ event: "$pageview", uuid: "test-only", timestamp: new Date("2026-09-30T20:00:00Z"),
      $set_once: { $initial_current_url: "https://example.invalid/sign-up?email=synthetic%40example.invalid" },
      properties: { $current_url: "https://example.invalid/sign-up?email=synthetic%40example.invalid", $referrer: "https://example.invalid/?code=test-only", safe_count: 1 } });
    expect(result?.properties).toMatchObject({ $current_url: "https://example.invalid/sign-up", $referrer: "https://example.invalid/", safe_count: 1 });
    expect(result?.$set_once).toEqual({ $initial_current_url: "https://example.invalid/sign-up" });
  });
});
