import "server-only";
import { randomUUID } from "node:crypto";

import type { createClient } from "@/lib/supabase/server";
import { startCustomerWorkspace } from "@/server/commands/customer-registration";
import { synchronizeCallerIdentity } from "@/server/commands/identity-synchronization";

type RequestSupabaseClient = Awaited<ReturnType<typeof createClient>>;

export class AccountSetupError extends Error {
  constructor(readonly cleanupFailed: boolean) {
    super("Account setup could not be completed");
    this.name = "AccountSetupError";
  }
}

async function signOutLocally(supabase: RequestSupabaseClient): Promise<boolean> {
  try {
    const response = await supabase.auth.signOut({ scope: "local" });
    return !response || response.error !== null;
  } catch {
    return true;
  }
}

/** Synchronizes the caller, then creates or reuses the caller's customer workspace. */
export async function completeAccountSetup(supabase: RequestSupabaseClient): Promise<void> {
  try {
    const correlationId = randomUUID();
    const identity = await synchronizeCallerIdentity({ supabase, correlationId });
    const workspace = await startCustomerWorkspace({ supabase, correlationId });

    if (identity.identityId !== workspace.identityId) {
      throw new Error("Account setup identity mismatch");
    }
  } catch {
    const cleanupFailed = await signOutLocally(supabase);
    throw new AccountSetupError(cleanupFailed);
  }
}
