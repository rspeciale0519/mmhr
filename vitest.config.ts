import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

const windowsWorkerSettings =
  process.platform === "win32"
    ? {
        // The complete Windows browser suite passed in forks after thread
        // workers repeatedly failed before loading. Keep each file isolated.
        pool: "forks" as const,
        maxWorkers: 1,
        fileParallelism: false,
      }
    : {};

// Server contracts do not need a browser. Keep browser globals available for
// component/client tests without paying jsdom setup cost for every server file.
// Live Supabase tests remain in vitest.integration.config.ts.
export default defineConfig({
  plugins: [react()],
  test: {
    setupFiles: ["./src/test/setup.ts"],
    ...windowsWorkerSettings,
    projects: [
      {
        extends: true,
        test: {
          name: "server",
          environment: "node",
          include: ["src/server/**/*.test.{ts,tsx}"],
          exclude: ["src/**/*.integration.test.ts", "node_modules/**"],
        },
      },
      {
        extends: true,
        test: {
          name: "browser",
          environment: "jsdom",
          include: ["src/**/*.test.{ts,tsx}"],
          exclude: ["src/server/**", "src/**/*.integration.test.ts", "node_modules/**"],
        },
      },
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Vitest runs server modules outside Next's server-component resolver.
      "server-only": path.resolve(__dirname, "node_modules/next/dist/compiled/server-only/empty.js"),
    },
  },
});
