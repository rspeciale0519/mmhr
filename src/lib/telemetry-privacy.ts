import type { Event } from "@sentry/nextjs";

type MonitoringSpan = NonNullable<Event["spans"]>[number];

/**
 * Removes everything from an address that monitoring must not store: the
 * query string, the fragment, and the private link token of a vendor RFP
 * form (`/rfp/<token>`). That token is the only key to the vendor's form.
 */
export function stripUrlParameters(value: string): string {
  return (value.split(/[?#]/, 1)[0] ?? "").replace(/\/rfp\/[A-Za-z0-9_-]{43}(?=\/|$)/g, "/rfp/[token]");
}
function sanitizeData(value: NonNullable<MonitoringSpan["data"]>): NonNullable<MonitoringSpan["data"]>;
function sanitizeData(value: Record<string, unknown>): Record<string, unknown>;
function sanitizeData(value: Record<string, unknown>) {
  const result = { ...value };
  for (const key of Object.keys(result)) {
    if (/^(?:http\.(?:query|fragment)|query_string)$/i.test(key)) delete result[key];
    else if (/^(?:url|url\.full|http\.url|http\.target|from|to|href|referrer|referer)$/i.test(key)
      && typeof result[key] === "string") result[key] = stripUrlParameters(result[key]);
  }
  return result;
}
export function sanitizeMonitoringSpan(span: MonitoringSpan): MonitoringSpan {
  return { ...span, ...(span.description ? { description: stripUrlParameters(span.description) } : {}),
    ...(span.data ? { data: sanitizeData(span.data) } : {}) };
}
export function sanitizeMonitoringEvent<T extends Event>(event: T): T {
  const result = { ...event };
  if (event.request) {
    result.request = { ...event.request };
    // Form bodies, credentials, and query strings are not monitoring evidence.
    delete result.request.data;
    delete result.request.query_string;
    delete result.request.cookies;
    delete result.request.headers;
    delete result.request.env;
    if (result.request.url) result.request.url = stripUrlParameters(result.request.url);
  }
  if (event.transaction) result.transaction = stripUrlParameters(event.transaction);
  if (event.breadcrumbs) result.breadcrumbs = event.breadcrumbs.map((breadcrumb) => ({ ...breadcrumb,
    ...(breadcrumb.data ? { data: sanitizeData(breadcrumb.data) } : {}) }));
  if (event.spans) result.spans = event.spans.map(sanitizeMonitoringSpan);
  return result;
}
