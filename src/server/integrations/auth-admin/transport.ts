import "server-only";
import { AuthAdminApi } from "@supabase/supabase-js";

import { canonicalOrigin, fixedInvitationAcceptanceUrl } from "@/server/identity/validation";

export const PROVIDER_REQUEST_TIMEOUT_MS = 5_000;

export type SupabaseIdentityOptions = Readonly<{
  supabaseUrl: string;
  adminKey: string;
  applicationOrigin: string;
  /** Test transports must not make live requests. Production uses native fetch. */
  fetchImplementation?: typeof fetch;
}>;

export class IdentityAdapterConfigurationError extends Error {
  constructor() {
    super("Identity adapter configuration is invalid");
    this.name = "IdentityAdapterConfigurationError";
  }
}

function unavailableResponse(): Response {
  return new Response('{"message":"Identity provider request failed"}', {
    status: 503,
    headers: { "content-type": "application/json" },
  });
}

export function createAdminClientFactory(options: SupabaseIdentityOptions) {
  const origin = canonicalOrigin(options.supabaseUrl);
  const acceptanceUrl = fixedInvitationAcceptanceUrl(options.applicationOrigin);
  const adminKey = options.adminKey;
  if (!origin || !acceptanceUrl || typeof adminKey !== "string" ||
    !/^[A-Za-z0-9._-]{16,4096}$/.test(adminKey) ||
    (options.fetchImplementation !== undefined && typeof options.fetchImplementation !== "function")) {
    throw new IdentityAdapterConfigurationError();
  }
  const fetchImplementation = options.fetchImplementation ?? globalThis.fetch.bind(globalThis);

  return {
    acceptanceUrl,
    forCorrelation(correlationId: string) {
      return new AuthAdminApi({
        url: `${origin}/auth/v1`,
        headers: {
          apikey: adminKey,
          Authorization: `Bearer ${adminKey}`,
          "x-correlation-id": correlationId,
        },
        fetch: async (input, init) => {
          try {
            const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
            if (url.origin !== origin) return unavailableResponse();
            return await fetchImplementation(input, {
              ...init,
              credentials: "omit",
              redirect: "error",
              signal: AbortSignal.timeout(PROVIDER_REQUEST_TIMEOUT_MS),
            });
          } catch {
            // Auth SDK logs rejected fetch errors. Replace the response before
            // that boundary so neither credentials nor provider text reach logs.
            // A write receiving this response remains unknown, not retryable.
            return unavailableResponse();
          }
        },
      });
    },
  };
}
