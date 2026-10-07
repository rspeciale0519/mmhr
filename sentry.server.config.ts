import * as Sentry from "@sentry/nextjs";
import { sanitizeMonitoringEvent, sanitizeMonitoringSpan } from "./src/lib/telemetry-privacy";

// No DSN (e.g. local dev, CI) => the SDK stays inert rather than erroring.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 1,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  sendDefaultPii: false,
  beforeSend: sanitizeMonitoringEvent,
  beforeSendTransaction: sanitizeMonitoringEvent,
  beforeSendSpan: sanitizeMonitoringSpan,
});
