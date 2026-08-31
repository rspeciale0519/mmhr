import { expect } from "vitest";

import type { RehearsalContext } from "./r1-migration-rehearsal";
import { recoveryInput, recoverySnapshot, requireRecoveryReceipt } from "./r1-recovery-command-fixtures";
import {
  createRecoveryMfaFixture, enrollSyntheticRecoveryFactor, readySyntheticRecovery,
  reactivateRecovery, registerRecoveryFactor, type RecoveryMfaFixture,
} from "./r1-recovery-mfa-fixtures";
import {
  asAuthenticated, deferred, denied, waitForGuardWait, type SecurityCommandFixture, type SecurityTransaction,
} from "./r1-security-command-fixtures";
import type { SecurityReceipt } from "./r1-security-command-permission-fixtures";

type Operation = "registration" | "reactivation";
type ReadyFixture = RecoveryMfaFixture & { factorId: string };
export type ConcurrentMfaCase = { name: string; run(context: RehearsalContext, foundation: SecurityCommandFixture): Promise<void> };

async function withFixture(
  context: RehearsalContext, foundation: SecurityCommandFixture, operation: Operation,
  run: (fixture: ReadyFixture) => Promise<void>,
) {
  const fixture = await context.client.begin(async (sql) => {
    if (operation === "reactivation") return readySyntheticRecovery(sql, foundation);
    const f = await createRecoveryMfaFixture(sql, foundation);
    return { ...f, factorId: await enrollSyntheticRecoveryFactor(sql, f) };
  });
  try { await run(fixture); }
  finally {
    // A failed race deliberately leaves this synthetic target contained. Use
    // its permitted emergency terminal state before the next isolated case.
    await context.client`UPDATE public.identities SET status = 'suspended', suspended_at = clock_timestamp(), updated_at = clock_timestamp()
      WHERE id = ${fixture.target.identityId}::uuid AND status = 'recovery_pending'`;
  }
}

function execute(sql: SecurityTransaction, fixture: ReadyFixture, operation: Operation, input = recoveryInput()) {
  return asAuthenticated(sql, fixture.target, (caller) => operation === "registration"
    ? registerRecoveryFactor(caller, fixture.factorId, input) : reactivateRecovery(caller, input),
  operation === "registration" ? "aal1" : "aal2");
}

async function holderWins(
  context: RehearsalContext, fixture: ReadyFixture, operation: Operation,
  hold: (sql: SecurityTransaction) => Promise<void>, changedProviderTable?: string,
) {
  const before = await recoverySnapshot(context.client);
  const held = deferred<SecurityTransaction>();
  const release = deferred<void>();
  const waitingBackend = deferred<number>();
  const holder = context.client.begin(async (sql) => {
    await hold(sql);
    held.resolve(sql);
    await release.promise;
  });
  void holder.catch(held.reject);
  const heldSql = await held.promise;
  const writer = context.client.begin(async (sql) => {
    const [backend] = await sql<{ id: number }[]>`SELECT pg_backend_pid() AS id`;
    waitingBackend.resolve(backend!.id);
    return execute(sql, fixture, operation);
  });
  void writer.catch(waitingBackend.reject);
  try { await waitForGuardWait(heldSql, await waitingBackend.promise); }
  finally {
    release.resolve();
    await holder;
    await expect(writer).rejects.toMatchObject(denied);
  }
  const after = await recoverySnapshot(context.client);
  if (changedProviderTable) { delete before[changedProviderTable]; delete after[changedProviderTable]; }
  expect(after).toEqual(before);
}

export const recoveryMfaConcurrencyCases: ConcurrentMfaCase[] = [
  ...(["registration", "reactivation"] as const).map((operation): ConcurrentMfaCase => ({
    name: `serializes duplicate ${operation} and returns the original receipt and correlation`,
    async run(context, foundation) {
      await withFixture(context, foundation, operation, async (f) => {
        const input = recoveryInput();
        const firstReady = deferred<{ sql: SecurityTransaction; receipt: SecurityReceipt }>();
        const releaseFirst = deferred<void>();
        const secondReady = deferred<number>();
        const first = context.client.begin(async (sql) => {
          const receipt = await execute(sql, f, operation, input);
          firstReady.resolve({ sql, receipt });
          await releaseFirst.promise;
          return receipt;
        });
        void first.catch(firstReady.reject);
        const holding = await firstReady.promise;
        const second = context.client.begin(async (sql) => {
          const [backend] = await sql<{ id: number }[]>`SELECT pg_backend_pid() AS id`;
          secondReady.resolve(backend!.id);
          return execute(sql, f, operation, { ...input, correlationId: recoveryInput().correlationId });
        });
        void second.catch(secondReady.reject);
        try { await waitForGuardWait(holding.sql, await secondReady.promise); }
        finally { releaseFirst.resolve(); }
        expect(await first).toEqual(holding.receipt);
        expect(await second).toEqual(holding.receipt);
        const command = operation === "registration" ? "identity.recovery.factor.register" : "identity.recovery.reactivate";
        await requireRecoveryReceipt(context.client, f.target, holding.receipt, input, command);
        expect(await context.client`SELECT id FROM public.security_command_receipts WHERE actor_identity_id = ${f.target.identityId}::uuid
          AND command = ${command} AND idempotency_key = ${input.idempotencyKey}::uuid`).toHaveLength(1);
      });
    },
  })),
  ...(["registration", "reactivation"] as const).map((operation): ConcurrentMfaCase => ({
    name: `denies ${operation} after a concurrent extra factor commits first`,
    async run(context, foundation) {
      await withFixture(context, foundation, operation, async (f) => {
        await holderWins(context, f, operation, async (sql) => {
          await enrollSyntheticRecoveryFactor(sql, f);
        }, "auth.mfa_factors");
      });
    },
  })),
  ...(["session deletion", "factor downgrade", "provider ban"] as const).map((change): ConcurrentMfaCase => ({
    name: `rechecks ${change} after the current provider-row lock releases`,
    async run(context, foundation) {
      await withFixture(context, foundation, "reactivation", async (f) => {
        await holderWins(context, f, "reactivation", async (sql) => {
          if (change === "session deletion") await sql`DELETE FROM auth.sessions WHERE id = ${f.target.sessionId}::uuid`;
          if (change === "factor downgrade") await sql`UPDATE auth.mfa_factors SET status = 'unverified' WHERE id = ${f.factorId}::uuid`;
          if (change === "provider ban") await sql`UPDATE auth.users SET banned_until = clock_timestamp() + interval '1 hour'
            WHERE id = ${f.target.subject}::uuid`;
        }, change === "session deletion" ? "auth.sessions" : change === "factor downgrade" ? "auth.mfa_factors" : undefined);
      });
    },
  })),
  {
    name: "holds the target Auth user lock through completion so a later enrollment commits afterward",
    async run(context, foundation) {
      await withFixture(context, foundation, "reactivation", async (f) => {
        const completeReady = deferred<SecurityTransaction>();
        const releaseCompletion = deferred<void>();
        const enrollmentReady = deferred<number>();
        const completing = context.client.begin(async (sql) => {
          await execute(sql, f, "reactivation");
          completeReady.resolve(sql);
          await releaseCompletion.promise;
          expect(await sql`SELECT id FROM auth.mfa_factors WHERE user_id = ${f.target.subject}::uuid`).toHaveLength(1);
        });
        void completing.catch(completeReady.reject);
        const holding = await completeReady.promise;
        const enrolling = context.client.begin(async (sql) => {
          const [backend] = await sql<{ id: number }[]>`SELECT pg_backend_pid() AS id`;
          enrollmentReady.resolve(backend!.id);
          await enrollSyntheticRecoveryFactor(sql, f);
        });
        void enrolling.catch(enrollmentReady.reject);
        try { await waitForGuardWait(holding, await enrollmentReady.promise); }
        finally { releaseCompletion.resolve(); }
        await completing;
        await enrolling;
        expect(await context.client`SELECT status FROM public.identities WHERE id = ${f.target.identityId}::uuid`).toEqual([{ status: "active" }]);
        expect(await context.client`SELECT id FROM auth.mfa_factors WHERE user_id = ${f.target.subject}::uuid`).toHaveLength(2);
      });
    },
  },
  ...(["repeatable read", "serializable"] as const).flatMap((isolation) =>
    (["registration", "reactivation"] as const).map((operation): ConcurrentMfaCase => ({
      name: `denies ${operation} in a ${isolation} transaction before any write`,
      async run(context, foundation) {
        await withFixture(context, foundation, operation, async (f) => {
          const before = await recoverySnapshot(context.client);
          await expect(context.client.begin(`isolation level ${isolation}`, (sql) => execute(sql, f, operation)))
            .rejects.toMatchObject(denied);
          expect(await recoverySnapshot(context.client)).toEqual(before);
        });
      },
    }))),
];
