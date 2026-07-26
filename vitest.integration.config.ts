import { defineConfig } from "vitest/config";
import path from "node:path";
import dotenv from "dotenv";

// Integration tests hit the running local Supabase stack (supabase start).
// They load .env.local because Vitest — unlike Next — does not read it itself.
dotenv.config({ path: ".env.local" });

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.integration.test.ts"],
    exclude: ["node_modules/**"],
    // Local Postgres round-trips are slower than unit tests.
    testTimeout: 20_000,
    // Shared database: keep integration files sequential to avoid cross-test races.
    fileParallelism: false,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
