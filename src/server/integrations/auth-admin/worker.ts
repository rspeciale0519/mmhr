import "server-only";

import { createIdentityIntentRepository } from "@/server/db/identity-intent-repository";
import { createIdentityIntentWorkSource } from "@/server/db/identity-intent-work-source";
import { dispatchIdentityIntent } from "@/server/identity/intent-dispatcher";
import { sweepIdentityIntents, type IdentityIntentSweepResult } from "@/server/identity/intent-sweeper";
import { createSupabaseIdentityService } from "./supabase";

export type IdentityIntentWorkerResult = IdentityIntentSweepResult
  | Readonly<{ outcome: "disabled" }>
  | Readonly<{ outcome: "failed"; code: "configuration_invalid" | "initialization_failed" }>;

/** No payload can choose a database, actor, operation, provider, or target. */
export async function runIdentityIntentWorker(): Promise<IdentityIntentWorkerResult> {
  const enabled = process.env.IDENTITY_INTENT_WORKER_ENABLED;
  if (enabled === undefined || enabled === "0") return { outcome: "disabled" };
  if (enabled !== "1") return { outcome: "failed", code: "configuration_invalid" };

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const adminKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const applicationOrigin = process.env.NEXT_PUBLIC_APP_URL;
  if (!supabaseUrl || !adminKey || !applicationOrigin) {
    return { outcome: "failed", code: "configuration_invalid" };
  }

  let service: ReturnType<typeof createSupabaseIdentityService>;
  try {
    // Construction validates configuration but makes no provider request.
    service = createSupabaseIdentityService({ supabaseUrl, adminKey, applicationOrigin });
  } catch {
    return { outcome: "failed", code: "configuration_invalid" };
  }

  let executor: typeof import("@/server/db")["db"];
  try {
    // A disabled task must not require a database or open its pool. The source
    // verifies the actual login before the dispatcher can call the provider.
    executor = (await import("@/server/db")).db;
  } catch {
    return { outcome: "failed", code: "initialization_failed" };
  }
  const repository = createIdentityIntentRepository(executor);
  return sweepIdentityIntents({
    source: createIdentityIntentWorkSource(executor),
    dispatch: (input) => dispatchIdentityIntent(input, { repository, service }),
  });
}
