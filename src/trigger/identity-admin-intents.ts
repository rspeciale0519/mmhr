import "server-only";
import { logger, schedules } from "@trigger.dev/sdk";

import { runIdentityIntentWorker } from "@/server/integrations/auth-admin/worker";

export const identityAdminIntentsTask = schedules.task({
  id: "identity-admin-intents",
  cron: { pattern: "* * * * *", environments: ["STAGING", "PRODUCTION"] },
  queue: { name: "identity-admin-intents", concurrencyLimit: 1 },
  retry: { maxAttempts: 1 },
  maxDuration: 300,
  ttl: "60s",
  run: async () => {
    let result: Awaited<ReturnType<typeof runIdentityIntentWorker>>;
    try {
      result = await runIdentityIntentWorker();
    } catch {
      // Trigger stores thrown errors. Never attach connection or provider data.
      logger.error("Identity intent worker failed", { code: "unexpected_failure" });
      throw new Error("Identity intent worker failed");
    }
    if (result.outcome === "disabled") return result;
    if (result.outcome === "failed") {
      logger.error("Identity intent worker failed", { code: result.code });
      throw new Error("Identity intent worker failed");
    }
    logger.info("Identity intent sweep completed", { counts: result.counts, items: result.items });
    if (result.counts.needs_attention > 0) {
      throw new Error("Identity intent work needs operator review");
    }
    return result;
  },
});
