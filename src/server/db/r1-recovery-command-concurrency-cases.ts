import { expect } from "vitest";

import { asWorker, claimIntent, prepareRecoveryPolicy } from "./r1-identity-intent-fixtures";
import type { RehearsalContext } from "./r1-migration-rehearsal";
import {
  asAuthenticated, createSecurityPrincipal, deferred, denied, waitForGuardWait,
  type SecurityCommandFixture, type SecurityTransaction,
} from "./r1-security-command-fixtures";
import {
  confirmedPhoneCheck, createPublicRecovery, decideRecovery, endRecovery,
  recoveryInput, requireRecoveryReceipt,
} from "./r1-recovery-command-fixtures";

async function prepareConcurrentRequest(
  context: RehearsalContext, foundation: SecurityCommandFixture, approve: boolean,
) {
  return context.client.begin(async (sql) => {
    const policy = await sql`SELECT singleton_key FROM mmhr_private.recovery_policy_state`;
    if (!policy.length) await prepareRecoveryPolicy(sql, foundation);
    const target = await createSecurityPrincipal(sql);
    const fixture = await createPublicRecovery(sql, foundation, target);
    const decision = await confirmedPhoneCheck(sql);
    if (approve) {
      await asAuthenticated(sql, foundation.pair[1], (caller) => decideRecovery(caller, fixture.request.entity_id, decision));
    }
    const [intent] = await sql<{ id: string }[]>`SELECT id FROM public.identity_admin_intents
      WHERE recovery_request_id = ${fixture.request.entity_id}::uuid`;
    return { ...fixture, decision, intentId: intent?.id };
  });
}

export async function verifyConcurrentRecoveryApproval(
  context: RehearsalContext, foundation: SecurityCommandFixture, sameKey: boolean,
) {
  const fixture = await prepareConcurrentRequest(context, foundation, false);
  const inputs = [recoveryInput(), recoveryInput()];
  if (sameKey) inputs[1] = inputs[0]!;
  const results = await Promise.allSettled(inputs.map((input) => context.client.begin((sql) =>
    asAuthenticated(sql, foundation.pair[1], (caller) => decideRecovery(caller, fixture.request.entity_id, fixture.decision, input)))));
  const succeeded = results.filter((result) => result.status === "fulfilled");
  expect(succeeded).toHaveLength(sameKey ? 2 : 1);
  if (sameKey) expect(succeeded[0]!.value).toEqual(succeeded[1]!.value);
  else {
    const rejected = results.filter((result) => result.status === "rejected");
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.reason).toMatchObject(denied);
  }
  const winner = results.findIndex((result) => result.status === "fulfilled");
  await requireRecoveryReceipt(context.client, foundation.pair[1], succeeded[0]!.value,
    inputs[winner]!, "identity.recovery.decide", "identity.recovery.approve");
  expect(await context.client`SELECT id FROM public.identity_recovery_approvals WHERE request_id = ${fixture.request.entity_id}::uuid`).toHaveLength(1);
  expect(await context.client`SELECT id FROM public.identity_admin_intents WHERE recovery_request_id = ${fixture.request.entity_id}::uuid`).toHaveLength(1);
  expect(await context.client`SELECT id FROM public.audit_events WHERE action = 'identity.recovery.approve'
    AND entity_id = ${fixture.request.entity_id}`).toHaveLength(1);
  await context.client.begin((sql) => asAuthenticated(sql, foundation.pair[0], (caller) => endRecovery(caller, fixture.request.entity_id, "cancelled")));
}

export async function verifyRecoveryCancellationDispatchRace(
  context: RehearsalContext, foundation: SecurityCommandFixture, winner: "cancel" | "dispatch",
) {
  const fixture = await prepareConcurrentRequest(context, foundation, true);
  expect(fixture.intentId).toBeTypeOf("string");
  const holding = deferred<SecurityTransaction>();
  const release = deferred<void>();
  const waitingBackend = deferred<number>();
  const cancelInput = recoveryInput();
  const cancel = (sql: SecurityTransaction) => asAuthenticated(sql, foundation.pair[0],
    (caller) => endRecovery(caller, fixture.request.entity_id, "cancelled", cancelInput));
  const dispatch = (sql: SecurityTransaction) => asWorker(sql, (worker) => claimIntent(worker, fixture.intentId!));
  const first = context.client.begin(async (sql) => {
    await sql`SELECT mmhr_private.r1_lock_security()`;
    const result = winner === "cancel" ? await cancel(sql) : await dispatch(sql);
    holding.resolve(sql);
    await release.promise;
    return { result };
  });
  void first.catch(holding.reject);
  const holdingSql = await holding.promise;
  const second = context.client.begin(async (sql) => {
    const [backend] = await sql<{ id: number }[]>`SELECT pg_backend_pid() AS id`;
    waitingBackend.resolve(backend!.id);
    return { result: winner === "cancel" ? await dispatch(sql) : await cancel(sql) };
  });
  void second.catch(waitingBackend.reject);
  try {
    await waitForGuardWait(holdingSql, await waitingBackend.promise);
  } finally {
    release.resolve();
    await first;
  }
  if (winner === "cancel") expect((await second).result).toBeNull();
  else await expect(second).rejects.toMatchObject(denied);

  const [state] = await context.client<{ request: string; presence: string; intent: string; identity: string;
    attempt_count: number; dispatch_count: number }[]>`
    SELECT r.state AS request, p.state AS presence, i.state AS intent, target.status AS identity,
      i.attempt_count, i.dispatch_count FROM public.identity_recovery_requests r
    JOIN public.identity_recovery_presence p ON p.id = r.recovery_presence_id
    JOIN public.identity_admin_intents i ON i.recovery_request_id = r.id
    JOIN public.identities target ON target.id = r.target_identity_id WHERE r.id = ${fixture.request.entity_id}::uuid`;
  expect(state).toEqual(winner === "cancel"
    ? { request: "cancelled", presence: "cancelled", intent: "cancelled", identity: "active", attempt_count: 0, dispatch_count: 0 }
    : { request: "approved", presence: "linked", intent: "in_flight", identity: "recovery_pending", attempt_count: 1, dispatch_count: 1 });
  const attempts = await context.client`SELECT id FROM public.identity_intent_attempts WHERE intent_id = ${fixture.intentId!}::uuid`;
  expect(attempts).toHaveLength(winner === "cancel" ? 0 : 1);
  const cancelReceipts = await context.client`SELECT id FROM public.security_command_receipts WHERE idempotency_key = ${cancelInput.idempotencyKey}::uuid`;
  expect(cancelReceipts).toHaveLength(winner === "cancel" ? 1 : 0);
  const cancelAudits = await context.client`SELECT id FROM public.audit_events
    WHERE action = 'identity.recovery.cancel' AND entity_id = ${fixture.request.entity_id}`;
  expect(cancelAudits).toHaveLength(winner === "cancel" ? 1 : 0);
}
