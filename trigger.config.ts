import { defineConfig } from "@trigger.dev/sdk";

/**
 * Runtime secrets belong to this project's Trigger environment. Identity jobs
 * remain disabled until their target-environment checks pass. Do not copy all
 * Vercel environment values into the worker.
 */
export default defineConfig({
  project: "proj_mmmffglqprpzbymxcwqe",
  runtime: "node",
  build: { conditions: ["react-server"] },
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
