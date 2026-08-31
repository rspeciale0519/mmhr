import "server-only";

export const INVITATION_ACCEPTANCE_PATH = "/invitations/accept";

export type IdentityOperation = "invitation_delivery" | "mfa_enrollment_reset";

/** Supplied only from an authorized, audited claim of a durable intent. */
export type IdentityOperationContext<Operation extends IdentityOperation> = Readonly<{
  operation: Operation;
  intentId: string;
  correlationId: string;
  idempotencyKey: string;
}>;

export type IdentityReadRequest = Readonly<{
  subjectId: string;
  correlationId: string;
}>;

export type MfaResetRequest = Readonly<{
  subjectId: string;
  context: IdentityOperationContext<"mfa_enrollment_reset">;
}>;

export type InvitationDeliveryRequest = Readonly<{
  email: string;
  context: IdentityOperationContext<"invitation_delivery">;
}>;

export type IdentityFailureCode =
  | "invalid_request"
  | "provider_unavailable"
  | "provider_rejected"
  | "provider_response_invalid"
  | "reset_limit_exceeded"
  | "factors_remaining";

export type IdentityFailure = Readonly<{
  outcome: "failed";
  code: IdentityFailureCode;
  retry: "safe" | "never" | "manual_review";
}>;

export type IdentityUnknownOutcome = Readonly<{
  outcome: "outcome_unknown";
  code: "provider_outcome_unknown" | "factors_remaining" | "delivery_unverifiable";
  nextAction: "reconcile" | "manual_review";
}>;

export type IdentityReadResult<Value> =
  | Readonly<{ outcome: "succeeded"; value: Value }>
  | IdentityFailure;

export type IdentityWriteResult<Value> =
  | IdentityReadResult<Value>
  | IdentityUnknownOutcome;

/** Provider observations are not application permissions or session verification. */
export type IdentityVerificationFacts = Readonly<{
  subjectId: string;
  verifiedEmail: string | null;
  emailVerifiedAt: string | null;
  isAnonymous: boolean;
  isBanned: boolean;
  isDeleted: boolean;
  observedAt: string;
}>;

export type IdentityMfaFactor = Readonly<{
  id: string;
  kind: "totp" | "phone" | "webauthn" | "unknown";
  status: "verified" | "unverified" | "unknown";
}>;

export type IdentityMfaSnapshot = Readonly<{
  subjectId: string;
  factors: readonly IdentityMfaFactor[];
  observedAt: string;
}>;

export type MfaResetReceipt = Readonly<{
  subjectId: string;
  confirmedFactorCount: 0;
  observedAt: string;
}>;

/** Acceptance confirms a provider request, not inbox delivery or account state. */
export type InvitationDeliveryReceipt = Readonly<{
  acknowledgement: "provider_accepted";
}>;

export interface IdentityService {
  /** The caller owns durable leases, audit records, and repeat-call prevention. */
  readonly providerWriteIdempotency: "unsupported";
  getVerificationFacts(request: IdentityReadRequest): Promise<IdentityReadResult<IdentityVerificationFacts>>;
  listMfaFactors(request: IdentityReadRequest): Promise<IdentityReadResult<IdentityMfaSnapshot>>;
  resetMfaEnrollment(request: MfaResetRequest): Promise<IdentityWriteResult<MfaResetReceipt>>;
  /** Read-only. A remaining factor never permits another reset automatically. */
  reconcileMfaReset(request: MfaResetRequest): Promise<IdentityWriteResult<MfaResetReceipt>>;
  deliverInvitation(request: InvitationDeliveryRequest): Promise<IdentityWriteResult<InvitationDeliveryReceipt>>;
  /** Account existence cannot prove that one specific email was delivered. */
  reconcileInvitation(request: InvitationDeliveryRequest): Promise<IdentityUnknownOutcome | IdentityFailure>;
}
