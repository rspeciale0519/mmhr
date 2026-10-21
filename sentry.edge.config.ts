import * as Sentry from "@sentry/nextjs";
import { sanitizeMonitoringEvent, sanitizeMonitoringSpan } from "./src/lib/telemetry-privacy";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 1,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  sendDefaultPii: false,
  beforeSend: sanitizeMonitoringEvent,
  beforeSendTransaction: sanitizeMonitoringEvent,
  beforeSendSpan: sanitizeMonitoringSpan,
});
