import { defineConfig } from "@trigger.dev/sdk";

/**
 * Background jobs (decision D4). Phase 0 only establishes the wiring; the
 * research-pipeline tasks (crawl -> extract -> validate -> publish) are built in
 * Phase 5.
 *
 * Runtime auth comes from TRIGGER_SECRET_KEY. The CLI (`trigger dev`,
 * `trigger deploy`) additionally needs an interactive `trigger login`, which is
 * an owner action — see docs/temp/BLOCKERS.md.
 */
export default defineConfig({
  project: "proj_mmmffglqprpzbymxcwqe",
  runtime: "node",
  logLevel: "log",
  maxDuration: 300,
  retries: {
    enabledInDev: false,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 1_000,
      maxTimeoutInMs: 10_000,
      factor: 2,
      randomize: true,
    },
  },
  dirs: ["./src/trigger"],
});
