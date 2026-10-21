import posthog from "posthog-js";

import { hasAnalyticsConsent } from "./consent";
import { stripUrlParameters } from "@/lib/telemetry-privacy";

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
    autocapture: false,
    disable_session_recording: true,
    disable_capture_url_hashes: true,
    mask_personal_data_properties: true,
    custom_personal_data_properties: ["email", "token", "code"],
    before_send: (event) => {
      if (!event) return event;
      for (const properties of [event.properties, event.$set, event.$set_once]) {
        if (!properties) continue;
        for (const key of ["$current_url", "$referrer", "$initial_current_url", "$initial_referrer", "$session_entry_url"]) {
          const value = properties[key];
          if (typeof value === "string") properties[key] = stripUrlParameters(value);
        }
      }
      return event;
    },
  });
}
