import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

const windowsWorkerSettings =
  process.platform === "win32"
    ? {
        // Windows fork workers can time out before they load on constrained hosts.
        pool: "threads" as const,
        maxWorkers: 1,
        fileParallelism: false,
      }
    : {};

// Unit / component tests (jsdom). Integration tests that need a live local
// Supabase run separately via vitest.integration.config.ts.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: ["src/**/*.integration.test.ts", "node_modules/**"],
    ...windowsWorkerSettings,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Vitest runs server modules outside Next's server-component resolver.
      "server-only": path.resolve(__dirname, "node_modules/next/dist/compiled/server-only/empty.js"),
    },
  },
});
