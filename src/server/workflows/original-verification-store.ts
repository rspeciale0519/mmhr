import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { DOCUMENT_QUARANTINE_BUCKET } from "@/server/workflows/document-store";
import type { OriginalVerificationStore, OriginalVerificationClaim } from "./original-verification-worker";
import { readOriginalVerificationStream } from "./original-verification-stream";

/** Retains the registered machine's supplied client and exact authenticated object path. */
export function createOriginalVerificationStore(client: SupabaseClient): OriginalVerificationStore {
  return Object.freeze({
    readOriginal(claim: OriginalVerificationClaim, signal: AbortSignal) {
      return readOriginalVerificationStream(claim, signal, (readSignal) =>
        client.storage.from(DOCUMENT_QUARANTINE_BUCKET)
          .download(`${claim.organizationId}/${claim.documentId}/${claim.versionId}`, {}, { signal: readSignal }).asStream());
    },
  });
}
