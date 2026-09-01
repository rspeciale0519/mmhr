import { createHash, createHmac, pbkdf2Sync, randomBytes } from "node:crypto";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { expect } from "vitest";
import { z } from "zod";

import { securityUuidSchema } from "@/server/audit/security-values";
import type { RehearsalContext } from "./r1-migration-rehearsal";
import { intentSnapshot, type IntentFixture } from "./r1-identity-intent-fixtures";
import { securitySnapshot, type SecurityCommandFixture, type SecuritySql, type SecurityTransaction } from "./r1-security-command-fixtures";

export const workerAccessDenied = { code: "42501", message: "Identity intent worker access denied" };
export type IdentityWorker = { client: postgres.Sql; db: ReturnType<typeof drizzle>; loginName: string };
export type IdentityWorkerCase = {
  name: string;
  run(context: RehearsalContext, worker: IdentityWorker, foundation: SecurityCommandFixture): Promise<void>;
};

function assertWorkerScratch(context: RehearsalContext) {
  const address = new URL(context.databaseUrl);
  if (!/^mmhr-r1-worker[a-z]*-[0-9a-f]{8}$/.test(context.projectId)
    || address.hostname !== "127.0.0.1" || Number(address.port) !== context.ports.database
    || address.pathname !== "/postgres" || address.username !== "postgres"
    || [3000, 5432, 57022].includes(context.ports.database)) {
    throw new Error("Worker login changes require the exact disposable worker database");
  }
}

function scramVerifier(password: string) {
  const salt = randomBytes(16);
  const salted = pbkdf2Sync(password, salt, 4096, 32, "sha256");
  const clientKey = createHmac("sha256", salted).update("Client Key").digest();
  const stored = createHash("sha256").update(clientKey).digest("base64");
  const server = createHmac("sha256", salted).update("Server Key").digest("base64");
  return `SCRAM-SHA-256$4096:${salt.toString("base64")}$${stored}:${server}`;
}

export async function ownerWorkerMembership(sql: SecuritySql) {
  return sql`SELECT m.admin_option, m.inherit_option, m.set_option, g.rolname AS grantor
    FROM pg_auth_members m JOIN pg_roles g ON g.oid = m.grantor
    WHERE m.roleid = 'mmhr_worker'::regrole AND m.member = 'postgres'::regrole ORDER BY g.rolname`;
}

export async function openIdentityWorker(context: RehearsalContext): Promise<IdentityWorker> {
  assertWorkerScratch(context);
  const [owner] = await context.client`SELECT current_user AS role, session_user AS session`;
  expect(owner).toEqual({ role: "postgres", session: "postgres" });
  const originalMembership = await ownerWorkerMembership(context.client);
  expect(originalMembership).toHaveLength(1);
  expect(originalMembership[0]).toMatchObject({ admin_option: true, inherit_option: false, set_option: false });
  const loginName = `mmhr_worker_${randomBytes(16).toString("hex")}`;
  const credential = randomBytes(32).toString("base64url");
  // Only a SCRAM verifier reaches SQL. Neither credential is written or logged.
  try {
    await context.client`SELECT mmhr_private.r1_create_ephemeral_worker_login(
      ${loginName}, ${scramVerifier(credential)}, ${new Date(Date.now() + 9 * 60_000).toISOString()}::timestamptz)`;
  } catch {
    throw new Error("Disposable worker login provisioning failed");
  }
  const client = postgres({ host: "127.0.0.1", port: context.ports.database, database: "postgres",
    username: loginName, password: credential, max: 1, prepare: false, connect_timeout: 5,
  });
  // Match the production executor. Drizzle configures JSON serializers for its
  // already-encoded parameters; a native-only client would encode them twice.
  const worker = { client, db: drizzle(client), loginName };
  try {
    expect(await client`SELECT current_user AS role, session_user AS session`).toEqual([{ role: loginName, session: loginName }]);
    expect(await ownerWorkerMembership(context.client)).toEqual(originalMembership);
    return worker;
  } catch {
    await closeIdentityWorker(context, worker);
    throw new Error("Disposable worker connection validation failed");
  }
}

export async function closeIdentityWorker(context: RehearsalContext, worker: IdentityWorker) {
  assertWorkerScratch(context);
  if (!/^mmhr_worker_[0-9a-f]{32}$/.test(worker.loginName)) throw new Error("Unsafe worker cleanup name");
  const errors: unknown[] = [];
  try { await worker.client.end({ timeout: 3 }); } catch (error) { errors.push(error); }
  try {
    await context.client`SELECT mmhr_private.r1_disable_ephemeral_worker_login(${worker.loginName})`;
    await context.client`SELECT mmhr_private.r1_remove_ephemeral_worker_login(${worker.loginName})`;
    expect(await context.client`SELECT rolname FROM pg_roles WHERE rolname = ${worker.loginName}`).toHaveLength(0);
  } catch (error) { errors.push(error); }
  if (errors.length) throw new AggregateError(errors, "Disposable worker login cleanup failed");
}

const candidateRows = z.array(z.object({ intent_id: securityUuidSchema }).strict()).max(5);
export async function listIdentityCandidates(sql: SecuritySql) {
  const rows = await sql`SELECT * FROM mmhr_private.mmhr_list_identity_intent_candidates()`;
  const result = candidateRows.parse([...rows]).map((row) => row.intent_id);
  expect(new Set(result).size).toBe(result.length);
  return result;
}

export async function identityWorkerSnapshot(sql: SecuritySql) {
  return { ...await securitySnapshot(sql), ...await intentSnapshot(sql),
    authUsers: await sql`SELECT to_jsonb(u) AS row FROM auth.users u ORDER BY u.id`,
  };
}

export async function expectReadOnlyCandidates(context: RehearsalContext, worker: IdentityWorker, expected: readonly string[]) {
  const before = await identityWorkerSnapshot(context.client);
  expect(await listIdentityCandidates(worker.client)).toEqual(expected);
  expect(await listIdentityCandidates(worker.client)).toEqual(expected);
  expect(await identityWorkerSnapshot(context.client)).toEqual(before);
}

type PendingOptions = {
  createdAt?: string;
  nextAttemptAt?: string;
  manual?: boolean;
  correlationId?: string | null;
  idempotencyKey?: string;
};

export async function insertWorkerPending(sql: SecuritySql, fixture: IntentFixture, options: PendingOptions = {}) {
  const recovery = fixture.operation === "mfa_enrollment_reset" ? fixture : null;
  await sql`INSERT INTO public.identity_admin_intents
    (id, operation, target_identity_id, invitation_id, recovery_request_id, idempotency_key, correlation_id,
      initiated_by_identity_id, auth_subject_id, maximum_attempts, created_at, next_attempt_at, manual_review_required)
    VALUES (${fixture.intentId}::uuid, ${fixture.operation}::public.identity_intent_operation,
      ${recovery?.target.identityId ?? null}::uuid,
      ${fixture.operation === "invitation_delivery" ? fixture.invitationId : null}::uuid,
      ${recovery?.requestId ?? null}::uuid, ${options.idempotencyKey ?? fixture.idempotencyKey},
      ${options.correlationId === undefined ? fixture.correlationId : options.correlationId}::uuid,
      ${fixture.issuerId}::uuid, ${recovery?.subjectId ?? null}::uuid, ${fixture.maximumAttempts},
      coalesce(${options.createdAt ?? null}::timestamptz,clock_timestamp()),
      ${options.nextAttemptAt ?? null}::timestamptz, ${options.manual ?? false})`;
}

// Real logins cannot see another connection's uncommitted fixture rows. Commit
// synthetic inputs, then retire them without deleting history or changing ACLs.
export async function withIdentityWorkerFixtures<T extends { fixtures: IntentFixture[] }>(
  context: RehearsalContext,
  seed: (sql: SecurityTransaction) => Promise<T>,
  run: (value: T) => Promise<void>,
) {
  const { value } = await context.client.begin(async (sql) => ({ value: await seed(sql) }));
  try { await run(value); }
  finally {
    await context.client.begin(async (sql) => {
      for (const fixture of value.fixtures) {
        await sql`UPDATE public.identity_admin_intents SET state = 'cancelled', completed_at = clock_timestamp(), updated_at = clock_timestamp()
          WHERE id = ${fixture.intentId}::uuid AND state = 'pending'`;
        await sql`UPDATE public.identity_admin_intents SET manual_review_required = true, updated_at = clock_timestamp()
          WHERE id = ${fixture.intentId}::uuid AND state IN ('in_flight','outcome_unknown')`;
        if (fixture.operation === "invitation_delivery") {
          await sql`UPDATE public.invitations SET status = 'revoked', revoked_at = clock_timestamp(),
              revoked_by_identity_id = ${fixture.issuerId}::uuid, revoked_reason = 'Retire isolated worker fixture'
            WHERE id = ${fixture.invitationId}::uuid AND status = 'pending'`;
        } else {
          // Keep containment and its fence. A retired synthetic target never
          // returns to active status and cannot influence the next case.
          await sql`UPDATE public.identities SET status = 'suspended', suspended_at = clock_timestamp()
            WHERE id = ${fixture.target.identityId}::uuid AND status = 'recovery_pending'`;
        }
      }
    });
  }
}
