import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const read = (name: string) => readFileSync(`drizzle/${name}`, "utf8").replaceAll("\r\n", "\n");
const sql = read("0178_hosted_worker_login.sql");
const journal = JSON.parse(read("meta/_journal.json")) as { entries: { idx: number; tag: string }[] };

function functionBody(text: string, header: string) {
  const start = text.indexOf(header);
  expect(start, header).toBeGreaterThanOrEqual(0);
  const bodyStart = text.indexOf("AS $$\n", start);
  return text.slice(bodyStart, text.indexOf("\n$$;", bodyStart));
}

const newFunctions = [
  ["r1_hosted_worker_login_is_safe", "text"],
  ["r1_create_hosted_worker_login", "text, text, timestamptz"],
  ["r1_renew_hosted_worker_login", "text, timestamptz"],
  ["r1_disable_hosted_worker_login", "text"],
  ["r1_remove_hosted_worker_login", "text"],
  ["r1_remove_expired_hosted_worker_logins", ""],
] as const;
const appRoles = "FROM PUBLIC, anon, authenticated, service_role, mmhr_worker, mmhr_document_worker, mmhr_rfp_notification_worker;";

describe("hosted worker login migration", () => {
  test("is the next journal entry and changes no table, policy, or grant to an application role", () => {
    // Later migrations follow 0178, so check its own journal position rather than the last entry.
    expect(journal.entries[178]).toMatchObject({ idx: 178, tag: "0178_hosted_worker_login" });
    expect(sql).not.toMatch(/CREATE TABLE|ALTER TABLE|CREATE POLICY|DROP TABLE|DISABLE ROW LEVEL SECURITY|ALTER DEFAULT PRIVILEGES/);
    expect(sql).not.toMatch(/GRANT EXECUTE/);
    expect(sql.match(/\bGRANT /g)).toEqual(["GRANT "]);
    expect(sql).toContain("'GRANT mmhr_worker TO %I WITH ADMIN FALSE, INHERIT TRUE, SET TRUE'");
    expect(sql).not.toMatch(/FUNCTION "?mmhr_private"?\."?r1_[a-z_]*ephemeral/);
    expect(sql).not.toContain("r1_disable_expired_worker_logins");
  });

  test("changes the shared worker check only by the member name test", () => {
    const header = 'FUNCTION "mmhr_private"."r1_worker_role_is_safe"()';
    const before = functionBody(read("0001_heavy_kulan_gath.sql"), `CREATE ${header}`).split("\n");
    const after = functionBody(sql, `CREATE OR REPLACE ${header}`).split("\n");
    expect(after).toHaveLength(before.length);
    const changed = after.map((line, index) => [before[index], line]).filter(([old, next]) => old !== next);
    expect(changed).toEqual([[
      "\t\t\t\t\t\t\t\"member_role\".\"rolname\" ~ '^mmhr_worker_[0-9a-f]{32}$'",
      "\t\t\t\t\t\t\t(\"member_role\".\"rolname\" ~ '^mmhr_worker_[0-9a-f]{32}$' OR \"member_role\".\"rolname\" ~ '^mmhr_hosted_worker_[0-9a-f]{32}$')",
    ]]);
  });

  test("keeps every new function owner-only, SECURITY DEFINER, and on an empty search_path", () => {
    for (const [name, args] of newFunctions) {
      const start = sql.indexOf(`CREATE FUNCTION mmhr_private.${name}(`);
      expect(start, name).toBeGreaterThan(0);
      const header = sql.slice(start, sql.indexOf("AS $$", start));
      expect(header, name).toContain("SECURITY DEFINER");
      expect(header, name).toContain("SET search_path = ''");
      expect(sql, name).toContain(`REVOKE ALL ON FUNCTION mmhr_private.${name}(${args})\n  ${appRoles}`);
    }
    expect(sql).toContain(`REVOKE ALL ON FUNCTION mmhr_private.r1_worker_role_is_safe()\n  ${appRoles}`);
    expect(sql).toContain("RAISE EXCEPTION 'Hosted worker function % is not owner-only', fn;");
  });

  test("accepts only the hosted name, a SCRAM verifier, a bounded expiry, and two logins", () => {
    const create = functionBody(sql, "CREATE FUNCTION mmhr_private.r1_create_hosted_worker_login(");
    expect(create).toContain("login_name !~ '^mmhr_hosted_worker_[0-9a-f]{32}$'");
    expect(create).toContain("password_verifier !~ '^SCRAM-SHA-256[$]4096:[A-Za-z0-9+/]+={0,2}[$][A-Za-z0-9+/]+={0,2}:[A-Za-z0-9+/]+={0,2}$'");
    expect(create).toContain("expires_at < clock_timestamp() + interval '1 hour'");
    expect(create).toContain("expires_at > clock_timestamp() + interval '90 days'");
    expect(create).toContain("IF 2 <= (");
    expect(create).toContain("'CREATE ROLE %I LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L VALID UNTIL %L'");
    expect(create.indexOf("pg_advisory_xact_lock")).toBeLessThan(create.indexOf("r1_worker_role_is_safe()"));
    expect(create.indexOf("r1_worker_role_is_safe()")).toBeLessThan(create.indexOf("CREATE ROLE"));
    expect(create.lastIndexOf("r1_hosted_worker_login_is_safe(login_name)")).toBeGreaterThan(create.indexOf("GRANT mmhr_worker"));
    const renew = functionBody(sql, "CREATE FUNCTION mmhr_private.r1_renew_hosted_worker_login(");
    expect(renew).toContain("interval '90 days'");
    expect(renew).toContain("rolvaliduntil > clock_timestamp()");
  });

  test("cleans up only expired hosted logins and requires a committed lockout before removal", () => {
    const expired = functionBody(sql, "CREATE FUNCTION mmhr_private.r1_remove_expired_hosted_worker_logins()");
    expect(expired).toContain("rolname ~ '^mmhr_hosted_worker_[0-9a-f]{32}$'");
    expect(expired).toContain("rolvaliduntil <= clock_timestamp()");
    const remove = functionBody(sql, "CREATE FUNCTION mmhr_private.r1_remove_hosted_worker_login(");
    expect(remove).toContain("IF hosted_login.rolcanlogin");
    expect(remove.indexOf("pg_terminate_backend")).toBeLessThan(remove.indexOf("DROP ROLE"));
  });
});
