import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { identities, invitations } from "./identity";

export const identityIntentOperation = pgEnum("identity_intent_operation", [
  "invitation_delivery",
  "identity_relink",
  "mfa_enrollment_reset",
]);
export const identityIntentState = pgEnum("identity_intent_state", [
  "pending",
  "in_flight",
  "succeeded",
  "failed",
  "outcome_unknown",
  "cancelled",
]);
export const identityIntentWorkMode = pgEnum("identity_intent_work_mode", [
  "dispatch",
  "reconciliation",
]);
export const recoveryPresenceState = pgEnum("recovery_presence_state", [
  "pending",
  "linked",
  "completed",
  "expired",
  "cancelled",
]);
export const recoveryRequestState = pgEnum("recovery_request_state", [
  "pending",
  "approved",
  "completed",
  "expired",
  "cancelled",
]);
export const recoveryAction = pgEnum("recovery_action", [
  "mfa_enrollment_reset",
]);
export const recoveryDecision = pgEnum("recovery_decision", [
  "approved",
  "denied",
]);
export const authenticationAssurance = pgEnum("authentication_assurance", [
  "aal1",
  "aal2",
]);
export const phoneCheckResult = pgEnum("phone_check_result", [
  "confirmed",
  "no_preexisting_number",
  "no_answer",
  "not_confirmed",
  "failed",
]);
export const bootstrapState = pgEnum("bootstrap_state", [
  "prepared",
  "consumed",
]);

export const identityRecoveryPresence = pgTable(
  "identity_recovery_presence",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    targetIdentityId: uuid("target_identity_id")
      .notNull()
      .references(() => identities.id, { onDelete: "restrict" }),
    authSessionId: text("auth_session_id").notNull(),
    // Nullable legacy rows stay unusable until a new caller-bound presence exists.
    authSubjectId: uuid("auth_subject_id"),
    opaqueReferenceHash: text("opaque_reference_hash").notNull(),
    state: recoveryPresenceState("state").notNull().default("pending"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    // The circular request foreign key is added in reviewed SQL.
    linkedRequestId: uuid("linked_request_id"),
    expectedReplacementFactorId: text("expected_replacement_factor_id"),
    linkedAt: timestamp("linked_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("identity_recovery_presence_reference_hash_uq").on(
      t.opaqueReferenceHash,
    ),
    uniqueIndex("identity_recovery_presence_active_session_uq")
      .on(t.targetIdentityId, t.authSessionId)
      .where(sql`${t.state} in ('pending', 'linked')`),
    index("identity_recovery_presence_expiry_idx").on(t.state, t.expiresAt),
    check(
      "identity_recovery_presence_hash_ck",
      sql`${t.opaqueReferenceHash} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "identity_recovery_presence_expiry_ck",
      sql`${t.expiresAt} > ${t.createdAt} and ${t.expiresAt} <= ${t.createdAt} + interval '30 minutes'`,
    ),
    check(
      "identity_recovery_presence_lifecycle_ck",
      sql`(${t.state} = 'pending' and ${t.linkedRequestId} is null and ${t.linkedAt} is null and ${t.completedAt} is null and ${t.cancelledAt} is null) or (${t.state} = 'linked' and ${t.linkedRequestId} is not null and ${t.linkedAt} is not null and ${t.completedAt} is null and ${t.cancelledAt} is null) or (${t.state} = 'completed' and ${t.linkedRequestId} is not null and ${t.completedAt} is not null and ${t.cancelledAt} is null) or (${t.state} = 'cancelled' and ${t.cancelledAt} is not null and ${t.completedAt} is null) or (${t.state} = 'expired' and ${t.completedAt} is null)`,
    ),
  ],
);

export const identityRecoveryRequests = pgTable(
  "identity_recovery_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    targetIdentityId: uuid("target_identity_id")
      .notNull()
      .references(() => identities.id, { onDelete: "restrict" }),
    recoveryPresenceId: uuid("recovery_presence_id")
      .notNull()
      .references(() => identityRecoveryPresence.id, { onDelete: "restrict" }),
    initiatedByIdentityId: uuid("initiated_by_identity_id")
      .notNull()
      .references(() => identities.id, { onDelete: "restrict" }),
    action: recoveryAction("action").notNull(),
    reason: text("reason").notNull(),
    state: recoveryRequestState("state").notNull().default("pending"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("identity_recovery_requests_presence_uq").on(
      t.recoveryPresenceId,
    ),
    index("identity_recovery_requests_target_state_idx").on(
      t.targetIdentityId,
      t.state,
    ),
    index("identity_recovery_requests_expiry_idx").on(t.state, t.expiresAt),
    check(
      "identity_recovery_requests_expiry_ck",
      sql`${t.expiresAt} > ${t.createdAt} and ${t.expiresAt} <= ${t.createdAt} + interval '30 minutes'`,
    ),
    check(
      "identity_recovery_requests_reason_ck",
      sql`length(btrim(${t.reason})) > 0`,
    ),
    check(
      "identity_recovery_requests_lifecycle_ck",
      sql`(${t.state} = 'pending' and ${t.approvedAt} is null and ${t.completedAt} is null and ${t.cancelledAt} is null) or (${t.state} = 'approved' and ${t.approvedAt} is not null and ${t.completedAt} is null and ${t.cancelledAt} is null) or (${t.state} = 'completed' and ${t.approvedAt} is not null and ${t.completedAt} is not null and ${t.cancelledAt} is null) or (${t.state} in ('expired', 'cancelled') and ${t.completedAt} is null)`,
    ),
  ],
);

export const identityRecoveryApprovals = pgTable(
  "identity_recovery_approvals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => identityRecoveryRequests.id, { onDelete: "restrict" }),
    approverIdentityId: uuid("approver_identity_id")
      .notNull()
      .references(() => identities.id, { onDelete: "restrict" }),
    decision: recoveryDecision("decision").notNull(),
    assurance: authenticationAssurance("assurance").notNull(),
    preExistingContactAttested: boolean("pre_existing_contact_attested")
      .notNull()
      .default(false),
    phoneCheckResult: phoneCheckResult("phone_check_result").notNull(),
    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull(),
    evidenceReference: text("evidence_reference"),
    decisionReason: text("decision_reason").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("identity_recovery_approvals_request_uq").on(t.requestId),
    index("identity_recovery_approvals_approver_idx").on(
      t.approverIdentityId,
      t.createdAt,
    ),
    check(
      "identity_recovery_approvals_approved_ck",
      sql`${t.decision} <> 'approved' or (${t.assurance} = 'aal2' and ${t.preExistingContactAttested} and ${t.phoneCheckResult} = 'confirmed' and ${t.evidenceReference} is not null and length(btrim(${t.evidenceReference})) > 0)`,
    ),
    check(
      "identity_recovery_approvals_reason_ck",
      sql`length(btrim(${t.decisionReason})) > 0`,
    ),
  ],
);

export const identityAdminIntents = pgTable(
  "identity_admin_intents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    operation: identityIntentOperation("operation").notNull(),
    targetIdentityId: uuid("target_identity_id").references(
      () => identities.id,
      { onDelete: "restrict" },
    ),
    invitationId: uuid("invitation_id").references(() => invitations.id, {
      onDelete: "restrict",
    }),
    recoveryRequestId: uuid("recovery_request_id").references(
      () => identityRecoveryRequests.id,
      { onDelete: "restrict" },
    ),
    idempotencyKey: text("idempotency_key").notNull(),
    correlationId: uuid("correlation_id"),
    initiatedByIdentityId: uuid("initiated_by_identity_id").references(
      () => identities.id,
      { onDelete: "restrict" },
    ),
    // Snapshot the provider target. Relinking an identity cannot redirect a claimed reset.
    authSubjectId: uuid("auth_subject_id"),
    state: identityIntentState("state").notNull().default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    maximumAttempts: integer("maximum_attempts").notNull().default(5),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    leaseToken: uuid("lease_token"),
    workMode: identityIntentWorkMode("work_mode"),
    dispatchCount: integer("dispatch_count").notNull().default(0),
    manualReviewRequired: boolean("manual_review_required").notNull().default(false),
    safeErrorCode: text("safe_error_code"),
    resultCode: text("result_code"),
    providerReference: text("provider_reference"),
    confirmedFactorCount: integer("confirmed_factor_count"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("identity_admin_intents_idempotency_uq").on(t.idempotencyKey),
    index("identity_admin_intents_dispatch_idx").on(
      t.state,
      t.nextAttemptAt,
      t.leaseExpiresAt,
    ),
    index("identity_admin_intents_target_idx").on(t.targetIdentityId, t.state),
    check(
      "identity_admin_intents_attempts_ck",
      sql`${t.attemptCount} >= 0 and ${t.maximumAttempts} > 0 and ${t.attemptCount} <= ${t.maximumAttempts}`,
    ),
    check(
      "identity_admin_intents_target_ck",
      sql`(${t.operation} = 'invitation_delivery' and ${t.invitationId} is not null and ${t.recoveryRequestId} is null) or (${t.operation} = 'identity_relink' and ${t.targetIdentityId} is not null and ${t.invitationId} is null and ${t.recoveryRequestId} is null) or (${t.operation} = 'mfa_enrollment_reset' and ${t.targetIdentityId} is not null and ${t.recoveryRequestId} is not null and ${t.invitationId} is null)`,
    ),
    check(
      "identity_admin_intents_factor_result_ck",
      sql`${t.confirmedFactorCount} is null or (${t.operation} = 'mfa_enrollment_reset' and ${t.confirmedFactorCount} >= 0)`,
    ),
    check(
      "identity_admin_intents_dispatch_count_ck",
      sql`${t.dispatchCount} >= 0 and ${t.dispatchCount} <= ${t.attemptCount} and (${t.operation} <> 'mfa_enrollment_reset' or ${t.dispatchCount} <= 1)`,
    ),
    check(
      "identity_admin_intents_lease_context_ck",
      sql`(${t.leaseToken} is null and ${t.workMode} is null) or (${t.leaseToken} is not null and ${t.workMode} is not null and ${t.correlationId} is not null and ${t.initiatedByIdentityId} is not null and ${t.leaseExpiresAt} is not null)`,
    ),
    check(
      "identity_admin_intents_lifecycle_ck",
      sql`(${t.state} = 'pending' and ${t.claimedAt} is null and ${t.leaseExpiresAt} is null and ${t.completedAt} is null) or (${t.state} = 'in_flight' and ${t.claimedAt} is not null and ${t.leaseExpiresAt} is not null and ${t.completedAt} is null) or (${t.state} in ('succeeded', 'failed', 'outcome_unknown') and ${t.claimedAt} is not null and ${t.completedAt} is not null) or (${t.state} = 'cancelled' and ${t.completedAt} is not null)`,
    ),
  ],
);

export const securityBootstrapState = pgTable(
  "security_bootstrap_state",
  {
    singletonKey: integer("singleton_key").primaryKey().default(1),
    targetIdentityId: uuid("target_identity_id")
      .notNull()
      .references(() => identities.id, { onDelete: "restrict" }),
    // Null preserves legacy single-target state without inventing a binding.
    secondTargetIdentityId: uuid("second_target_identity_id").references(
      () => identities.id,
      { onDelete: "restrict" },
    ),
    productApprovalReference: text("product_approval_reference").notNull(),
    securityApprovalReference: text("security_approval_reference").notNull(),
    state: bootstrapState("state").notNull().default("prepared"),
    preparedAt: timestamp("prepared_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
  },
  (t) => [
    check("security_bootstrap_state_singleton_ck", sql`${t.singletonKey} = 1`),
    check(
      "security_bootstrap_state_distinct_targets_ck",
      sql`${t.secondTargetIdentityId} is null or ${t.secondTargetIdentityId} <> ${t.targetIdentityId}`,
    ),
    check(
      "security_bootstrap_state_consumed_ck",
      sql`(${t.state} = 'prepared' and ${t.consumedAt} is null) or (${t.state} = 'consumed' and ${t.consumedAt} is not null)`,
    ),
  ],
);
