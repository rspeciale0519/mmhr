import { randomUUID } from "node:crypto";
import { expect, test } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createRecoveryPresence, decideIdentityRecovery, prepareRecoveryPresence, requestIdentityRecovery } from "@/server/commands/recovery";
import { getRecoveryMfaContext, reactivateRecoveredIdentity, registerRecoveryFactor } from "@/server/commands/recovery-mfa";
import { asWorker, claimIntent } from "./r1-identity-intent-fixtures";
import { createRecoveryMfaApiFixtures, recordRecoveryApiReset, verifiedMfaApiClaims, type RecoveryMfaApiFixtures } from "./r1-recovery-mfa-api-fixtures";

async function assertNoOwnIdentity(client: SupabaseClient) {
  const result = await client.rpc("mmhr_get_my_identity");
  expect(result.error?.code ?? null).toBeNull();
  expect(result.data).toEqual([]);
}

async function assertNoPrivilegedRead(client: SupabaseClient) {
  for (const permission of ["admin.access", "audit.view"]) {
    const response = await client.rpc("mmhr_authorize", { permission_key: permission, organization_id: null });
    expect(response.error?.code ?? null).toBeNull();
    expect(response.data).toEqual([]);
  }
}

async function privilegeSnapshot(f: RecoveryMfaApiFixtures) {
  const tables = ["platform_role_assignments", "org_members", "role_definitions", "role_permission_defaults"] as const;
  const result: Record<string, unknown[]> = {};
  for (const table of tables) {
    const rows = await f.owner.unsafe<{ row: unknown }[]>(`SELECT to_jsonb(record) AS row FROM public.${table} record ORDER BY to_jsonb(record)::text`);
    result[table] = rows.map((row) => row.row);
  }
  return result;
}

test.each(["aal1", "aal2"] as const)("completes real local recovery from original %s presence without session transfer", async (originalAssurance) => {
  const f = await createRecoveryMfaApiFixtures();
  let failure: unknown;
  try {
    const [target, approver] = f.pair;
    // The reset must remove both verified and unverified provider factors.
    await f.enrollTotp(target.elevated.client);
    const bound = originalAssurance === "aal2" ? target.elevated : await target.signIn();
    const unbound = await target.signIn();
    const original = await verifiedMfaApiClaims(bound.client, originalAssurance);
    const other = await verifiedMfaApiClaims(unbound.client, "aal1");
    expect(original.sessionId).not.toBe(other.sessionId);
    const privileges = await privilegeSnapshot(f);
    const factorRead = await f.identityService.listMfaFactors({ subjectId: target.subjectId, correlationId: randomUUID() });
    expect(factorRead.outcome).toBe("succeeded");
    if (factorRead.outcome !== "succeeded") throw new Error("Disposable provider factor read failed");
    expect(factorRead.value.factors.map((factor) => factor.status).sort()).toEqual(["unverified", "verified"]);

    const anonymous = await f.anonymous.rpc("mmhr_get_recovery_mfa_context");
    expect(anonymous.error?.code).toBe("42501");
    const presence = await createRecoveryPresence(prepareRecoveryPresence({ idempotencyKey: randomUUID() }),
      { supabase: bound.client, correlationId: randomUUID() });
    const request = await requestIdentityRecovery({ opaqueReference: presence.readReference(), reasonCode: "lost_factor", idempotencyKey: randomUUID() },
      { supabase: bound.client, correlationId: randomUUID() });
    const [phone] = await f.owner<{ at: string }[]>`SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS at`;
    // This attestation is synthetic test data. No phone call or human identity is claimed.
    await decideIdentityRecovery({ requestId: request.entityId, phoneResult: "confirmed", preexistingContactAttested: true,
      phoneCheckedAt: phone!.at, evidenceReference: randomUUID(), idempotencyKey: randomUUID() },
    { supabase: approver.elevated.client, correlationId: randomUUID() });
    const intents = await f.owner<{ id: string }[]>`SELECT id FROM public.identity_admin_intents
      WHERE recovery_request_id = ${request.entityId}::uuid`;
    expect(intents).toHaveLength(1);
    const intentId = intents[0]!.id;
    const claim = await f.owner.begin((sql) => asWorker(sql, (worker) => claimIntent(worker, intentId)));
    if (!claim || claim.operation !== "mfa_enrollment_reset") throw new Error("The disposable recovery intent did not produce its one reset claim");
    expect(claim.subjectId).toBe(target.subjectId);
    expect(await f.owner.begin((sql) => asWorker(sql, (worker) => claimIntent(worker, intentId)))).toBeNull();
    await assertNoOwnIdentity(bound.frozen);
    await assertNoPrivilegedRead(approver.elevated.client);
    const reset = await f.identityService.resetMfaEnrollment({ subjectId: claim.subjectId, context: {
      operation: claim.operation, intentId: claim.intentId, correlationId: claim.correlationId, idempotencyKey: claim.idempotencyKey,
    } });
    expect(reset.outcome).toBe("succeeded");
    if (reset.outcome !== "succeeded") throw new Error("The disposable provider reset did not prove zero factors");
    expect(reset.value.confirmedFactorCount).toBe(0);
    expect(await recordRecoveryApiReset(f, claim, reset.value.observedAt)).toBe("recorded");
    expect(await f.owner`SELECT id FROM auth.mfa_factors WHERE user_id = ${target.subjectId}::uuid`).toEqual([]);
    expect(await f.owner`SELECT aal FROM auth.sessions WHERE id = ${original.sessionId}::uuid AND user_id = ${target.subjectId}::uuid`)
      .toEqual([{ aal: "aal1" }]);
    const [contained] = await f.owner<{ status: string; fence: number }[]>`SELECT status,
      floor(extract(epoch FROM authorization_not_before))::int AS fence FROM public.identities WHERE id = ${target.identityId}::uuid`;
    expect(contained!.status).toBe("recovery_pending");
    expect(await getRecoveryMfaContext({ supabase: bound.client })).toBeNull();
    expect((await bound.frozen.rpc("mmhr_get_recovery_mfa_context")).data).toEqual([]);
    await assertNoOwnIdentity(target.elevated.frozen);
    const refreshed = await f.refreshBoundSession(bound.client, original.sessionId, contained!.fence);
    expect(refreshed.claims.subjectId).toBe(target.subjectId);
    expect(await getRecoveryMfaContext({ supabase: bound.client })).toEqual({ recoveryRequestId: request.entityId,
      recoveryPresenceId: presence.receipt.entityId, expectedFactorId: null, state: "enrollment_required" });
    await assertNoOwnIdentity(refreshed.frozen);
    expect(await getRecoveryMfaContext({ supabase: unbound.client })).toBeNull();

    const factor = await f.enrollTotp(bound.client);
    expect((await getRecoveryMfaContext({ supabase: bound.client }))?.state).toBe("needs_review");
    const registerKey = randomUUID();
    const registerCorrelation = randomUUID();
    const registration = await registerRecoveryFactor({ factorId: factor.factorId, idempotencyKey: registerKey },
      { supabase: bound.client, correlationId: registerCorrelation });
    expect(registration.entityId).toBe(presence.receipt.entityId);
    expect(await registerRecoveryFactor({ factorId: factor.factorId, idempotencyKey: registerKey },
      { supabase: bound.client, correlationId: randomUUID() })).toEqual(registration);
    await f.assertReceipt(registration, target.identityId, registerKey, registerCorrelation);
    expect(await getRecoveryMfaContext({ supabase: bound.client })).toEqual({ recoveryRequestId: request.entityId,
      recoveryPresenceId: presence.receipt.entityId, expectedFactorId: factor.factorId, state: "verification_required" });
    await expect(registerRecoveryFactor({ factorId: factor.factorId, idempotencyKey: registerKey },
      { supabase: unbound.client, correlationId: randomUUID() })).rejects.toMatchObject({ code: "REJECTED" });
    const aal1Completion = await bound.client.rpc("mmhr_reactivate_recovered_identity", {
      correlation_id: randomUUID(), idempotency_key: randomUUID(),
    });
    expect(aal1Completion.error?.code).toBe("42501");
    await expect(reactivateRecoveredIdentity({ idempotencyKey: randomUUID() }, { supabase: bound.client })).rejects.toMatchObject({ name: "AuthorizationError" });
    expect(await f.owner`SELECT status FROM public.identities WHERE id = ${target.identityId}::uuid`)
      .toEqual([{ status: "recovery_pending" }]);

    await factor.verify();
    const completedClaims = await verifiedMfaApiClaims(bound.client, "aal2");
    expect(completedClaims.sessionId).toBe(original.sessionId);
    expect(completedClaims.issuedAt).toBeGreaterThan(contained!.fence);
    expect(await f.owner`SELECT factor_id, aal FROM auth.sessions WHERE id = ${original.sessionId}::uuid`)
      .toEqual([{ factor_id: factor.factorId, aal: "aal2" }]);
    const completeKey = randomUUID();
    const completeCorrelation = randomUUID();
    const completed = await reactivateRecoveredIdentity({ idempotencyKey: completeKey }, { supabase: bound.client, correlationId: completeCorrelation });
    expect(completed.entityId).toBe(target.identityId);
    expect(await reactivateRecoveredIdentity({ idempotencyKey: completeKey }, { supabase: bound.client, correlationId: randomUUID() })).toEqual(completed);
    await f.assertReceipt(completed, target.identityId, completeKey, completeCorrelation);
    expect((await getRecoveryMfaContext({ supabase: bound.client }))?.state).toBe("completed");
    expect(await f.owner`SELECT status, floor(extract(epoch FROM authorization_not_before))::int AS fence
      FROM public.identities WHERE id = ${target.identityId}::uuid`).toEqual([{ status: "active", fence: contained!.fence }]);
    expect(await f.owner`SELECT state, expected_replacement_factor_id FROM public.identity_recovery_presence WHERE id = ${presence.receipt.entityId}::uuid`)
      .toEqual([{ state: "completed", expected_replacement_factor_id: factor.factorId }]);
    expect(await f.owner`SELECT id, status FROM auth.mfa_factors WHERE user_id = ${target.subjectId}::uuid`)
      .toEqual([{ id: factor.factorId, status: "verified" }]);
    await f.owner`SELECT mmhr_private.r1_assert_administration_capacity(clock_timestamp())`;
    expect(await privilegeSnapshot(f)).toEqual(privileges);
    const own = await bound.client.rpc("mmhr_get_my_identity");
    expect(own.error?.code ?? null).toBeNull();
    expect(own.data).toEqual([expect.objectContaining({ id: target.identityId })]);
    await assertNoOwnIdentity(bound.frozen);
    await assertNoOwnIdentity(target.elevated.frozen);
    await assertNoOwnIdentity(unbound.frozen);
    await assertNoPrivilegedRead(unbound.frozen);
    const raw = await bound.client.from("security_command_receipts").select("id");
    expect(raw.error?.code).toBe("42501");
    console.info("Real local recovery API flow passed with original assurance:", originalAssurance);
  } catch (error) { failure = error; throw error; }
  finally {
    try { await f.close(); }
    catch (cleanupError) {
      if (failure) throw new AggregateError([failure, cleanupError], "Recovery API test and scratch cleanup failed");
      throw cleanupError;
    }
  }
}, 600_000);
