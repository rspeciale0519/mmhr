import { randomUUID } from "node:crypto";
import { expect } from "vitest";

import {
  asAuthenticated,
  completeBootstrap,
  createBootstrapPair,
  createSecurityPrincipal,
  denied,
  prepareBootstrap,
  restrictAuthSubject,
  securitySnapshot,
  type BootstrapPair,
  type ProviderRestriction,
  type SecurityTransaction,
} from "./r1-security-command-fixtures";

export async function verifyPreparedPair(sql: SecurityTransaction) {
  const pair = await createBootstrapPair(sql);
  const references = await prepareBootstrap(sql, pair);
  const [state] = await sql<{
    target_identity_id: string;
    second_target_identity_id: string;
    product_approval_reference: string;
    security_approval_reference: string;
    state: string;
    consumed_at: Date | null;
  }[]>`SELECT target_identity_id, second_target_identity_id,
    product_approval_reference, security_approval_reference, state, consumed_at
    FROM public.security_bootstrap_state`;
  expect(state).toEqual({
    target_identity_id: pair[0].identityId,
    second_target_identity_id: pair[1].identityId,
    product_approval_reference: references.product,
    security_approval_reference: references.security,
    state: "prepared", consumed_at: null,
  });
  const assignments = await sql`SELECT id FROM public.platform_role_assignments`;
  expect(assignments).toHaveLength(0);
  const identities = await sql<{ status: string }[]>`SELECT status FROM public.identities`;
  expect(identities.map((identity) => identity.status)).toEqual(["pending", "pending"]);
  return pair;
}

export async function verifyImmutablePreparation(sql: SecurityTransaction) {
  const pair = await createBootstrapPair(sql);
  await prepareBootstrap(sql, pair);
  const other = await createSecurityPrincipal(sql, "pending");
  const before = await securitySnapshot(sql);
  const mutations = [
    () => sql.savepoint((probe) => probe`UPDATE public.security_bootstrap_state
      SET target_identity_id = ${other.identityId}::uuid`),
    () => sql.savepoint((probe) => probe`UPDATE public.security_bootstrap_state
      SET second_target_identity_id = ${other.identityId}::uuid`),
    () => sql.savepoint((probe) => probe`UPDATE public.security_bootstrap_state
      SET product_approval_reference = 'different-product-reference'`),
    () => sql.savepoint((probe) => probe`UPDATE public.security_bootstrap_state
      SET security_approval_reference = 'different-security-reference'`),
    () => sql.savepoint((probe) => probe`UPDATE public.security_bootstrap_state
      SET prepared_at = prepared_at + interval '1 second'`),
    () => sql.savepoint((probe) => probe`DELETE FROM public.security_bootstrap_state`),
  ];
  for (const mutation of mutations) {
    await expect(mutation()).rejects.toMatchObject(denied);
    expect(await securitySnapshot(sql)).toEqual(before);
  }
  await expect(sql.savepoint((probe) => probe`TRUNCATE public.security_bootstrap_state`))
    .rejects.toMatchObject({ code: "P0001", message: "security_bootstrap_state is append-only" });
  expect(await securitySnapshot(sql)).toEqual(before);
}

export async function verifyBootstrapCompletesOnce(sql: SecurityTransaction) {
  const pair = await createBootstrapPair(sql);
  await prepareBootstrap(sql, pair);
  await completeBootstrap(sql, pair);
  const assignments = await sql<{ identity_id: string; role_key: string; state: string }[]>`
    SELECT identity_id, role_key, state FROM public.platform_role_assignments ORDER BY identity_id
  `;
  expect(assignments).toEqual(pair.map((principal) => ({
    identity_id: principal.identityId, role_key: "super_admin", state: "active",
  })).sort((left, right) => left.identity_id.localeCompare(right.identity_id)));
  const identities = await sql<{ status: string }[]>`SELECT status FROM public.identities`;
  expect(identities.map((identity) => identity.status)).toEqual(["active", "active"]);
  const [state] = await sql<{ state: string; valid_completion_time: boolean }[]>`
    SELECT state, consumed_at IS NOT NULL AND consumed_at >= prepared_at AS valid_completion_time
    FROM public.security_bootstrap_state
  `;
  expect(state!.state).toBe("consumed");
  expect(state!.valid_completion_time).toBe(true);
  const completionEvents = await sql<{ action: string; entity_type: string; entity_id: string }[]>`
    SELECT action, entity_type, entity_id FROM public.audit_events
    WHERE command = 'super_admin.bootstrap.complete' ORDER BY action, entity_id
  `;
  expect(completionEvents).toHaveLength(5);
  expect(completionEvents.filter((event) => event.action === "identity.status.change")
    .map((event) => event.entity_id).sort()).toEqual(pair.map((principal) => principal.identityId).sort());
  expect(completionEvents.filter((event) => event.action === "platform_role.assign")).toHaveLength(2);
  expect(completionEvents.filter((event) => event.action === "super_admin.bootstrap.consume")).toEqual([
    { action: "super_admin.bootstrap.consume", entity_type: "security_bootstrap", entity_id: "1" },
  ]);
  await sql`SELECT mmhr_private.r1_assert_administration_capacity(clock_timestamp())`;
  const beforeReplay = await securitySnapshot(sql);
  await expect(sql.savepoint((probe) => completeBootstrap(probe, pair))).rejects.toMatchObject(denied);
  await expect(sql.savepoint((probe) => prepareBootstrap(probe, pair))).rejects.toMatchObject(denied);
  expect(await securitySnapshot(sql)).toEqual(beforeReplay);
}

export async function verifyBootstrapAuditFailure(sql: SecurityTransaction) {
  const pair = await createBootstrapPair(sql);
  await prepareBootstrap(sql, pair);
  await sql`ALTER TABLE public.audit_events ADD CONSTRAINT r1_security_audit_failure_fixture
    CHECK (false) NOT VALID`;
  const before = await securitySnapshot(sql);
  await expect(sql.savepoint((probe) => completeBootstrap(probe, pair))).rejects.toMatchObject({
    code: "23514", constraint_name: "r1_security_audit_failure_fixture",
  });
  expect(await securitySnapshot(sql)).toEqual(before);
}

export async function verifyRestrictedPreparation(sql: SecurityTransaction, restriction: ProviderRestriction) {
  const pair = await createBootstrapPair(sql);
  await restrictAuthSubject(sql, pair[0], restriction);
  const before = await securitySnapshot(sql);
  await expect(sql.savepoint((probe) => prepareBootstrap(probe, pair))).rejects.toMatchObject(denied);
  expect(await securitySnapshot(sql)).toEqual(before);
}

export const invalidBootstrapStates = [
  "subject_mismatch", "session_mismatch", "expired_claim", "aal1_session",
  "expired_session", "unverified_factor", "missing_email_verification", "unreviewed_identity",
  "banned", "deleted", "anonymous",
] as const;

export async function verifyInvalidBootstrap(
  sql: SecurityTransaction,
  scenario: typeof invalidBootstrapStates[number],
) {
  const pair = await createBootstrapPair(sql);
  await prepareBootstrap(sql, pair);
  let requestedPair: BootstrapPair = pair;
  switch (scenario) {
    case "subject_mismatch":
      requestedPair = [{ ...pair[0], subject: pair[1].subject }, pair[1]];
      break;
    case "session_mismatch":
      requestedPair = [{ ...pair[0], sessionId: pair[1].sessionId }, pair[1]];
      break;
    case "expired_claim":
      requestedPair = [{ ...pair[0], expiresAt: new Date(Date.now() - 1_000) }, pair[1]];
      break;
    case "aal1_session":
      await sql`UPDATE auth.sessions SET aal = 'aal1' WHERE id = ${pair[0].sessionId}::uuid`;
      break;
    case "expired_session":
      await sql`UPDATE auth.sessions SET not_after = clock_timestamp() - interval '1 second'
        WHERE id = ${pair[0].sessionId}::uuid`;
      break;
    case "unverified_factor":
      await sql`UPDATE auth.mfa_factors SET status = 'unverified' WHERE id = ${pair[0].factorId}::uuid`;
      break;
    case "missing_email_verification":
      await sql`UPDATE public.identities SET email_verified_at = NULL
        WHERE id = ${pair[0].identityId}::uuid`;
      break;
    case "unreviewed_identity":
      await sql`UPDATE public.identities SET migration_review_required = true
        WHERE id = ${pair[0].identityId}::uuid`;
      break;
    case "banned":
    case "deleted":
    case "anonymous":
      await restrictAuthSubject(sql, pair[0], scenario);
      break;
  }
  const before = await securitySnapshot(sql);
  await expect(sql.savepoint((probe) => completeBootstrap(probe, requestedPair))).rejects.toMatchObject(denied);
  expect(await securitySnapshot(sql)).toEqual(before);
}

export async function verifyBootstrapDeniedToRuntime(sql: SecurityTransaction) {
  const pair = await createBootstrapPair(sql);
  await prepareBootstrap(sql, pair);
  await expect(asAuthenticated(sql, pair[0], (probe) => completeBootstrap(probe, pair)))
    .rejects.toMatchObject({ code: "42501" });
  const procedures = await sql<{ proname: string; anonymous: boolean; authenticated: boolean; worker: boolean }[]>`
    SELECT procedure.proname,
      has_function_privilege('anon', procedure.oid, 'EXECUTE') AS anonymous,
      has_function_privilege('authenticated', procedure.oid, 'EXECUTE') AS authenticated,
      has_function_privilege('mmhr_worker', procedure.oid, 'EXECUTE') AS worker
    FROM pg_proc AS procedure JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'mmhr_private'
      AND procedure.proname IN ('r1_prepare_super_admin_bootstrap', 'r1_complete_super_admin_bootstrap')
    ORDER BY procedure.proname
  `;
  expect(procedures).toEqual([
    { proname: "r1_complete_super_admin_bootstrap", anonymous: false, authenticated: false, worker: false },
    { proname: "r1_prepare_super_admin_bootstrap", anonymous: false, authenticated: false, worker: false },
  ]);
}

export async function verifyDuplicateBootstrapTargets(sql: SecurityTransaction) {
  const pair = await createBootstrapPair(sql);
  const before = await securitySnapshot(sql);
  await expect(sql.savepoint((probe) => prepareBootstrap(probe, [pair[0], pair[0]])))
    .rejects.toMatchObject(denied);
  const reference = `approval:${randomUUID()}`;
  await expect(sql.savepoint((probe) => prepareBootstrap(probe, pair, {
    product: reference, security: reference,
  }))).rejects.toMatchObject(denied);
  expect(await securitySnapshot(sql)).toEqual(before);
}
