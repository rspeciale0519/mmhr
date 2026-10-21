import "server-only";
import { z } from "zod";

import type {
  IdentityMfaFactor,
  IdentityMfaSnapshot,
  IdentityReadResult,
  IdentityService,
  IdentityVerificationFacts,
  MfaResetReceipt,
} from "@/server/identity/service";
import {
  identityReadRequestSchema,
  invitationDeliveryRequestSchema,
  mfaResetRequestSchema,
} from "@/server/identity/validation";
import { failed, isConfirmedRejection, providerStatus, readFailure, unknownOutcome } from "./errors";
import { createAdminClientFactory, type SupabaseIdentityOptions } from "./transport";

export const MAX_RESET_FACTORS = 16;
export const RESET_WRITE_BUDGET_MS = 25_000;

type AdminClient = ReturnType<ReturnType<typeof createAdminClientFactory>["forCorrelation"]>;

const timestamp = z.iso.datetime({ offset: true });
const userFactsSchema = z.object({
  id: z.uuid(),
  email: z.email().max(254).nullish(),
  email_confirmed_at: timestamp.nullish(),
  is_anonymous: z.boolean(),
  banned_until: timestamp.nullish(),
  deleted_at: timestamp.nullish(),
});

const factorListSchema = z.object({
  factors: z.array(z.object({
    id: z.uuid().transform((id) => id.toLowerCase()),
    factor_type: z.string().min(1).max(64),
    status: z.string().min(1).max(64),
  })).max(1_000),
});

const deletedFactorSchema = z.object({ id: z.uuid() });
// auth-js 2.110.2 wraps _request's result again in _deleteFactor. Accept that
// exact success envelope and the documented DTO, but no arbitrary nested data.
const deleteReceiptSchema = z.union([
  deletedFactorSchema,
  z.object({ data: deletedFactorSchema, error: z.null() }).transform((value) => value.data),
]);

function factorKind(kind: string): IdentityMfaFactor["kind"] {
  return kind === "totp" || kind === "phone" || kind === "webauthn" ? kind : "unknown";
}

function factorStatus(status: string): IdentityMfaFactor["status"] {
  return status === "verified" || status === "unverified" ? status : "unknown";
}

async function readFactors(
  client: AdminClient,
  subjectId: string,
): Promise<IdentityReadResult<IdentityMfaSnapshot>> {
  try {
    const response = await client.mfa.listFactors({ userId: subjectId });
    if (response.error) return readFailure(response.error);
    const parsed = factorListSchema.safeParse(response.data);
    if (!parsed.success) return failed("provider_response_invalid");
    const factors = parsed.data.factors;
    if (new Set(factors.map((factor) => factor.id)).size !== factors.length) {
      return failed("provider_response_invalid");
    }
    return {
      outcome: "succeeded",
      value: {
        subjectId,
        factors: factors.map((factor) => ({
          id: factor.id,
          kind: factorKind(factor.factor_type),
          status: factorStatus(factor.status),
        })),
        observedAt: new Date().toISOString(),
      },
    };
  } catch {
    return failed("provider_unavailable", "safe");
  }
}

function resetReceipt(snapshot: IdentityMfaSnapshot): IdentityReadResult<MfaResetReceipt> {
  if (snapshot.factors.length !== 0) return failed("factors_remaining", "manual_review");
  return {
    outcome: "succeeded",
    value: {
      subjectId: snapshot.subjectId,
      confirmedFactorCount: 0,
      observedAt: snapshot.observedAt,
    },
  };
}

/**
 * This boundary has no authority to change application state or start a retry.
 * Supabase provides no idempotency contract for these admin writes. The durable
 * caller must hold the original intent lease and persist every returned outcome.
 */
export function createSupabaseIdentityService(options: SupabaseIdentityOptions): IdentityService {
  const clients = createAdminClientFactory(options);

  return Object.freeze<IdentityService>({
    providerWriteIdempotency: "unsupported" as const,

    async getVerificationFacts(request) {
      const parsed = identityReadRequestSchema.safeParse(request);
      if (!parsed.success) return failed("invalid_request");
      const { subjectId, correlationId } = parsed.data;
      try {
        const response = await clients.forCorrelation(correlationId).getUserById(subjectId);
        if (response.error) return readFailure(response.error);
        const user = userFactsSchema.safeParse(response.data.user);
        if (!user.success || user.data.id.toLowerCase() !== subjectId.toLowerCase()) {
          return failed("provider_response_invalid");
        }
        const now = new Date();
        const verifiedEmail = user.data.email && user.data.email_confirmed_at
          ? user.data.email.toLowerCase()
          : null;
        const value: IdentityVerificationFacts = {
          subjectId,
          verifiedEmail,
          emailVerifiedAt: verifiedEmail ? user.data.email_confirmed_at! : null,
          isAnonymous: user.data.is_anonymous,
          isBanned: Boolean(user.data.banned_until && Date.parse(user.data.banned_until) > now.getTime()),
          isDeleted: Boolean(user.data.deleted_at),
          observedAt: now.toISOString(),
        };
        return { outcome: "succeeded", value };
      } catch {
        return failed("provider_unavailable", "safe");
      }
    },

    async listMfaFactors(request) {
      const parsed = identityReadRequestSchema.safeParse(request);
      if (!parsed.success) return failed("invalid_request");
      return readFactors(clients.forCorrelation(parsed.data.correlationId), parsed.data.subjectId);
    },

    async resetMfaEnrollment(request) {
      const parsed = mfaResetRequestSchema.safeParse(request);
      if (!parsed.success) return failed("invalid_request");
      const { subjectId, context } = parsed.data;
      const client = clients.forCorrelation(context.correlationId);
      const initial = await readFactors(client, subjectId);
      if (initial.outcome !== "succeeded") return initial;
      if (initial.value.factors.length > MAX_RESET_FACTORS) {
        return failed("reset_limit_exceeded", "manual_review");
      }

      const deadline = Date.now() + RESET_WRITE_BUDGET_MS;
      let ambiguousWrite = false;
      // Delete each initial factor at most once. Do not chase newly enrolled
      // factors or restart a partial reset without a new authorized decision.
      for (const factor of initial.value.factors) {
        if (Date.now() >= deadline) break;
        try {
          const response = await client.mfa.deleteFactor({ userId: subjectId, id: factor.id });
          if (response.error) {
            ambiguousWrite = !isConfirmedRejection(response.error);
            break;
          }
          const deleted = deleteReceiptSchema.safeParse(response.data);
          if (!deleted.success || deleted.data.id.toLowerCase() !== factor.id) {
            ambiguousWrite = true;
            break;
          }
        } catch {
          ambiguousWrite = true;
          break;
        }
      }

      // A final read, including after partial or ambiguous deletion, is the only
      // success evidence. An empty initial list is not enough on its own.
      const final = await readFactors(client, subjectId);
      if (final.outcome !== "succeeded") return unknownOutcome();
      if (final.value.factors.length === 0) return resetReceipt(final.value);
      return ambiguousWrite
        ? unknownOutcome("reconcile", "factors_remaining")
        : failed("factors_remaining", "manual_review");
    },

    async reconcileMfaReset(request) {
      const parsed = mfaResetRequestSchema.safeParse(request);
      if (!parsed.success) return failed("invalid_request");
      const { subjectId, context } = parsed.data;
      const snapshot = await readFactors(clients.forCorrelation(context.correlationId), subjectId);
      if (snapshot.outcome !== "succeeded") return unknownOutcome();
      return snapshot.value.factors.length === 0
        ? resetReceipt(snapshot.value)
        : unknownOutcome("manual_review", "factors_remaining");
    },

    async deliverInvitation(request) {
      const parsed = invitationDeliveryRequestSchema.safeParse(request);
      if (!parsed.success) return failed("invalid_request");
      const { email, context } = parsed.data;
      try {
        const response = await clients.forCorrelation(context.correlationId).inviteUserByEmail(email, {
          redirectTo: clients.acceptanceUrl,
        });
        if (response.error) {
          return isConfirmedRejection(response.error)
            ? failed("provider_rejected", providerStatus(response.error) === 429 ? "safe" : "never")
            : unknownOutcome("manual_review");
        }
        const receipt = z.object({ id: z.uuid(), email: z.email() }).safeParse(response.data.user);
        if (!receipt.success || receipt.data.email.toLowerCase() !== email) {
          return unknownOutcome("manual_review");
        }
        return { outcome: "succeeded", value: { acknowledgement: "provider_accepted" as const } };
      } catch {
        return unknownOutcome("manual_review");
      }
    },

    async reconcileInvitation(request) {
      if (!invitationDeliveryRequestSchema.safeParse(request).success) return failed("invalid_request");
      // User existence and invited_at cannot identify this delivery attempt.
      // The provider has no documented per-intent delivery receipt API.
      return unknownOutcome("manual_review", "delivery_unverifiable");
    },
  });
}
