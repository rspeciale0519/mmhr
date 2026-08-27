import posthog from "posthog-js";

import { hasAnalyticsConsent } from "./consent";

/**
 * Initialises PostHog only behind explicit consent (FR-MKT-09, FR-ANL-01).
 *
 * This function is the single entry point for loading the tracker. Calling
 * posthog.init() anywhere else would bypass the consent gate, so don't.
 */
export function initAnalytics() {
  if (!hasAnalyticsConsent()) return;

  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return;

  posthog.init(key, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
    // Person profiles only for identified users: anonymous marketing traffic
    // does not need one, and it keeps the free-tier event budget sane.
    person_profiles: "identified_only",
    capture_pageview: true,
  });
}
