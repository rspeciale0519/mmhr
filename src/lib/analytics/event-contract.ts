import posthog from "posthog-js";

import { hasAnalyticsConsent } from "./consent";

export const analyticsEventNames = [
  "page_view",
  "lead_form_started",
  "lead_form_submitted",
  "requirements_builder_completed",
  "partner_finder_completed",
  "consent_granted",
  "intake_started",
  "evaluation_started",
  "activation_completed",
  "workflow_action",
  "job_viewed",
] as const;

export type AnalyticsEventName = (typeof analyticsEventNames)[number];
type AnalyticsValue = string | number | boolean;

const safePropertyKey = /^[a-z][a-z0-9_]{0,63}$/;
const sensitivePropertyKey = /(?:email|phone|mobile|name|address|ip|cookie|token|user|person|contact|company|organization|org|message|note|comment|resume|salary|ssn|secret|id$)/i;

export type AnalyticsEvent = Readonly<{
  name: AnalyticsEventName;
  properties: Readonly<Record<string, AnalyticsValue>>;
}>;

function isSafeValue(value: unknown): value is AnalyticsValue {
  return (typeof value === "string" && value.length <= 200)
    || (typeof value === "number" && Number.isFinite(value))
    || typeof value === "boolean";
}

/** Validates a consent-gated event without accepting personal or sensitive fields. */
export function prepareAnalyticsEvent(nameInput: unknown, propertiesInput: unknown): AnalyticsEvent | null {
  if (!analyticsEventNames.includes(nameInput as AnalyticsEventName) || !propertiesInput || typeof propertiesInput !== "object" || Array.isArray(propertiesInput)) return null;
  const properties: Record<string, AnalyticsValue> = {};
  for (const [key, value] of Object.entries(propertiesInput)) {
    if (!safePropertyKey.test(key) || sensitivePropertyKey.test(key) || !isSafeValue(value)) return null;
    properties[key] = value;
  }
  if (Object.keys(properties).length > 20) return null;
  return Object.freeze({ name: nameInput as AnalyticsEventName, properties: Object.freeze(properties) });
}

/** Captures only validated events after explicit analytics consent. */
export function captureAnalyticsEvent(name: unknown, properties: unknown): boolean {
  if (!hasAnalyticsConsent()) return false;
  const event = prepareAnalyticsEvent(name, properties);
  if (!event) return false;
  posthog.capture(event.name, event.properties);
  return true;
}
