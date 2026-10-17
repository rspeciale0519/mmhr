import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { applyAllMigrations, applyMigrationsBeforeRfpNotifications, startRehearsal, stopRehearsal, type RehearsalContext } from "./r1-migration-rehearsal";
import { asAuthenticated, createCommandFixture, rollbackCase, type SecurityCommandFixture, type SecurityPrincipal, type SecurityTokenPrincipal, type SecurityTransaction } from "./r1-security-command-fixtures";
import { seedQuoteWorkflow } from "./test/r6-proposal-quote-fixtures";
import { notificationClaimSchema, notificationCommandResultSchema, notificationQueueSchema, notificationRecipientsSchema } from "@/server/workflows/rfp-notification-contract";
import { createSecurityCommandApiFixtures, elevatedClient, verifiedApiClaims, type SecurityApiPrincipal, type SecurityCommandApiFixtures } from "@/server/auth/security-command-api-fixtures";
import { AuthorizationError, type RequestSupabaseClient } from "@/server/auth/authorization";
import { getRfpNotificationRecipients, getRfpNotificationStatus, queueRfpNotification, retryRfpNotification } from "@/server/commands/rfp-notifications";

type Target = Awaited<ReturnType<typeof seedQuoteWorkflow>>;
async function publicHistory(context: RehearsalContext) {
  const tables = await context.client<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`;
  const snapshot: Record<string, unknown[]> = {};
  for (const table of tables) {
    const rows = await context.client<{ row: unknown }[]>`SELECT to_jsonb(record) row FROM public.${context.client(table.tablename)} record ORDER BY to_jsonb(record)::text`;
    snapshot[table.tablename] = rows.map(row => row.row);
  }
  return snapshot;
}
async function request(sql: SecurityTransaction, actor: SecurityTokenPrincipal, name: string, payload: object,
  correlationId = randomUUID(), key: string | undefined = undefined, assurance: "aal1" | "aal2" = "aal2") {
  return asAuthenticated(sql, actor, async runtime => {
    const [row] = key
      ? await runtime<{ result: unknown }[]>`SELECT public.${runtime(name)}(${JSON.stringify(payload)}::jsonb,${correlationId}::uuid,${key}::uuid) AS result`
      : await runtime<{ result: unknown }[]>`SELECT public.${runtime(name)}(${JSON.stringify(payload)}::jsonb,${correlationId}::uuid) AS result`;
    return row!.result;
  }, assurance);
}
async function worker<T>(sql: SecurityTransaction, operation: (runtime: SecurityTransaction) => Promise<T>) {
  return sql.savepoint(async runtime => {
    await runtime`SET LOCAL ROLE mmhr_rfp_notification_worker`;
    const result = await operation(runtime); await runtime`RESET ROLE`; return result;
  });
}
async function claim(sql: SecurityTransaction, id: string) {
  return worker(sql, async runtime => {
    const [row] = await runtime<{ result: unknown }[]>`SELECT mmhr_private.r4_claim_rfp_notification(${id}::uuid) result`;
    return row!.result === null ? null : notificationClaimSchema.parse(row!.result);
  });
}
async function finish(sql: SecurityTransaction, lease: NonNullable<Awaited<ReturnType<typeof claim>>>, result: object, token = lease.token) {
  return worker(sql, async runtime => {
    const [row] = await runtime<{ recorded: boolean }[]>`SELECT mmhr_private.r4_record_rfp_notification_result(
      ${lease.notificationId}::uuid,${lease.attemptId}::uuid,${token},${JSON.stringify(result)}::jsonb) recorded`;
    return row!.recorded;
  });
}
async function eligible(sql: SecurityTransaction, fixture: SecurityCommandFixture, target: Target) {
  const [rfp] = await sql<{ rfp_id: string }[]>`SELECT r.rfp_id FROM public.rfp_versions r JOIN public.rfp_recipients rr ON rr.rfp_version_id=r.id
    WHERE rr.id=${target.vendors[0]!.recipientId}::uuid`;
  const scope = { organizationId: fixture.organizationId, rfpId: rfp!.rfp_id, version: 1 };
  const page = notificationRecipientsSchema.parse(await request(sql, fixture.pair[0], "mmhr_get_rfp_notification_recipients", scope));
  const expected = target.vendors.flatMap(vendor => [
    { recipientId: vendor.recipientId, recipientIdentityId: vendor.actor.identityId },
    { recipientId: vendor.recipientId, recipientIdentityId: fixture.organizationAdmin.identityId },
  ]);
  expect(page.items).toHaveLength(expected.length);
  expect(page.items.map(item => ({ recipientId: item.recipientId, recipientIdentityId: item.recipientIdentityId })))
    .toEqual(expect.arrayContaining(expected));
  return { scope, recipient: page.items.find(item => item.recipientId === target.vendors[0]!.recipientId
    && item.recipientIdentityId === target.vendors[0]!.actor.identityId)! };
}
async function queued(sql: SecurityTransaction, fixture: SecurityCommandFixture, target: Target) {
  const { scope, recipient } = await eligible(sql, fixture, target);
  const payload = { ...scope, notificationId: randomUUID(), recipientId: recipient.recipientId,
    membershipId: recipient.membershipId, expectedSourceDigest: recipient.sourceDigest };
  const correlationId = randomUUID(), key = randomUUID();
  const result = notificationCommandResultSchema.parse(await request(sql, fixture.pair[0], "mmhr_queue_rfp_notification", payload, correlationId, key));
  return { scope, recipient, payload, correlationId, key, result };
}

describe("RFP notification private source, leases, retries, and original receipts", () => {
  let context: RehearsalContext, fixture: SecurityCommandFixture, target: Target;
  let beforeMigration: Awaited<ReturnType<typeof publicHistory>>, afterMigration: typeof beforeMigration;
  beforeAll(async () => {
    context = await startRehearsal("r4-notification"); await applyMigrationsBeforeRfpNotifications(context);
    await context.client.begin(async sql => { fixture = await createCommandFixture(sql); target = await seedQuoteWorkflow(sql, fixture); });
    beforeMigration = await publicHistory(context);
    await applyAllMigrations(context);
    afterMigration = await publicHistory(context);
    // This grant exists only on the owned disposable test stack. Production
    // migrations create no login or role membership for this disabled worker.
    await context.client`GRANT mmhr_rfp_notification_worker TO postgres WITH ADMIN FALSE, INHERIT FALSE, SET TRUE`;
  }, 420000);
  afterAll(async () => { if (context) await stopRehearsal(context); }, 180000);
  test("preserves every public history row while applying the additive outbox migration", async () => {
    await expect(applyMigrationsBeforeRfpNotifications({ ...context })).rejects.toThrow("An active owned notification database rehearsal is required");
    // Later migrations add public tables. Every earlier table must keep its exact
    // rows, and no added table may receive a row from the migration chain.
    expect(Object.fromEntries(Object.keys(beforeMigration).map(name => [name, afterMigration[name]]))).toEqual(beforeMigration);
    expect(Object.entries(afterMigration).filter(([name, rows]) => !(name in beforeMigration) && rows.length > 0)).toEqual([]);
    expect(beforeMigration.rfp_versions?.length).toBeGreaterThan(0);
    expect(beforeMigration.audit_events?.length).toBeGreaterThan(0);
  });
  test("creates only private RLS tables and a restricted NOLOGIN worker with fixed functions", async () => {
    const tables = await context.client<{ tablename: string; rowsecurity: boolean }[]>`SELECT tablename,rowsecurity FROM pg_tables
      WHERE schemaname='mmhr_private' AND tablename LIKE 'rfp_notification_%' ORDER BY tablename`;
    expect(tables).toEqual(["rfp_notification_attempts", "rfp_notification_outbox", "rfp_notification_receipts"].map(tablename => ({ tablename, rowsecurity: true })));
    const [role] = await context.client`SELECT rolcanlogin,rolinherit,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls FROM pg_roles WHERE rolname='mmhr_rfp_notification_worker'`;
    expect(Object.values(role!)).toEqual(Array(7).fill(false));
    const functions = await context.client<{ name: string }[]>`SELECT p.proname name FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='mmhr_private' AND has_function_privilege('mmhr_rfp_notification_worker',p.oid,'EXECUTE') ORDER BY p.proname`;
    expect(functions.map(row => row.name)).toEqual(["r4_claim_rfp_notification", "r4_get_rfp_notification_dispatch", "r4_record_rfp_notification_result"]);
  });
  test("freezes a verified exact portal delivery and never stores questionnaire text in notification content", async () => rollbackCase(context, async sql => {
    const saved = await queued(sql, fixture, target);
    const [row] = await sql`SELECT recipient_email,subject,body,source_snapshot FROM mmhr_private.rfp_notification_outbox WHERE id=${saved.result.notificationId}::uuid`;
    expect(row!.recipient_email).toBe(saved.recipient.recipientEmail);
    expect(row!.body).not.toContain("Describe payroll support"); expect(row!.source_snapshot).not.toHaveProperty("sections");
    await expect(sql.savepoint(async probe => { await probe`UPDATE mmhr_private.rfp_notification_outbox SET recipient_email='foreign@example.invalid' WHERE id=${saved.result.notificationId}::uuid`; })).rejects.toMatchObject({ code: "42501" });
    await expect(sql.savepoint(async probe => { await probe`DELETE FROM mmhr_private.rfp_notification_outbox WHERE id=${saved.result.notificationId}::uuid`; })).rejects.toMatchObject({ code: "42501" });
  }), 120000);
  test("filters ineligible members before applying the recipient limit", async () => rollbackCase(context, async sql => {
    const initial = await eligible(sql, fixture, target);
    const [first] = await sql<{ vendor_organization_id: string }[]>`SELECT vendor_organization_id FROM public.rfp_recipients
      WHERE organization_id=${fixture.organizationId}::uuid ORDER BY id LIMIT 1`;
    await sql`WITH pending AS (INSERT INTO public.identities(status,migration_review_required)
      SELECT 'pending',false FROM generate_series(1,101) RETURNING id), numbered AS (SELECT id,row_number() OVER(ORDER BY id) sequence FROM pending)
      INSERT INTO public.org_members(id,org_id,identity_id,role,role_key,migration_review_required)
      SELECT ('00000000-0000-4000-8000-'||lpad(sequence::text,12,'0'))::uuid,${first!.vendor_organization_id}::uuid,id,'contributor','contributor',false FROM numbered`;
    const page = notificationRecipientsSchema.parse(await request(sql, fixture.pair[0], "mmhr_get_rfp_notification_recipients", initial.scope));
    expect(page.items).toHaveLength(4);
    expect(page.items.map(item => `${item.recipientId}:${item.recipientIdentityId}`).sort()).toEqual(target.vendors
      .flatMap(item => [`${item.recipientId}:${item.actor.identityId}`, `${item.recipientId}:${fixture.organizationAdmin.identityId}`]).sort());
  }), 120000);
  test("returns the original queued receipt after acceptance and rejects changed request or correlation", async () => rollbackCase(context, async sql => {
    const saved = await queued(sql, fixture, target), lease = (await claim(sql, saved.result.notificationId))!;
    expect(await finish(sql, lease, { outcome: "accepted", providerMessageId: "synthetic-provider-1" })).toBe(true);
    const replay = await request(sql, fixture.pair[0], "mmhr_queue_rfp_notification", saved.payload, saved.correlationId, saved.key);
    expect(replay).toEqual({ ...saved.result, outcomeCode: "replayed" });
    for (const [payload, correlation] of [[{ ...saved.payload, membershipId: randomUUID() }, saved.correlationId], [saved.payload, randomUUID()]] as const)
      await expect(request(sql, fixture.pair[0], "mmhr_queue_rfp_notification", payload, correlation, saved.key)).rejects.toMatchObject({ code: "22023" });
    const [events] = await sql`SELECT count(*)::int count FROM public.audit_events WHERE action='notification.queue' AND entity_id=${saved.result.notificationId}`;
    expect(events!.count).toBe(1);
  }), 120000);
  test("allows only definite pre-dispatch failure retries with original immutable action receipts", async () => rollbackCase(context, async sql => {
    const saved = await queued(sql, fixture, target), lease = (await claim(sql, saved.result.notificationId))!;
    expect(await finish(sql, lease, { outcome: "failed", failureCode: "rate_limited_pre_dispatch" })).toBe(true);
    const retry = { ...saved.scope, notificationId: saved.result.notificationId, expectedRevision: 3 }, key = randomUUID(), correlation = randomUUID();
    const result = notificationCommandResultSchema.parse(await request(sql, fixture.pair[0], "mmhr_retry_rfp_notification", retry, correlation, key));
    expect(result).toMatchObject({ revision: 4, state: "queued", action: "retry" });
    const next = (await claim(sql, saved.result.notificationId))!; expect(next.attemptNumber).toBe(2);
    await finish(sql, next, { outcome: "accepted", providerMessageId: "synthetic-provider-2" });
    expect(await request(sql, fixture.pair[0], "mmhr_retry_rfp_notification", retry, correlation, key)).toEqual({ ...result, outcomeCode: "replayed" });
    await expect(request(sql, fixture.pair[0], "mmhr_retry_rfp_notification", { ...retry, expectedRevision: 6 }, randomUUID(), randomUUID())).rejects.toMatchObject({ code: "42501" });
  }), 120000);
  test("denies uncertain outcomes, forged lease tokens, changed results, and duplicate claims", async () => rollbackCase(context, async sql => {
    const saved = await queued(sql, fixture, target), lease = (await claim(sql, saved.result.notificationId))!;
    expect(await claim(sql, saved.result.notificationId)).toBeNull();
    for (const malformed of [{ outcome: "accepted", providerMessageId: null }, { outcome: "accepted", providerMessageId: 123 },
      { outcome: "accepted", providerMessageId: {} }, { outcome: "accepted", providerMessageId: [] },
      { outcome: "failed", failureCode: null }, { outcome: "failed", failureCode: {} }, { outcome: "failed", failureCode: [] },
      { outcome: null, failureCode: "outcome_unknown" }, { outcome: "accepted", providerMessageId: "ok", extra: true }])
      await expect(finish(sql, lease, malformed)).rejects.toMatchObject({ code: "22023" });
    const [unchanged] = await sql`SELECT n.state,n.revision,a.outcome,a.result_digest,
      (SELECT count(*)::int FROM public.audit_events WHERE action='notification.result' AND entity_id=n.id::text) audit_count
      FROM mmhr_private.rfp_notification_outbox n JOIN mmhr_private.rfp_notification_attempts a ON a.notification_id=n.id
      WHERE n.id=${lease.notificationId}::uuid`;
    expect(unchanged).toEqual({ state: "leased", revision: 2, outcome: "leased", result_digest: null, audit_count: 0 });
    await expect(finish(sql, lease, { outcome: "accepted", providerMessageId: "synthetic-provider" }, "f".repeat(64))).rejects.toMatchObject({ code: "42501" });
    await finish(sql, lease, { outcome: "needs_attention", failureCode: "outcome_unknown" });
    expect(await finish(sql, lease, { outcome: "needs_attention", failureCode: "outcome_unknown" })).toBe(true);
    await expect(finish(sql, lease, { outcome: "accepted", providerMessageId: "changed-provider" })).rejects.toMatchObject({ code: "22023" });
    await expect(request(sql, fixture.pair[0], "mmhr_retry_rfp_notification", { ...saved.scope, notificationId: saved.result.notificationId, expectedRevision: 3 }, randomUUID(), randomUUID())).rejects.toMatchObject({ code: "42501" });
  }), 120000);
  test("blocks a changed source or revoked participant before dispatch", async () => rollbackCase(context, async sql => {
    const saved = await queued(sql, fixture, target);
    await sql`UPDATE public.org_members SET status='suspended',suspended_at=clock_timestamp() WHERE id=${saved.recipient.membershipId}::uuid`;
    expect(await claim(sql, saved.result.notificationId)).toBeNull();
    const [outbox] = await sql`SELECT state,failure_code FROM mmhr_private.rfp_notification_outbox WHERE id=${saved.result.notificationId}::uuid`;
    expect(outbox).toEqual({ state: "needs_attention", failure_code: "source_changed" });
  }), 120000);
  test.each(["actor_suspended", "scoped_permission_revoked", "customer_suspended"] as const)("blocks %s before claim and after claim", async change => {
    for (const afterClaim of [false, true]) await rollbackCase(context, async sql => {
      const saved = await queued(sql, fixture, target);
      const lease = afterClaim ? (await claim(sql, saved.result.notificationId))! : null;
      if (change === "actor_suspended") await sql`UPDATE public.identities SET status='suspended',suspended_at=clock_timestamp() WHERE id=${fixture.pair[0].identityId}::uuid`;
      if (change === "customer_suspended") await sql`UPDATE public.orgs SET status='suspended',suspended_at=clock_timestamp() WHERE id=${fixture.organizationId}::uuid`;
      if (change === "scoped_permission_revoked") await sql`INSERT INTO public.user_permission_overrides(identity_id,permission_key,scope_kind,organization_id,scope_key,effect,issued_by_identity_id,issue_reason)
        VALUES(${fixture.pair[0].identityId}::uuid,'rfp.distribute','organization',${fixture.organizationId}::uuid,${`organization:${fixture.organizationId}`},'deny',${fixture.pair[1].identityId}::uuid,'Synthetic queued authority revocation')`;
      if (lease) {
        const allowed = await worker(sql, async runtime => {
          const [row] = await runtime<{ allowed: boolean }[]>`SELECT mmhr_private.r4_get_rfp_notification_dispatch(${lease.notificationId}::uuid,${lease.attemptId}::uuid,${lease.token}) allowed`; return row!.allowed;
        });
        expect(allowed).toBe(false);
        await finish(sql, lease, { outcome: "needs_attention", failureCode: "source_changed" });
      } else expect(await claim(sql, saved.result.notificationId)).toBeNull();
      const [record] = await sql`SELECT state,source_digest,created_by_identity_id FROM mmhr_private.rfp_notification_outbox WHERE id=${saved.result.notificationId}::uuid`;
      expect(record).toEqual({ state: "needs_attention", source_digest: saved.recipient.sourceDigest, created_by_identity_id: fixture.pair[0].identityId });
    });
  }, 120000);
  test("rejects owner truncation of immutable notification history", async () => rollbackCase(context, async sql => {
    const saved = await queued(sql, fixture, target);
    for (const table of ["rfp_notification_outbox", "rfp_notification_attempts", "rfp_notification_receipts"])
      await expect(sql.savepoint(async runtime => { await runtime.unsafe(`TRUNCATE mmhr_private.${table} CASCADE`); })).rejects.toMatchObject({ code: "P0001" });
    const [record] = await sql`SELECT count(*)::int count FROM mmhr_private.rfp_notification_outbox WHERE id=${saved.result.notificationId}::uuid`;
    expect(record!.count).toBe(1);
  }), 120000);
  test("denies customer, vendor, AAL1 staff, foreign scope, and stale digests", async () => rollbackCase(context, async sql => {
    const saved = await queued(sql, fixture, target);
    for (const actor of [target.customer, target.vendors[0]!.actor]) await expect(request(sql, actor, "mmhr_get_rfp_notification_recipients", saved.scope, randomUUID(), undefined, "aal1")).rejects.toMatchObject({ code: "42501" });
    await expect(request(sql, fixture.pair[0], "mmhr_get_rfp_notification_recipients", saved.scope, randomUUID(), undefined, "aal1")).rejects.toMatchObject({ code: "42501" });
    await expect(request(sql, fixture.pair[0], "mmhr_queue_rfp_notification", { ...saved.payload, notificationId: randomUUID(), expectedSourceDigest: "f".repeat(64) }, randomUUID(), randomUUID())).rejects.toMatchObject({ code: "42501" });
    await expect(request(sql, fixture.pair[0], "mmhr_get_rfp_notification_status", { ...saved.scope, organizationId: target.vendors[0]!.organizationId })).rejects.toMatchObject({ code: "42501" });
  }), 120000);
  test("denies all raw private records and worker function calls from ordinary roles", async () => rollbackCase(context, async sql => {
    for (const role of ["anon", "authenticated", "service_role", "mmhr_worker"] as const) {
      for (const table of ["rfp_notification_outbox", "rfp_notification_attempts", "rfp_notification_receipts"])
        await expect(sql.savepoint(async runtime => { await runtime.unsafe(`SET LOCAL ROLE ${role}`); await runtime.unsafe(`SELECT * FROM mmhr_private.${table}`); })).rejects.toMatchObject({ code: "42501" });
      await expect(sql.savepoint(async runtime => { await runtime.unsafe(`SET LOCAL ROLE ${role}`); await runtime`SELECT mmhr_private.r4_claim_rfp_notification(${randomUUID()}::uuid)`; })).rejects.toMatchObject({ code: "42501" });
    }
  }), 120000);
  test("serializes competing claims into exactly one active attempt", async () => {
    // Keep this committed concurrency fixture on the other vendor. Immutable
    // history stays intact, and later rollback cases use the first vendor.
    const saved = await context.client.begin(sql => queued(sql, fixture, { ...target, vendors: [target.vendors[1]!, target.vendors[0]!] }));
    const leases = await Promise.all([context.client.begin(sql => claim(sql, saved.result.notificationId)),
      context.client.begin(sql => claim(sql, saved.result.notificationId))]);
    expect(leases.filter(Boolean)).toHaveLength(1);
    const [count] = await context.client`SELECT count(*)::int count FROM mmhr_private.rfp_notification_attempts WHERE notification_id=${saved.result.notificationId}::uuid AND outcome='leased'`;
    expect(count!.count).toBe(1);
  }, 120000);
  test("expires an old modeled lease into manual attention without issuing a replacement", async () => rollbackCase(context, async sql => {
    // This fixture models an already expired lease; it does not advance Auth
    // time or weaken any production expiry comparison.
    const saved = await queued(sql, fixture, target), token = "e".repeat(64);
    await sql`UPDATE mmhr_private.rfp_notification_outbox SET state='leased',revision=2,attempt_count=1 WHERE id=${saved.result.notificationId}::uuid`;
    await sql`INSERT INTO mmhr_private.rfp_notification_attempts(notification_id,number,token,started_at,expires_at)
      VALUES(${saved.result.notificationId}::uuid,1,${token},statement_timestamp()-interval '2 minutes',statement_timestamp()-interval '1 minute')`;
    expect(await claim(sql, saved.result.notificationId)).toBeNull();
    const [outbox] = await sql`SELECT state,failure_code,attempt_count FROM mmhr_private.rfp_notification_outbox WHERE id=${saved.result.notificationId}::uuid`;
    expect(outbox).toEqual({ state: "needs_attention", failure_code: "lease_expired", attempt_count: 1 });
    const [attempt] = await sql`SELECT outcome,finished_at IS NOT NULL finished FROM mmhr_private.rfp_notification_attempts WHERE notification_id=${saved.result.notificationId}::uuid`;
    expect(attempt).toEqual({ outcome: "needs_attention", finished: true });
    expect(await claim(sql, saved.result.notificationId)).toBeNull();
  }), 120000);
  test("rechecks participant access after claiming and keeps attempt history immutable", async () => rollbackCase(context, async sql => {
    const saved = await queued(sql, fixture, target), lease = (await claim(sql, saved.result.notificationId))!;
    await sql`UPDATE public.org_members SET status='suspended',suspended_at=clock_timestamp() WHERE id=${saved.recipient.membershipId}::uuid`;
    const allowed = await worker(sql, async runtime => {
      const [row] = await runtime<{ allowed: boolean }[]>`SELECT mmhr_private.r4_get_rfp_notification_dispatch(${lease.notificationId}::uuid,${lease.attemptId}::uuid,${lease.token}) allowed`; return row!.allowed;
    });
    expect(allowed).toBe(false);
    await finish(sql, lease, { outcome: "needs_attention", failureCode: "recipient_revoked" });
    await expect(sql.savepoint(async probe => { await probe`UPDATE mmhr_private.rfp_notification_attempts SET provider_message_id='forged' WHERE id=${lease.attemptId}::uuid`; })).rejects.toMatchObject({ code: "42501" });
    await expect(sql.savepoint(async probe => { await probe`UPDATE mmhr_private.rfp_notification_receipts SET result='{}'::jsonb WHERE actor_identity_id=${fixture.pair[0].identityId}::uuid`; })).rejects.toMatchObject({ code: "42501" });
  }), 120000);
  test("stops after three definite failed attempts", async () => rollbackCase(context, async sql => {
    const saved = await queued(sql, fixture, target);
    for (const number of [1, 2, 3]) {
      const lease = (await claim(sql, saved.result.notificationId))!; expect(lease.attemptNumber).toBe(number);
      await finish(sql, lease, { outcome: "failed", failureCode: "provider_unavailable_pre_dispatch" });
      const retry = { ...saved.scope, notificationId: saved.result.notificationId, expectedRevision: number*3 };
      if (number<3) await request(sql, fixture.pair[0], "mmhr_retry_rfp_notification", retry, randomUUID(), randomUUID());
      else await expect(request(sql, fixture.pair[0], "mmhr_retry_rfp_notification", retry, randomUUID(), randomUUID())).rejects.toMatchObject({ code: "42501" });
    }
    const [history] = await sql`SELECT n.state,n.attempt_count,n.failure_code,a.outcome,a.failure_code attempt_failure
      FROM mmhr_private.rfp_notification_outbox n JOIN mmhr_private.rfp_notification_attempts a ON a.notification_id=n.id AND a.number=3
      WHERE n.id=${saved.result.notificationId}::uuid`;
    expect(history).toEqual({ state: "needs_attention", attempt_count: 3, failure_code: "provider_unavailable_pre_dispatch",
      outcome: "failed", attempt_failure: "provider_unavailable_pre_dispatch" });
  }), 120000);
  test("rolls back queue and receipt when the audit insert fails", async () => rollbackCase(context, async sql => {
    const { scope, recipient } = await eligible(sql, fixture, target), notificationId = randomUUID();
    await sql`CREATE FUNCTION mmhr_private.synthetic_notification_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.action='notification.queue' THEN RAISE EXCEPTION 'Synthetic audit failure'; END IF; RETURN NEW; END $$`;
    await sql`CREATE TRIGGER synthetic_notification_audit_failure BEFORE INSERT ON public.audit_events FOR EACH ROW EXECUTE FUNCTION mmhr_private.synthetic_notification_audit_failure()`;
    await expect(request(sql, fixture.pair[0], "mmhr_queue_rfp_notification", { ...scope, notificationId, recipientId: recipient.recipientId,
      membershipId: recipient.membershipId, expectedSourceDigest: recipient.sourceDigest }, randomUUID(), randomUUID())).rejects.toThrow("Synthetic audit failure");
    const [rows] = await sql`SELECT count(*)::int count FROM mmhr_private.rfp_notification_outbox WHERE id=${notificationId}::uuid`; expect(rows!.count).toBe(0);
  }), 120000);
  test("rolls back worker claim and attempt creation on audit failure", async () => rollbackCase(context, async sql => {
    const saved = await queued(sql, fixture, target);
    await sql`CREATE FUNCTION mmhr_private.synthetic_notification_claim_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.action='notification.claim' THEN RAISE EXCEPTION 'Synthetic worker audit failure'; END IF; RETURN NEW; END $$`;
    await sql`CREATE TRIGGER synthetic_notification_claim_failure BEFORE INSERT ON public.audit_events FOR EACH ROW EXECUTE FUNCTION mmhr_private.synthetic_notification_claim_failure()`;
    await expect(claim(sql, saved.result.notificationId)).rejects.toThrow("Synthetic worker audit failure");
    const [row] = await sql`SELECT state,attempt_count,(SELECT count(*)::int FROM mmhr_private.rfp_notification_attempts WHERE notification_id=n.id) attempts
      FROM mmhr_private.rfp_notification_outbox n WHERE id=${saved.result.notificationId}::uuid`;
    expect(row).toEqual({ state: "queued", attempt_count: 0, attempts: 0 });
  }), 120000);
});

describe("RFP notification commands through actual signed Auth", () => {
  let customerApi: SecurityApiPrincipal, vendorApi: SecurityApiPrincipal;
  let fixture: SecurityCommandApiFixtures, target: Target, requestInput: ReturnType<typeof notificationQueueSchema.parse>, scope: { organizationId: string; rfpId: string; version: number; correlationId: string };
  beforeAll(async () => {
    fixture = await createSecurityCommandApiFixtures();
    await fixture.owner`GRANT mmhr_rfp_notification_worker TO postgres WITH ADMIN FALSE, INHERIT FALSE, SET TRUE`;
    const actors = await Promise.all([fixture.createSyntheticPrincipal(), fixture.createSyntheticPrincipal(), fixture.createSyntheticPrincipal()]);
    [customerApi, vendorApi] = [actors[0]!, actors[1]!];
    async function principal(value: SecurityApiPrincipal, assurance: "aal1" | "aal2"): Promise<SecurityTokenPrincipal> {
      const claims = await verifiedApiClaims(assurance === "aal2" ? elevatedClient(value) : value.aal1, assurance);
      return { identityId: value.identityId, subject: value.subjectId, sessionId: claims.sessionId, expiresAt: new Date(claims.expiresAt) };
    }
    async function staffPrincipal(value: SecurityApiPrincipal): Promise<SecurityPrincipal> {
      const actor = await principal(value, "aal2");
      const [session] = await fixture.owner<{ factor_id: string | null }[]>`SELECT factor_id FROM auth.sessions WHERE id=${actor.sessionId}::uuid AND user_id=${actor.subject}::uuid`;
      if (!session?.factor_id) throw new Error("Genuine MFA session required");
      return { ...actor, factorId: session.factor_id };
    }
    const pair = await Promise.all(fixture.pair.map(staffPrincipal)), customer = await principal(customerApi, "aal1"),
      vendor = await principal(vendorApi, "aal1"), right = await principal(actors[2]!, "aal1"), admin = await staffPrincipal(fixture.organizationAdmin);
    await fixture.owner.begin(async sql => {
      const [membership] = await sql<{ id: string }[]>`INSERT INTO public.org_members(org_id,identity_id,user_id,role,role_key,migration_review_required)
        VALUES(${fixture.organizationId}::uuid,${pair[0]!.identityId}::uuid,${pair[0]!.subject}::uuid,'contributor','contributor',false) RETURNING id`;
      await sql`INSERT INTO public.user_permission_overrides(identity_id,permission_key,scope_kind,organization_id,scope_key,effect,issued_by_identity_id,issue_reason)
        VALUES(${pair[0]!.identityId}::uuid,'workspace.access','organization',${fixture.organizationId}::uuid,${`organization:${fixture.organizationId}`},'allow',${pair[1]!.identityId}::uuid,'Synthetic notification Auth fixture')`;
      target = await seedQuoteWorkflow(sql, { organizationId: fixture.organizationId, pair: [pair[0]!, pair[1]!], organizationAdmin: admin, target: admin,
        adminMembershipId: fixture.adminMembershipId, actorMembershipId: membership!.id, targetMembershipId: fixture.adminMembershipId },
        { customer, vendors: [vendor, right] });
    });
    const [rfp] = await fixture.owner<{ rfp_id: string }[]>`SELECT r.rfp_id FROM public.rfp_versions r JOIN public.rfp_recipients rr ON rr.rfp_version_id=r.id WHERE rr.id=${target.vendors[0]!.recipientId}::uuid`;
    scope = { organizationId: fixture.organizationId, rfpId: rfp!.rfp_id, version: 1, correlationId: randomUUID() };
    const page = await getRfpNotificationRecipients(scope, { supabase: elevatedClient(fixture.pair[0]) as RequestSupabaseClient });
    const recipient = page.items.find(item => item.recipientId === target.vendors[0]!.recipientId && item.recipientIdentityId === vendorApi.identityId)!;
    requestInput = { ...scope, notificationId: randomUUID(), recipientId: recipient.recipientId, membershipId: recipient.membershipId,
      expectedSourceDigest: recipient.sourceDigest, idempotencyKey: randomUUID() };
  }, 420000);
  afterAll(async () => { if (fixture) await fixture.close(); }, 180000);
  test("queues and replays through signed internal AAL2 staff without provider activation", async () => {
    const options = { supabase: elevatedClient(fixture.pair[0]) as RequestSupabaseClient };
    const saved = await queueRfpNotification(requestInput, options); expect(saved).toMatchObject({ state: "queued", revision: 1, outcomeCode: "recorded" });
    expect(await queueRfpNotification(requestInput, options)).toEqual({ ...saved, outcomeCode: "replayed" });
    expect((await getRfpNotificationStatus(scope, options)).items).toEqual([expect.objectContaining({ notificationId: saved.notificationId, state: "queued", attemptCount: 0, canRetry: false, providerMessageId: null })]);
  }, 120000);
  test("denies signed ordinary customer and vendor, anonymous, and AAL1 internal staff", async () => {
    const retryInput = { ...scope, notificationId: requestInput.notificationId, expectedRevision: 3, idempotencyKey: randomUUID() };
    for (const client of [customerApi.aal1, vendorApi.aal1, fixture.anonymous, fixture.pair[0].aal1]) {
      const options = { supabase: client as RequestSupabaseClient };
      for (const operation of [() => getRfpNotificationRecipients(scope, options), () => getRfpNotificationStatus(scope, options),
        () => queueRfpNotification(requestInput, options), () => retryRfpNotification(retryInput, options)])
        await expect(operation()).rejects.toBeInstanceOf(AuthorizationError);
      for (const [name, input] of [["mmhr_get_rfp_notification_recipients", scope], ["mmhr_get_rfp_notification_status", scope],
        ["mmhr_queue_rfp_notification", requestInput], ["mmhr_retry_rfp_notification", retryInput]] as const) {
        const { correlationId, ...rest } = input;
        const { idempotencyKey, ...payload } = rest as typeof rest & { idempotencyKey?: string };
        const result = await client.rpc(name, { payload, correlation_id: correlationId, ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}) });
        expect(result.data).toBeNull(); expect(result.error?.code).toBe("42501");
      }
    }
  }, 120000);
  test("uses signed staff for a safe retry and preserves its original receipt after a modeled provider result", async () => {
    const lease = (await fixture.owner.begin(sql => claim(sql, requestInput.notificationId)))!;
    await fixture.owner.begin(sql => finish(sql, lease, { outcome: "failed", failureCode: "rate_limited_pre_dispatch" }));
    const retryInput = { ...scope, notificationId: requestInput.notificationId, expectedRevision: 3, idempotencyKey: randomUUID() };
    const options = { supabase: elevatedClient(fixture.pair[0]) as RequestSupabaseClient };
    const saved = await retryRfpNotification(retryInput, options);
    expect(saved).toMatchObject({ action: "retry", revision: 4, state: "queued", outcomeCode: "recorded" });
    const second = (await fixture.owner.begin(sql => claim(sql, requestInput.notificationId)))!;
    await fixture.owner.begin(sql => finish(sql, second, { outcome: "accepted", providerMessageId: "synthetic-provider-acceptance" }));
    expect(await retryRfpNotification(retryInput, options)).toEqual({ ...saved, outcomeCode: "replayed" });
    expect((await getRfpNotificationStatus(scope, options)).items).toEqual([expect.objectContaining({ state: "accepted", attemptCount: 2, canRetry: false })]);
    await expect(retryRfpNotification({ ...retryInput, expectedRevision: 6 }, options)).rejects.toThrow("Notification request failed");
  }, 120000);
  test("does not expose private outbox through REST or permit ordinary provider-result writes", async () => {
    for (const client of [elevatedClient(fixture.pair[0]), vendorApi.aal1, fixture.anonymous]) {
      const raw = await client.schema("mmhr_private").from("rfp_notification_outbox").select("*"); expect(raw.data).toBeNull(); expect(raw.error).not.toBeNull();
      const forged = await client.rpc("r4_record_rfp_notification_result", {}); expect(forged.data).toBeNull(); expect(forged.error).not.toBeNull();
    }
  }, 120000);
});
