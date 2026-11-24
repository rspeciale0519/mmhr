import { defineConfig } from "@playwright/test";

const port = 3100;
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`;

const placeholderEnv = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:56321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "ci-placeholder-anon-key",
  NEXT_PUBLIC_BRAND_NAME: process.env.NEXT_PUBLIC_BRAND_NAME ?? "MatchMaker HR",
  SENTRY_AUTH_TOKEN: process.env.SENTRY_AUTH_TOKEN ?? "",
  // Same exception the develop Vercel preview uses. next start is NODE_ENV=production,
  // so without this the release gate answers 503 and Playwright never sees the UI.
  VERCEL_ENV: process.env.VERCEL_ENV ?? "preview",
  MMHR_PREVIEW_RELEASE_ENABLED: process.env.MMHR_PREVIEW_RELEASE_ENABLED ?? "1",
};

/**
 * iPhone-like Chromium: isMobile honors the real viewport meta. Desktop Chrome
 * resized to 390px would not reproduce iOS shrink-to-fit.
 */
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "off",
    browserName: "chromium",
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.0.0 Mobile/15E148 Safari/604.1",
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
      command: `npx next start -p ${port} -H 127.0.0.1`,
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: placeholderEnv,
    },
});
