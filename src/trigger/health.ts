import { logger, task } from "@trigger.dev/sdk";

/**
 * Wiring check for the jobs runtime. Later tasks add content acquisition,
 * AI-assisted extraction, validation, and publishing.
 */
export const healthTask = task({
  id: "health-check",
  run: async (payload: { at?: string }) => {
    logger.info("jobs runtime alive", { at: payload.at ?? "unspecified" });
    return { ok: true as const };
  },
});
