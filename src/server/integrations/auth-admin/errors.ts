import "server-only";

import type {
  IdentityFailure,
  IdentityFailureCode,
  IdentityUnknownOutcome,
} from "@/server/identity/service";

export function failed(
  code: IdentityFailureCode,
  retry: IdentityFailure["retry"] = "never",
): IdentityFailure {
  return { outcome: "failed", code, retry };
}

export function unknownOutcome(
  nextAction: IdentityUnknownOutcome["nextAction"] = "reconcile",
  code: IdentityUnknownOutcome["code"] = "provider_outcome_unknown",
): IdentityUnknownOutcome {
  return { outcome: "outcome_unknown", code, nextAction };
}

export function providerStatus(error: unknown): number | null {
  if (typeof error !== "object" || error === null || !("status" in error)) return null;
  return typeof error.status === "number" ? error.status : null;
}

export function isConfirmedRejection(error: unknown): boolean {
  const status = providerStatus(error);
  // A timeout response does not prove that a write was rejected before execution.
  return status !== null && status >= 400 && status < 500 && status !== 408;
}

export function readFailure(error: unknown): IdentityFailure {
  return isConfirmedRejection(error)
    ? failed("provider_rejected", providerStatus(error) === 429 ? "safe" : "never")
    : failed("provider_unavailable", "safe");
}
