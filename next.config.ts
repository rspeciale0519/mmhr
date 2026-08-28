import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    authInterrupts: true,
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  // Source maps are uploaded only where an auth token exists (CI / Vercel);
  // local builds skip it rather than failing.
  silent: !process.env.CI,
  disableLogger: true,
  widenClientFileUpload: true,
});
