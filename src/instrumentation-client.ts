import * as Sentry from "@sentry/nextjs";
import { sanitizeMonitoringEvent, sanitizeMonitoringSpan } from "@/lib/telemetry-privacy";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 1,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  sendDefaultPii: false,
  beforeSend: sanitizeMonitoringEvent,
  beforeSendTransaction: sanitizeMonitoringEvent,
  beforeSendSpan: sanitizeMonitoringSpan,
  // Session replay is off by default: it records user sessions, which is a
  // privacy decision that belongs with the consent work, not a default.
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
