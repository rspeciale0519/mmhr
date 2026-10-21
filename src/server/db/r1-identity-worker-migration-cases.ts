import { expect } from "vitest";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createIdentityIntentRepository } from "./identity-intent-repository";
import {
  claimIntent, createInvitationFixture, intentState,
} from "./r1-identity-intent-fixtures";
import { acceptedInvitation } from "./r1-identity-intent-history-fixtures";
import { createCommandFixture } from "./r1-security-command-fixtures";
import { startRehearsal, stopRehearsal, type RehearsalContext } from "./r1-migration-rehearsal";
import {
  closeIdentityWorker, expectReadOnlyCandidates, identityWorkerSnapshot, openIdentityWorker,
} from "./r1-identity-worker-fixtures";
import {
  applyIdentityWorkerPrefix, writeIdentityWorkerPrefix, type IdentityWorkerPrefix,
} from "./r1-identity-worker-prefix";

async function migrationSnapshot(context: RehearsalContext) {
  const catalog = await context.client`WITH spaces AS (
    SELECT oid,nspname,nspowner,nspacl FROM pg_namespace WHERE nspname IN ('public','mmhr_private','drizzle')
  )
  SELECT 'schema' AS kind,n.nspname AS name,to_jsonb(n) AS value FROM spaces n
  UNION ALL SELECT 'function',format('%I.%I(%s)',n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)),
    jsonb_build_object('definition',pg_get_functiondef(p.oid),'owner',p.proowner,'acl',p.proacl::text,'config',p.proconfig)
    FROM pg_proc p JOIN spaces n ON n.oid = p.pronamespace WHERE p.prokind IN ('f','p')
  UNION ALL SELECT 'relation',format('%I.%I',n.nspname,c.relname),
    jsonb_build_object('kind',c.relkind,'owner',c.relowner,'acl',c.relacl::text,'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity)
    FROM pg_class c JOIN spaces n ON n.oid = c.relnamespace
  UNION ALL SELECT 'column',format('%I.%I.%I',n.nspname,c.relname,a.attname),
    jsonb_build_object('type',format_type(a.atttypid,a.atttypmod),'acl',a.attacl::text,'not_null',a.attnotnull,
      'default',pg_get_expr(d.adbin,d.adrelid))
    FROM pg_class c JOIN spaces n ON n.oid = c.relnamespace JOIN pg_attribute a ON a.attrelid = c.oid
    LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
    WHERE a.attnum > 0 AND NOT a.attisdropped
  UNION ALL SELECT 'trigger',format('%I.%I.%I',n.nspname,c.relname,t.tgname),
    jsonb_build_object('definition',pg_get_triggerdef(t.oid),'enabled',t.tgenabled)
    FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN spaces n ON n.oid = c.relnamespace
  UNION ALL SELECT 'policy',format('%I.%I.%I',schemaname,tablename,policyname),to_jsonb(p)
    FROM pg_policies p WHERE schemaname IN ('public','mmhr_private','drizzle')
  ORDER BY kind,name`;
  const tables = await context.client<{ schema: string; name: string }[]>`SELECT schemaname AS schema,tablename AS name
    FROM pg_tables WHERE schemaname IN ('public','mmhr_private','drizzle') ORDER BY schemaname,tablename`;
  const records: Record<string, unknown[]> = {};
  for (const table of tables) {
    const rows = await context.client`SELECT to_jsonb(r) AS row FROM ${context.client(table.schema)}.${context.client(table.name)} r ORDER BY to_jsonb(r)::text`;
    records[`${table.schema}.${table.name}`] = rows.map((row) => row.row);
  }
  return { catalog: [...catalog], records };
}

function migrationFailure(error: unknown) {
  let current = error;
  for (let depth = 0; depth < 8 && current && typeof current === "object"; depth++) {
    if ("code" in current && "message" in current && current.code === "P0001") {
      return { code: current.code, message: current.message };
    }
    current = "cause" in current ? current.cause : null;
  }
  return null;
}

export async function rehearseIdentityWorkerMigration(prefix: IdentityWorkerPrefix) {
  const context = await startRehearsal("workerfail");
  console.info("Identity worker migration recovery scratch project:", context.projectId);
  try {
    await applyIdentityWorkerPrefix(context, prefix, 10);
    const foundation = await context.client.begin((sql) => createCommandFixture(sql));
    const invitation = await context.client.begin((sql) => createInvitationFixture(sql, foundation));
    const before = await migrationSnapshot(context);
    const businessBefore = await identityWorkerSnapshot(context.client);
    expect(await context.client`SELECT to_regprocedure('mmhr_private.mmhr_list_identity_intent_candidates()') AS name`)
      .toEqual([{ name: null }]);

    const failureMessage = "Isolated identity worker migration failure";
    const faulty: IdentityWorkerPrefix = { ...prefix, files: prefix.files.map((file, index) => index !== 10 ? file : {
      ...file, source: `${file.source}\n--> statement-breakpoint\nDO $$ BEGIN RAISE EXCEPTION '${failureMessage}'; END $$;\n`,
    }) };
    const folder = await writeIdentityWorkerPrefix(context, faulty);
    let failure: unknown;
    try { await migrate(context.db, { migrationsFolder: folder }); } catch (error) { failure = error; }
    expect(migrationFailure(failure)).toEqual({ code: "P0001", message: failureMessage });
    expect(await migrationSnapshot(context)).toEqual(before);
    expect(await identityWorkerSnapshot(context.client)).toEqual(businessBefore);

    // Restore only the copied migration. No repository SQL or metadata changes.
    await applyIdentityWorkerPrefix(context, prefix);
    expect(await identityWorkerSnapshot(context.client)).toEqual(businessBefore);
    const worker = await openIdentityWorker(context);
    try {
      await expectReadOnlyCandidates(context, worker, [invitation.intentId]);
      // The previous application can retain its three-command interface while
      // the new discovery schedule is disabled. No provider call is needed here.
      expect(await claimIntent(worker.client, invitation.intentId, true)).toBeNull();
      const claim = await claimIntent(worker.client, invitation.intentId);
      expect(claim).toMatchObject({ intentId: invitation.intentId, operation: "invitation_delivery",
        idempotencyKey: invitation.idempotencyKey, correlationId: invitation.correlationId });
      expect(await createIdentityIntentRepository(worker.db).recordResult(
        invitation.intentId, claim!.leaseToken, acceptedInvitation)).toBe("recorded");
      expect(await intentState(context.client, invitation.intentId)).toMatchObject({ state: "succeeded", attempt_count: 1, dispatch_count: 1 });
      await expectReadOnlyCandidates(context, worker, []);
    } finally { await closeIdentityWorker(context, worker); }
  } finally { await stopRehearsal(context); }
}
