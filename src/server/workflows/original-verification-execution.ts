export type OriginalVerificationExecutionContext = Readonly<{
  signal?: AbortSignal;
  /** Absolute local lease deadline. It can shorten, but cannot extend, the query limit. */
  deadlineAt?: number;
}>;

export const ORIGINAL_VERIFICATION_QUERY_MS = 8_000;
export const ORIGINAL_VERIFICATION_CLOSE_MS = 2_000;

export class OriginalVerificationExecutionError extends Error {
  constructor(readonly code: "INVALID_INPUT" | "BUSY" | "CLOSED" | "ABORTED" | "DEADLINE" | "UNAVAILABLE" | "CLEANUP_FAILED") {
    super("Original verification SQL operation failed");
    this.name = "OriginalVerificationExecutionError";
  }
}
