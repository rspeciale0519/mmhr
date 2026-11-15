import { randomBytes } from "node:crypto";

import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";

import { createScramVerifier } from "../../../scripts/scram-verifier.mjs";
import {
  applyAllMigrations, openHostedWorkerRehearsalLogin, type RehearsalClient, type RehearsalContext,
  type RehearsalTransaction, startRehearsal, stopRehearsal,
} from "./r1-migration-rehearsal";

const hour = 60 * 60 * 1000;
const day = 24 * hour;
const hostedName = () => `mmhr_hosted_worker_${randomBytes(16).toString("hex")}`;
const ephemeralName = () => `mmhr_worker_${randomBytes(16).toString("hex")}`;
const credential = () => randomBytes(32).toString("base64url");
const at = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();
const appRoles = ["anon", "authenticated", "service_role", "mmhr_worker", "mmhr_document_worker", "mmhr_rfp_notification_worker"];
const functions = [
  "mmhr_private.r1_worker_role_is_safe()",
  "mmhr_private.r1_hosted_worker_login_is_safe(text)",
  "mmhr_private.r1_create_hosted_worker_login(text,text,timestamptz)",
  "mmhr_private.r1_renew_hosted_worker_login(text,timestamptz)",
  "mmhr_private.r1_disable_hosted_worker_login(text)",
  "mmhr_private.r1_remove_hosted_worker_login(text)",
  "mmhr_private.r1_remove_expired_hosted_worker_logins()",
];
class Rollback extends Error {}

describe("hosted worker login", () => {
  let context: RehearsalContext | undefined;
  const openClients: RehearsalClient[] = [];
  const ephemeralLogins: string[] = [];
  const owner = () => context!.client;

  async function createHosted(name: string, secret: string, expiresAt = at(90 * day - 60_000)) {
    await owner()`SELECT mmhr_private.r1_create_hosted_worker_login(${name}, ${createScramVerifier(secret)}, ${expiresAt}::timestamptz)`;
  }

  async function createEphemeral(name: string, secret: string) {
    ephemeralLogins.push(name);
    await owner()`SELECT mmhr_private.r1_create_ephemeral_worker_login(${name}, ${createScramVerifier(secret)}, ${at(5 * 60_000)}::timestamptz)`;
  }

  async function disableAndRemove(name: string) {
    await owner()`SELECT mmhr_private.r1_disable_hosted_worker_login(${name})`;
    await owner()`SELECT mmhr_private.r1_remove_hosted_worker_login(${name})`;
  }

  function connect(name: string, secret: string) {
    const client = openHostedWorkerRehearsalLogin(context!, name, secret);
    openClients.push(client);
    return client;
  }

  async function hostedLogins() {
    return (await owner()<{ rolname: string; rolcanlogin: boolean }[]>`
      SELECT rolname, rolcanlogin FROM pg_roles WHERE rolname ~ '^mmhr_hosted_worker_[0-9a-f]{32}$' ORDER BY rolname
    `).map((row) => ({ ...row }));
  }

  /** Utility statements take no bind parameters. Both values are generated and checked here. */
  async function expireDirectly(name: string) {
    const expiredAt = at(-60_000);
    if (!/^mmhr_hosted_worker_[0-9a-f]{32}$/.test(name) || !/^[0-9TZ:.-]+$/.test(expiredAt)) throw new Error("Unsafe test value");
    await owner().unsafe(`ALTER ROLE "${name}" VALID UNTIL '${expiredAt}'`);
  }

  async function roleIsSafe() {
    const [row] = await owner()<{ safe: boolean }[]>`SELECT mmhr_private.r1_worker_role_is_safe() AS safe`;
    return row!.safe;
  }

  /** Runs owner changes in one transaction and always rolls them back. */
  async function inRollback(work: (sql: RehearsalTransaction) => Promise<void>) {
    await owner().begin(async (sql) => {
      await work(sql);
      throw new Rollback();
    }).catch((error: unknown) => {
      if (!(error instanceof Rollback)) throw error;
    });
  }

  beforeAll(async () => {
    context = await startRehearsal("hosted-worker-login");
    await applyAllMigrations(context);
  }, 300_000);

  afterEach(async () => {
    await Promise.all(openClients.splice(0).map((client) => client.end({ timeout: 2 })));
    if (!context) return;
    for (const login of await hostedLogins()) await disableAndRemove(login.rolname);
    for (const name of ephemeralLogins.splice(0)) {
      await owner()`SELECT mmhr_private.r1_disable_ephemeral_worker_login(${name})`;
      await owner()`SELECT mmhr_private.r1_remove_ephemeral_worker_login(${name})`;
    }
  }, 60_000);

  afterAll(async () => {
    if (context) await stopRehearsal(context);
  }, 180_000);

  test("creates a login that connects with exactly the privileges of an ephemeral login", async () => {
    const hosted = hostedName(), hostedSecret = credential();
    const ephemeral = ephemeralName(), ephemeralSecret = credential();
    await createHosted(hosted, hostedSecret);
    await createEphemeral(ephemeral, ephemeralSecret);

    const flags = await owner()<{ rolname: string; flags: string; membership: string; valid: boolean }[]>`
      SELECT r.rolname,
        concat_ws(',', r.rolcanlogin, r.rolinherit, r.rolsuper, r.rolcreatedb, r.rolcreaterole, r.rolreplication, r.rolbypassrls) AS flags,
        (SELECT string_agg(format('%s:%s:%s:%s', g.rolname, m.admin_option, m.inherit_option, m.set_option), ';')
          FROM pg_auth_members m JOIN pg_roles g ON g.oid = m.roleid WHERE m.member = r.oid) AS membership,
        r.rolvaliduntil > clock_timestamp() + interval '89 days' AS valid
      FROM pg_roles r WHERE r.rolname IN (${hosted}, ${ephemeral}) ORDER BY r.rolname = ${hosted}
    `;
    expect(flags.map(({ flags: value, membership }) => ({ value, membership }))).toEqual([
      // login, inherit, super, createdb, createrole, replication, bypassrls; then admin, inherit, set.
      { value: "t,t,f,f,f,f,f", membership: "mmhr_worker:f:t:t" },
      { value: "t,t,f,f,f,f,f", membership: "mmhr_worker:f:t:t" },
    ]);
    expect(flags[1]!.valid).toBe(true);

    // Every privilege check that differs between the two logins. There must be none.
    const differences = await owner()<{ object: string }[]>`
      WITH objects AS (
        SELECT 'table ' || c.oid::regclass::text || ' ' || p AS object,
          has_table_privilege(${hosted}, c.oid, p) AS hosted, has_table_privilege(${ephemeral}, c.oid, p) AS ephemeral
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) AS p
        WHERE n.nspname IN ('public','mmhr_private','auth','storage') AND c.relkind IN ('r','p','v','m','f')
        UNION ALL
        SELECT 'function ' || p.oid::regprocedure::text,
          has_function_privilege(${hosted}, p.oid, 'EXECUTE'), has_function_privilege(${ephemeral}, p.oid, 'EXECUTE')
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname IN ('public','mmhr_private','auth','storage')
        UNION ALL
        SELECT 'schema ' || n.nspname || ' ' || p,
          has_schema_privilege(${hosted}, n.oid, p), has_schema_privilege(${ephemeral}, n.oid, p)
        FROM pg_namespace n CROSS JOIN unnest(ARRAY['USAGE','CREATE']) AS p
        UNION ALL
        SELECT 'database ' || p, has_database_privilege(${hosted}, current_database(), p),
          has_database_privilege(${ephemeral}, current_database(), p)
        FROM unnest(ARRAY['CREATE','CONNECT','TEMPORARY']) AS p
      )
      SELECT object FROM objects WHERE hosted IS DISTINCT FROM ephemeral
    `;
    expect(differences.map((row) => row.object)).toEqual([]);

    const client = connect(hosted, hostedSecret);
    const [identity] = await client<{ role: string; session: string; worker: boolean; bypass: boolean }[]>`
      SELECT current_user AS role, session_user AS session, pg_has_role(current_user, 'mmhr_worker', 'member') AS worker,
        (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS bypass
    `;
    expect(identity).toEqual({ role: hosted, session: hosted, worker: true, bypass: false });
    await expect(client`SELECT count(*) FROM public.identities`).rejects.toThrow(/permission denied/);
    await expect(client`SELECT count(*) FROM public.leads`).rejects.toThrow(/permission denied/);
    await expect(client`SELECT count(*) FROM auth.users`).rejects.toThrow(/permission denied/);
    await expect(client`INSERT INTO public.orgs (name) VALUES ('Blocked Co')`).rejects.toThrow(/permission denied/);
    await expect(client`SET ROLE postgres`).rejects.toThrow(/permission denied/);
    await expect(client`CREATE TABLE public.hosted_probe (id int)`).rejects.toThrow(/permission denied/);
  });

  test("rejects an invalid expiry, name, or verifier", async () => {
    const name = hostedName(), secret = credential();
    for (const expiresAt of [at(59 * 60_000), at(90 * day + hour), at(-hour)]) {
      await expect(createHosted(name, secret, expiresAt)).rejects.toThrow("Invalid hosted worker expiry");
    }
    await expect(owner()`SELECT mmhr_private.r1_create_hosted_worker_login(${name}, ${createScramVerifier(secret)}, NULL)`)
      .rejects.toThrow("Invalid hosted worker expiry");
    for (const badName of [ephemeralName(), `mmhr_hosted_worker_${"A".repeat(32)}`, "mmhr_hosted_worker_abc", "postgres",
      `${hostedName()}"; DROP ROLE postgres; --`]) {
      await expect(createHosted(badName, secret)).rejects.toThrow("Invalid hosted worker login name");
    }
    const verifier = createScramVerifier(secret);
    for (const badVerifier of [secret, `md5${"0".repeat(32)}`, verifier.replace("$4096:", "$1000:"), `${verifier}' LOGIN`, ""]) {
      await expect(owner()`SELECT mmhr_private.r1_create_hosted_worker_login(${name}, ${badVerifier}, ${at(day)}::timestamptz)`)
        .rejects.toThrow("Invalid hosted worker password verifier");
    }
    expect(await hostedLogins()).toEqual([]);
  });

  test("allows at most two hosted logins, counting disabled ones", async () => {
    const first = hostedName(), second = hostedName();
    await createHosted(first, credential());
    await createHosted(second, credential(), at(2 * hour));
    await owner()`SELECT mmhr_private.r1_disable_hosted_worker_login(${second})`;
    await expect(createHosted(hostedName(), credential())).rejects.toThrow("Hosted worker login limit reached");
    await owner()`SELECT mmhr_private.r1_remove_hosted_worker_login(${second})`;
    const third = hostedName();
    await createHosted(third, credential());
    expect((await hostedLogins()).map((login) => login.rolname).sort()).toEqual([first, third].sort());
    await expect(createHosted(first, credential())).rejects.toThrow(/already exists|limit reached/);
  });

  test("only the migration owner can execute the functions", async () => {
    const hosted = hostedName(), hostedSecret = credential();
    const ephemeral = ephemeralName();
    await createHosted(hosted, hostedSecret);
    await createEphemeral(ephemeral, credential());
    const allowed = await owner()<{ role: string; fn: string }[]>`
      SELECT r.rolname AS role, f AS fn
      FROM pg_roles r CROSS JOIN unnest(${functions}::text[]) AS f
      WHERE (r.rolname = ANY(${appRoles}::text[]) OR r.rolname IN (${hosted}, ${ephemeral}))
        AND has_function_privilege(r.oid, f::regprocedure, 'EXECUTE')
    `;
    expect(allowed).toEqual([]);
    const [publicGrant] = await owner()<{ count: number }[]>`
      SELECT count(*)::integer AS count FROM unnest(${functions}::text[]) AS f
      WHERE has_function_privilege('public', f::regprocedure, 'EXECUTE')
    `;
    expect(publicGrant!.count).toBe(0);

    const client = connect(hosted, hostedSecret);
    await expect(client`SELECT mmhr_private.r1_create_hosted_worker_login(${hostedName()}, ${createScramVerifier(credential())}, ${at(day)}::timestamptz)`)
      .rejects.toThrow(/permission denied/);
    await expect(client`SELECT mmhr_private.r1_renew_hosted_worker_login(${hosted}, ${at(day)}::timestamptz)`).rejects.toThrow(/permission denied/);
    await expect(client`SELECT mmhr_private.r1_remove_expired_hosted_worker_logins()`).rejects.toThrow(/permission denied/);
    await expect(client`SELECT mmhr_private.r1_worker_role_is_safe()`).rejects.toThrow(/permission denied/);
  });

  test("keeps the shared worker check true for a hosted login and false for a tampered one", async () => {
    const hosted = hostedName();
    await createHosted(hosted, credential());
    expect(await roleIsSafe()).toBe(true);

    await inRollback(async (sql) => {
      const extra = `r1_hosted_extra_${randomBytes(8).toString("hex")}`;
      await sql`CREATE ROLE ${sql(extra)} NOLOGIN`;
      await sql`GRANT ${sql(extra)} TO ${sql(hosted)}`;
      const [row] = await sql<{ safe: boolean }[]>`SELECT mmhr_private.r1_worker_role_is_safe() AS safe`;
      expect(row!.safe).toBe(false);
      await expect(sql`SELECT mmhr_private.r1_create_hosted_worker_login(${hostedName()}, ${createScramVerifier(credential())}, ${at(day)}::timestamptz)`)
        .rejects.toThrow("Shared worker role is missing or unsafe");
    });
    await inRollback(async (sql) => {
      await sql`ALTER ROLE ${sql(hosted)} NOINHERIT`;
      const [row] = await sql<{ safe: boolean }[]>`SELECT mmhr_private.r1_worker_role_is_safe() AS safe`;
      expect(row!.safe).toBe(false);
    });
    await inRollback(async (sql) => {
      // A hosted-pattern role made outside the functions, without an expiry, is unsafe.
      const outsider = hostedName();
      await sql`CREATE ROLE ${sql(outsider)} LOGIN INHERIT`;
      await sql`GRANT mmhr_worker TO ${sql(outsider)} WITH ADMIN FALSE, INHERIT TRUE, SET TRUE`;
      const [row] = await sql<{ safe: boolean }[]>`SELECT mmhr_private.r1_worker_role_is_safe() AS safe`;
      expect(row!.safe).toBe(false);
    });
    await inRollback(async (sql) => {
      // The stricter hosted check refuses a direct grant, so renew refuses it too.
      await sql`GRANT SELECT ON public.leads TO ${sql(hosted)}`;
      const [row] = await sql<{ safe: boolean }[]>`SELECT mmhr_private.r1_hosted_worker_login_is_safe(${hosted}) AS safe`;
      expect(row!.safe).toBe(false);
      await expect(sql`SELECT mmhr_private.r1_renew_hosted_worker_login(${hosted}, ${at(day)}::timestamptz)`)
        .rejects.toThrow("Hosted worker login is missing, expired, or unsafe");
    });
    expect(await roleIsSafe()).toBe(true);
  });

  test("ephemeral cleanup leaves hosted logins, and hosted cleanup removes only expired hosted logins", async () => {
    const valid = hostedName(), expiring = hostedName();
    const ephemeral = ephemeralName();
    await createHosted(valid, credential());
    await createHosted(expiring, credential(), at(2 * hour));
    await createEphemeral(ephemeral, credential());
    await expireDirectly(expiring);

    await owner()`SELECT mmhr_private.r1_disable_expired_worker_logins()`;
    await owner()`SELECT mmhr_private.r1_remove_expired_worker_logins()`;
    const afterEphemeralCleanup = await hostedLogins();
    expect(afterEphemeralCleanup.map((login) => login.rolname).sort()).toEqual([valid, expiring].sort());
    expect(afterEphemeralCleanup.every((login) => login.rolcanlogin)).toBe(true);

    const [removed] = await owner()<{ count: number }[]>`SELECT mmhr_private.r1_remove_expired_hosted_worker_logins() AS count`;
    expect(removed!.count).toBe(1);
    expect(await hostedLogins()).toEqual([{ rolname: valid, rolcanlogin: true }]);
    const [stillEphemeral] = await owner()<{ rolcanlogin: boolean }[]>`SELECT rolcanlogin FROM pg_roles WHERE rolname = ${ephemeral}`;
    expect(stillEphemeral?.rolcanlogin).toBe(true);
    expect(await roleIsSafe()).toBe(true);
  });

  test("renews a current login within the limits and refuses an expired one", async () => {
    const name = hostedName();
    await createHosted(name, credential(), at(2 * hour));
    await owner()`SELECT mmhr_private.r1_renew_hosted_worker_login(${name}, ${at(30 * day)}::timestamptz)`;
    const [renewed] = await owner()<{ ok: boolean }[]>`
      SELECT rolvaliduntil > clock_timestamp() + interval '29 days' AS ok FROM pg_roles WHERE rolname = ${name}
    `;
    expect(renewed!.ok).toBe(true);
    await expect(owner()`SELECT mmhr_private.r1_renew_hosted_worker_login(${name}, ${at(91 * day)}::timestamptz)`)
      .rejects.toThrow("Invalid hosted worker expiry");
    await expireDirectly(name);
    await expect(owner()`SELECT mmhr_private.r1_renew_hosted_worker_login(${name}, ${at(day)}::timestamptz)`)
      .rejects.toThrow("Hosted worker login is missing, expired, or unsafe");
  });

  test("removes a login only after it is disabled and ends its open sessions", async () => {
    const name = hostedName(), secret = credential();
    await createHosted(name, secret);
    const client = connect(name, secret);
    await client`SELECT 1`;

    await expect(owner()`SELECT mmhr_private.r1_remove_hosted_worker_login(${name})`)
      .rejects.toThrow("Hosted worker login must be disabled before removal");
    await expect(owner()`SELECT mmhr_private.r1_disable_hosted_worker_login(${ephemeralName()})`)
      .rejects.toThrow("Invalid hosted worker login name");
    await disableAndRemove(name);

    expect(await hostedLogins()).toEqual([]);
    await expect(client`SELECT 1`).rejects.toThrow();
    await expect(connect(name, secret)`SELECT 1`).rejects.toThrow();
    // Removing a missing login is a no-op.
    await disableAndRemove(name);
    expect(await roleIsSafe()).toBe(true);
  });
});
