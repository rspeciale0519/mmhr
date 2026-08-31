import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { identityAdminIntents, identityIntentWorkMode } from "./identity-admin";

export const identityIntentAttempts = pgTable(
  "identity_intent_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    intentId: uuid("intent_id").notNull().references(() => identityAdminIntents.id, { onDelete: "restrict" }),
    attemptNumber: integer("attempt_number").notNull(),
    mode: identityIntentWorkMode("mode").notNull(),
    leaseToken: uuid("lease_token").notNull(),
    correlationId: uuid("correlation_id").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    outcome: text("outcome"),
    safeErrorCode: text("safe_error_code"),
    resultCode: text("result_code"),
    nextAction: text("next_action"),
  },
  (t) => [
    uniqueIndex("identity_intent_attempts_number_uq").on(t.intentId, t.attemptNumber),
    uniqueIndex("identity_intent_attempts_lease_uq").on(t.leaseToken),
    index("identity_intent_attempts_correlation_idx").on(t.correlationId),
    check("identity_intent_attempts_number_ck", sql`${t.attemptNumber} between 1 and 5`),
    check("identity_intent_attempts_expiry_ck", sql`${t.leaseExpiresAt} > ${t.startedAt}`),
    check("identity_intent_attempts_lifecycle_ck", sql`
      (${t.completedAt} is null and ${t.outcome} is null and ${t.safeErrorCode} is null
        and ${t.resultCode} is null and ${t.nextAction} is null)
      or (${t.completedAt} is not null and ${t.completedAt} >= ${t.startedAt}
        and ${t.outcome} is not null and ${t.nextAction} is not null
        and ${t.outcome} in ('succeeded', 'failed', 'outcome_unknown')
        and ${t.nextAction} in ('none', 'retry', 'reconcile', 'manual_review'))
    `),
    check("identity_intent_attempts_error_ck", sql`${t.safeErrorCode} is null or ${t.safeErrorCode} in (
      'invalid_request', 'provider_unavailable', 'provider_rejected', 'provider_response_invalid',
      'reset_limit_exceeded', 'factors_remaining', 'provider_outcome_unknown', 'delivery_unverifiable',
      'lease_expired', 'attempt_limit', 'authority_lost', 'request_expired'
    )`),
    check("identity_intent_attempts_result_ck", sql`${t.resultCode} is null or ${t.resultCode} in (
      'invitation_provider_accepted', 'mfa_zero_factors'
    )`),
  ],
);
