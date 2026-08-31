import { expect } from "vitest";

import type { RehearsalContext } from "./r1-migration-rehearsal";
import {
  asAuthenticated,
  changeIdentityStatus,
  commandInput,
  createSecurityPrincipal,
  deferred,
  denied,
  waitForGuardWait,
  type SecurityCommandFixture,
  type SecurityTransaction,
} from "./r1-security-command-fixtures";

export async function verifyStaleSecurityWriter(context: RehearsalContext, fixture: SecurityCommandFixture) {
  const captured = deferred<void>();
  const release = deferred<void>();
  const stale = context.client.begin("isolation level repeatable read", async (sql) => {
    await sql`SELECT revision FROM mmhr_private.security_authority_guard WHERE singleton_key = 1`;
    captured.resolve();
    await release.promise;
    await asAuthenticated(sql, fixture.pair[0], (probe) => changeIdentityStatus(
      probe, fixture.target.identityId, "suspended", commandInput(),
    ));
  });
  void stale.catch(captured.reject);
  try {
    await captured.promise;
    await context.client.begin((sql) => sql`SELECT mmhr_private.r1_lock_security()`);
  } finally {
    release.resolve();
  }
  await expect(stale).rejects.toMatchObject({ code: "40001" });
  const [target] = await context.client<{ status: string }[]>`
    SELECT status FROM public.identities WHERE id = ${fixture.target.identityId}::uuid
  `;
  expect(target!.status).toBe("active");
}

export async function verifyFreshAuthorityAfterWait(context: RehearsalContext, fixture: SecurityCommandFixture) {
  const actor = await context.client.begin(async (sql) => {
    const principal = await createSecurityPrincipal(sql);
    await sql`
      INSERT INTO public.platform_role_assignments (identity_id, role_key, assigned_by_identity_id, assignment_reason)
      VALUES (${principal.identityId}::uuid, 'super_admin', ${fixture.pair[0].identityId}::uuid,
        'Isolated waiting actor fixture')
    `;
    return principal;
  });
  const writerReady = deferred<SecurityTransaction>();
  const releaseWriter = deferred<void>();
  const readerReady = deferred<number>();
  const writer = context.client.begin(async (sql) => {
    await sql`SELECT mmhr_private.r1_lock_security()`;
    await sql`UPDATE public.identities SET status = 'suspended', suspended_at = clock_timestamp()
      WHERE id = ${actor.identityId}::uuid`;
    writerReady.resolve(sql);
    await releaseWriter.promise;
  });
  void writer.catch(writerReady.reject);
  const holdingTransaction = await writerReady.promise;
  const input = commandInput();
  const reader = context.client.begin(async (sql) => {
    const [backend] = await sql<{ id: number }[]>`SELECT pg_backend_pid() AS id`;
    readerReady.resolve(backend!.id);
    return asAuthenticated(sql, actor, (probe) => changeIdentityStatus(
      probe, fixture.target.identityId, "suspended", input,
    ));
  });
  void reader.catch(readerReady.reject);
  try {
    await waitForGuardWait(holdingTransaction, await readerReady.promise);
  } finally {
    releaseWriter.resolve();
    await writer;
  }
  await expect(reader).rejects.toMatchObject(denied);
  const [target] = await context.client<{ status: string }[]>`
    SELECT status FROM public.identities WHERE id = ${fixture.target.identityId}::uuid
  `;
  expect(target!.status).toBe("active");
  const receipts = await context.client`SELECT id FROM public.security_command_receipts
    WHERE idempotency_key = ${input.idempotencyKey}::uuid`;
  const events = await context.client`SELECT id FROM public.audit_events
    WHERE idempotency_key = ${input.idempotencyKey}`;
  expect(receipts).toHaveLength(0);
  expect(events).toHaveLength(0);
}

export async function verifyAuthorizationTimeAfterWait(context: RehearsalContext) {
  const writerReady = deferred<SecurityTransaction>();
  const releaseWriter = deferred<void>();
  const readerReady = deferred<number>();
  const writer = context.client.begin(async (sql) => {
    await sql`SELECT mmhr_private.r1_lock_security()`;
    writerReady.resolve(sql);
    await releaseWriter.promise;
  });
  void writer.catch(writerReady.reject);
  const holdingTransaction = await writerReady.promise;
  const reader = context.client.begin(async (sql) => {
    const [backend] = await sql<{ id: number }[]>`SELECT pg_backend_pid() AS id`;
    readerReady.resolve(backend!.id);
    const [time] = await sql<{ authorized_at: string }[]>`
      SELECT floor(extract(epoch FROM mmhr_private.r1_lock_security()) * 1000000)::text AS authorized_at
    `;
    return time!.authorized_at;
  });
  void reader.catch(readerReady.reject);
  let releasedAt: string;
  try {
    await waitForGuardWait(holdingTransaction, await readerReady.promise);
    const [clock] = await holdingTransaction<{ released_at: string }[]>`
      SELECT floor(extract(epoch FROM clock_timestamp()) * 1000000)::text AS released_at
    `;
    releasedAt = clock!.released_at;
  } finally {
    releaseWriter.resolve();
    await writer;
  }
  expect(BigInt(await reader) >= BigInt(releasedAt)).toBe(true);
}

export async function verifyConcurrentCommandRetry(context: RehearsalContext, fixture: SecurityCommandFixture) {
  const target = await createSecurityPrincipal(context.client);
  const input = commandInput();
  const invoke = () => context.client.begin((sql) => asAuthenticated(sql, fixture.pair[0], (probe) =>
    changeIdentityStatus(probe, target.identityId, "suspended", input)));
  const [first, second] = await Promise.all([invoke(), invoke()]);
  expect(second).toEqual(first);
  const receipts = await context.client<{ actor_identity_id: string; entity_id: string; audit_event_id: string }[]>`
    SELECT actor_identity_id, entity_id, audit_event_id FROM public.security_command_receipts
    WHERE idempotency_key = ${input.idempotencyKey}::uuid
  `;
  expect(receipts).toHaveLength(1);
  expect(receipts[0]).toMatchObject({ actor_identity_id: fixture.pair[0].identityId, entity_id: target.identityId });
  const events = await context.client<{ id: string }[]>`SELECT id FROM public.audit_events
    WHERE idempotency_key = ${input.idempotencyKey}`;
  expect(events).toEqual([{ id: receipts[0]!.audit_event_id }]);
  const [identity] = await context.client<{ status: string }[]>`
    SELECT status FROM public.identities WHERE id = ${target.identityId}::uuid
  `;
  expect(identity!.status).toBe("suspended");
}
