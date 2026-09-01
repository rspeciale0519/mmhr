import { beforeEach, describe, expect, test, vi } from "vitest";

import posthog from "posthog-js";

import { captureAnalyticsEvent, prepareAnalyticsEvent } from "./event-contract";

vi.mock("posthog-js", () => ({ default: { capture: vi.fn() } }));

describe("consent-aware analytics event contract", () => {
  beforeEach(() => {
    document.cookie = "mmhr_analytics_consent=; Max-Age=0; path=/";
    vi.mocked(posthog.capture).mockReset();
  });

  test("accepts bounded non-sensitive properties and freezes output", () => {
    const event = prepareAnalyticsEvent("lead_form_submitted", { source: "contact", variant: "short" });
    expect(event).toEqual({ name: "lead_form_submitted", properties: { source: "contact", variant: "short" } });
    expect(Object.isFrozen(event)).toBe(true);
    expect(Object.isFrozen(event?.properties)).toBe(true);
  });

  test.each([
    ["unknown_event", {}],
    ["page_view", { email_hash: "abc" }],
    ["page_view", { organization_id: "abc" }],
    ["page_view", { source: { nested: true } }],
    ["page_view", { "bad-key": "value" }],
  ])("rejects unsafe event input: %j", (name, properties) => {
    expect(prepareAnalyticsEvent(name, properties)).toBeNull();
  });

  test("does not call the provider without consent", () => {
    expect(captureAnalyticsEvent("page_view", { source: "home" })).toBe(false);
    expect(posthog.capture).not.toHaveBeenCalled();
  });

  test("captures only validated events after consent", () => {
    document.cookie = "mmhr_analytics_consent=granted";
    expect(captureAnalyticsEvent("page_view", { source: "home", logged_in: false })).toBe(true);
    expect(posthog.capture).toHaveBeenCalledExactlyOnceWith("page_view", { source: "home", logged_in: false });
    expect(captureAnalyticsEvent("page_view", { email: "private@example.test" })).toBe(false);
    expect(posthog.capture).toHaveBeenCalledOnce();
  });

  test("accepts the report funnel and workflow event names after consent", () => {
    document.cookie = "mmhr_analytics_consent=granted";
    for (const name of ["intake_started", "evaluation_started", "activation_completed", "workflow_action", "job_viewed"] as const) {
      expect(captureAnalyticsEvent(name, { source: "workflow" })).toBe(true);
    }
    expect(posthog.capture).toHaveBeenCalledTimes(5);
  });
});
