import { defineConfig } from "vitest/config";
import { readFileSync } from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

// Scratch migration rehearsals run without application secrets.
if (process.env.R1_REHEARSAL_ONLY !== "1") {
  dotenv.config({ path: ".env.local" });
}

// Owner decision D9: CI runs the excluded finance and document files in a
// separate job that reports but does not block. "all" keeps the full suite.
const scope = process.env.MMHR_INTEGRATION_SCOPE ?? "all";
if (!["all", "launch", "excluded-features"].includes(scope)) {
  throw new Error(`Unknown MMHR_INTEGRATION_SCOPE: ${scope}`);
}
const excludedFeatureFiles: string[] = JSON.parse(
  readFileSync(path.resolve(__dirname, "scripts/integration-excluded-features.json"), "utf8"),
).files;

export default defineConfig({
  test: {
    environment: "node",
    include: scope === "excluded-features" ? excludedFeatureFiles : ["src/**/*.integration.test.ts"],
    exclude: scope === "launch" ? ["node_modules/**", ...excludedFeatureFiles] : ["node_modules/**"],
    // Local Postgres round-trips are slower than unit tests.
    testTimeout: 20_000,
    // Shared database: keep integration files sequential to avoid cross-test races.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "server-only": path.resolve(__dirname, "node_modules/next/dist/compiled/server-only/empty.js"),
    },
  },
});
