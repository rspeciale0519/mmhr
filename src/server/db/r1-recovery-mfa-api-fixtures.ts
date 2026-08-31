import { createHmac, randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect } from "vitest";
import { z } from "zod";

import { createSupabaseIdentityService } from "@/server/integrations/auth-admin/supabase";
import type { RecoveryMfaReceipt } from "@/server/commands/recovery-mfa-contract";
import type { IdentityIntentClaim } from "@/server/identity/intent-worker-contract";
import { asWorker, prepareWorkerFixtureRole, recordIntentResult } from "./r1-identity-intent-fixtures";
import { startRehearsal, stopRehearsal, type RehearsalContext } from "./r1-migration-rehearsal";
import { applyRecoveryMfaPrefix, readRecoveryMfaPrefix } from "./r1-recovery-mfa-prefix";

const authOptions = { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } };
const claimsSchema = z.object({ sub: z.uuid(), session_id: z.uuid(), exp: z.number().int().positive(),
  iat: z.number().int().nonnegative(), aal: z.enum(["aal1", "aal2"]), role: z.literal("authenticated"),
}).refine((claims) => claims.iat < claims.exp);

export async function verifiedMfaApiClaims(client: SupabaseClient, assurance: "aal1" | "aal2") {
  const response = await client.auth.getClaims();
  const parsed = claimsSchema.safeParse(response.data?.claims);
  if (response.error || !parsed.success || parsed.data.aal !== assurance
    || parsed.data.exp <= Date.now() / 1_000 || parsed.data.iat > Math.floor(Date.now() / 1_000)) {
    throw new Error("Disposable recovery Auth claims were not verified");
  }
  return { subjectId: parsed.data.sub, sessionId: parsed.data.session_id, issuedAt: parsed.data.iat,
    expiresAt: new Date(parsed.data.exp * 1_000).toISOString(), assurance: parsed.data.aal };
}

function requireScratchApi(context: RehearsalContext) {
  if (process.env.NODE_ENV !== "test" || process.env.R1_MIGRATION_REHEARSAL !== "1"
    || !context.api || !context.apiLoopbackOnly || !/^mmhr-r1-intentmfaa-[0-9a-f]{8}$/.test(context.projectId)) {
    throw new Error("Recovery API fixtures require their isolated scratch project");
  }
  const api = new URL(context.api.url);
  const database = new URL(context.databaseUrl);
  if (api.protocol !== "http:" || api.hostname !== "127.0.0.1" || api.port !== String(context.ports.api)
    || api.port === "56321" || api.username || api.password || api.search || api.hash || api.pathname !== "/"
    || database.hostname !== "127.0.0.1" || database.port !== String(context.ports.database)
    || database.port === "56322" || database.username !== "postgres" || database.pathname !== "/postgres") {
    throw new Error("Recovery API fixtures refused a non-scratch endpoint");
  }
  return context.api;
}

async function waitForMfaSchema(anonymous: SupabaseClient) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    // This is a read-only anonymous call. The fixed denial proves cache readiness.
    const response = await anonymous.rpc("mmhr_get_recovery_mfa_context");
    if (response.error?.code === "42501") return;
    if (response.error?.code !== "PGRST202") throw new Error("Recovery API schema readiness failed");
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Recovery API schema did not become ready");
}

function totpCode(secret: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const character of secret.toUpperCase().replace(/=+$/, "")) {
    const value = alphabet.indexOf(character);
    if (value < 0) throw new Error("The disposable MFA factor encoding is invalid");
    bits += value.toString(2).padStart(5, "0");
  }
  const key = Buffer.from(bits.match(/.{8}/g)?.map((byte) => Number.parseInt(byte, 2)) ?? []);
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const digest = createHmac("sha1", key).update(counter).digest();
  const offset = digest[digest.length - 1]! & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

export async function createRecoveryMfaApiFixtures() {
  const prefix = await readRecoveryMfaPrefix();
  console.info("Recovery MFA API source captured: reviewed 0000–0009 only.");
  const context = await startRehearsal("intentmfaapi", { api: true });
  try {
    const api = requireScratchApi(context);
    const owner = context.client;
    await applyRecoveryMfaPrefix(context, prefix);
    await prepareWorkerFixtureRole(context);
    const admin = createClient(api.url, api.adminKey, authOptions);
    const anonymous = createClient(api.url, api.publicKey, authOptions);
    await owner`NOTIFY pgrst, 'reload schema'`;
    await waitForMfaSchema(anonymous);

    function frozenTokenClient(token: string) {
      // Do not return token strings or compare whole clients in assertions.
      return createClient(api.url, api.publicKey, { ...authOptions, global: { headers: { Authorization: `Bearer ${token}` } } });
    }

    async function enrollTotp(client: SupabaseClient) {
      const enrollment = await client.auth.mfa.enroll({ factorType: "totp", friendlyName: `Disposable recovery ${randomUUID()}` });
      if (enrollment.error || !enrollment.data) throw new Error("Disposable recovery factor enrollment failed");
      const factorId = enrollment.data.id;
      const secret = enrollment.data.totp.secret;
      let attempted = false;
      return {
        factorId,
        async verify() {
          if (attempted) throw new Error("The disposable factor verification was already attempted");
          attempted = true;
          const challenge = await client.auth.mfa.challenge({ factorId });
          if (challenge.error || !challenge.data) throw new Error("Disposable recovery factor challenge failed");
          const verified = await client.auth.mfa.verify({ factorId, challengeId: challenge.data.id, code: totpCode(secret) });
          if (verified.error || !verified.data?.access_token) throw new Error("Disposable recovery factor verification failed");
          await verifiedMfaApiClaims(client, "aal2");
          return frozenTokenClient(verified.data.access_token);
        },
      };
    }

    async function createPrincipal() {
      const email = `scratch-recovery-${randomUUID()}@example.invalid`;
      const password = `Disposable-recovery-${randomUUID()}`;
      const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (created.error || !created.data.user?.email_confirmed_at || created.data.user.email !== email) {
        throw new Error("The disposable recovery Auth user was not confirmed");
      }
      const subjectId = created.data.user.id;
      const identityId = randomUUID();
      if (subjectId === identityId) throw new Error("The fixture requires separate stable and Auth identifiers");
      await owner`INSERT INTO public.identities
        (id, auth_user_id, normalized_email, email_verified_at, status, synchronized_at, migration_review_required)
        VALUES (${identityId}::uuid, ${subjectId}::uuid, ${email}, ${created.data.user.email_confirmed_at}::timestamptz,
          'pending', clock_timestamp(), false)`;
      async function signIn() {
        const client = createClient(api.url, api.publicKey, authOptions);
        const result = await client.auth.signInWithPassword({ email, password });
        if (result.error || !result.data.session || result.data.user.id !== subjectId) {
          throw new Error("Disposable recovery sign-in failed");
        }
        const claims = await verifiedMfaApiClaims(client, "aal1");
        if (claims.subjectId !== subjectId) throw new Error("Disposable recovery subject did not match");
        return { client, frozen: frozenTokenClient(result.data.session.access_token) };
      }
      const initial = await signIn();
      const factor = await enrollTotp(initial.client);
      const elevated = { client: initial.client, frozen: await factor.verify() };
      return { subjectId, identityId, elevated, factorId: factor.factorId, signIn };
    }

    const pair = [await createPrincipal(), await createPrincipal()] as const;
    await owner`SELECT mmhr_private.r1_prepare_super_admin_bootstrap(
      ${pair[0].identityId}::uuid, ${pair[1].identityId}::uuid,
      ${`product:${randomUUID()}`}, ${`security:${randomUUID()}`}, ${randomUUID()}::uuid)`;
    const first = await verifiedMfaApiClaims(pair[0].elevated.client, "aal2");
    const second = await verifiedMfaApiClaims(pair[1].elevated.client, "aal2");
    // Only signed claims from real scratch Auth sessions enter the owner bootstrap.
    await owner`SELECT mmhr_private.r1_complete_super_admin_bootstrap(
      ${first.subjectId}::uuid, ${first.sessionId}::uuid, ${first.expiresAt}::timestamptz,
      ${second.subjectId}::uuid, ${second.sessionId}::uuid, ${second.expiresAt}::timestamptz, ${randomUUID()}::uuid)`;
    // These UUIDs identify synthetic policy evidence, not approvals by real people.
    await owner`SELECT mmhr_private.r1_prepare_recovery_policy(
      ${pair[0].identityId}::uuid, ${pair[1].identityId}::uuid,
      ${randomUUID()}::uuid, ${randomUUID()}::uuid, ${randomUUID()}::uuid, ${randomUUID()}::uuid, ${randomUUID()}::uuid)`;
    const identityService = createSupabaseIdentityService({ supabaseUrl: api.url, adminKey: api.adminKey, applicationOrigin: api.url });

    return { context, owner, anonymous, pair, identityService, enrollTotp,
      async refreshBoundSession(client: SupabaseClient, sessionId: string, fenceSecond: number) {
        const wait = Math.max(0, (fenceSecond + 1) * 1_000 - Date.now() + 25);
        if (wait > 2_000) throw new Error("The disposable recovery fence is unexpectedly in the future");
        if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
        const result = await client.auth.refreshSession();
        if (result.error || !result.data.session) throw new Error("The original bound recovery session could not refresh");
        const claims = await verifiedMfaApiClaims(client, "aal1");
        expect(claims.sessionId).toBe(sessionId);
        expect(claims.issuedAt).toBeGreaterThan(fenceSecond);
        return { claims, frozen: frozenTokenClient(result.data.session.access_token) };
      },
      async assertReceipt(receipt: RecoveryMfaReceipt, identityId: string, key: string, correlationId: string) {
        const rows = await owner`SELECT receipt.id, receipt.entity_id, receipt.action, event.correlation_id
          FROM public.security_command_receipts receipt JOIN public.audit_events event ON event.id = receipt.audit_event_id
          WHERE receipt.actor_identity_id = ${identityId}::uuid AND receipt.command = ${receipt.action}
            AND receipt.idempotency_key = ${key}::uuid`;
        expect(rows).toEqual([{ id: receipt.receiptId, entity_id: receipt.entityId, action: receipt.action, correlation_id: correlationId }]);
      },
      async close() {
        await stopRehearsal(context);
        console.info("Recovery MFA API exact scratch cleanup completed:", context.projectId);
      },
    };
  } catch (error) {
    try { await stopRehearsal(context); }
    catch (cleanupError) { throw new AggregateError([error, cleanupError], "Recovery API setup and scratch cleanup failed"); }
    console.info("Recovery MFA API failed-setup exact scratch cleanup completed:", context.projectId);
    throw error;
  }
}

export type RecoveryMfaApiFixtures = Awaited<ReturnType<typeof createRecoveryMfaApiFixtures>>;

export async function recordRecoveryApiReset(f: RecoveryMfaApiFixtures, claim: IdentityIntentClaim, observedAt: string) {
  try {
    return await f.owner.begin((sql) => asWorker(sql, (worker) => recordIntentResult(worker, claim.intentId, claim.leaseToken, {
      outcome: "succeeded", resultCode: "mfa_zero_factors", confirmedFactorCount: 0, observedAt,
    })));
  } catch (error) {
    // Failure-only diagnostics retain no subject, token, factor secret, or SQL
    // parameter. Never retry this result or the provider write implicitly.
    const [facts] = await f.owner`SELECT
      mmhr_private.r1_identity_intent_context_is_valid(i) AS context_valid,
      mmhr_private.r1_identity_intent_history_is_valid(i) AS history_valid,
      i.lease_token = ${claim.leaseToken}::uuid AS original_lease,
      a.completed_at IS NULL AS attempt_open,
      ${observedAt}::timestamptz >= date_trunc('milliseconds',a.started_at) AS observation_after_start,
      extract(epoch FROM (clock_timestamp() - ${observedAt}::timestamptz)) * 1000 AS observation_age_ms,
      NOT EXISTS(SELECT 1 FROM auth.mfa_factors factor WHERE factor.user_id = i.auth_subject_id) AS zero_factors,
      EXISTS(SELECT 1 FROM auth.users u WHERE u.id = i.auth_subject_id AND u.deleted_at IS NULL AND NOT u.is_anonymous) AS provider_valid,
      r.state = 'approved' AND r.target_identity_id = i.target_identity_id
        AND r.initiated_by_identity_id = i.initiated_by_identity_id AND p.state = 'linked'
        AND p.linked_request_id = r.id AND p.target_identity_id = target.id
        AND p.auth_subject_id = i.auth_subject_id AND target.auth_user_id = i.auth_subject_id
        AND target.status = 'recovery_pending' AND target.authorization_not_before IS NOT NULL AS binding_valid,
      EXISTS(SELECT 1 FROM auth.sessions s WHERE s.id::text = p.auth_session_id AND s.user_id = i.auth_subject_id AND s.aal = 'aal1') AS bound_aal1_session
      FROM public.identity_admin_intents i
      JOIN public.identity_intent_attempts a ON a.intent_id = i.id AND a.attempt_number = i.attempt_count
      JOIN public.identity_recovery_requests r ON r.id = i.recovery_request_id
      JOIN public.identity_recovery_presence p ON p.id = r.recovery_presence_id
      JOIN public.identities target ON target.id = i.target_identity_id WHERE i.id = ${claim.intentId}::uuid`;
    const code = typeof error === "object" && error !== null && "code" in error
      && typeof error.code === "string" && /^[0-9A-Z]{5}$/.test(error.code) ? error.code : "unknown";
    const location = typeof error === "object" && error !== null && "where" in error && typeof error.where === "string"
      ? error.where.match(/PL\/pgSQL function [a-zA-Z0-9_.]+\([a-zA-Z0-9_, ]*\) line [0-9]+ at [A-Z ]+/)?.[0] ?? "unknown" : "unknown";
    throw new Error(`Disposable reset result was rejected: ${JSON.stringify({ code, location, facts })}`);
  }
}
