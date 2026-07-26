import { logger, task } from "@trigger.dev/sdk";

/**
 * Wiring check for the jobs runtime. The real pipeline tasks (Firecrawl crawl,
 * Claude extraction, validation, publish — FR-P1..P6) land in Phase 5.
 */
export const healthTask = task({
  id: "health-check",
  run: async (payload: { at?: string }) => {
    logger.info("jobs runtime alive", { at: payload.at ?? "unspecified" });
    return { ok: true as const };
  },
});
