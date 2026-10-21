import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

import { APPLICATION_SECURITY_HEADERS } from "./src/lib/security-headers";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    authInterrupts: true,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: APPLICATION_SECURITY_HEADERS,
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  // Source maps are uploaded only where an auth token exists (CI / Vercel);
  // local builds skip it rather than failing.
  silent: !process.env.CI,
  telemetry: false,
  // Replaces the deprecated disableLogger option. Turbopack builds ignore it.
  webpack: { treeshake: { removeDebugLogging: true } },
  widenClientFileUpload: true,
});
