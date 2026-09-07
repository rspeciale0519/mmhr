import {
  createHash,
  createHmac,
  pbkdf2Sync,
  randomBytes,
} from "node:crypto";

import { afterAll, describe, expect, test } from "vitest";
import { inArray, sql } from "drizzle-orm";
import postgres from "postgres";

import { db, leads, orgs } from "@/server/db";
import { applicationTables } from "@/server/db/test/application-schema-inventory";
import { createTestMigrationOwner } from "@/server/db/test/migration-owner";

const owner = createTestMigrationOwner();
const createdLeadIds: string[] = [];
const createdOrgIds: string[] = [];

function createScramVerifier(password: string) {
  const iterations = 4096;
  const salt = randomBytes(16);
  const saltedPassword = pbkdf2Sync(password, salt, iterations, 32, "sha256");
  const clientKey = createHmac("sha256", saltedPassword)
    .update("Client Key")
    .digest();
  const storedKey = createHash("sha256").update(clientKey).digest("base64");
  const serverKey = createHmac("sha256", saltedPassword)
    .update("Server Key")
    .digest("base64");
  return `SCRAM-SHA-256$${iterations}:${salt.toString("base64")}$${storedKey}:${serverKey}`;
}

describe("R1.2 database boundary", () => {
  afterAll(async () => {
    try {
      if (createdLeadIds.length > 0) {
        await owner.db.delete(leads).where(inArray(leads.id, createdLeadIds));
      }
      if (createdOrgIds.length > 0) {
        await owner.db.delete(orgs).where(inArray(orgs.id, createdOrgIds));
      }
    } finally {
      await owner.close();
    }
  });

  test("migration-owner fixtures can prepare local data", async () => {
    const [row] = await owner.db
      .insert(leads)
      .values({
        fullName: "Test Lead",
        company: "Acme Co",
        workEmail: "buyer@acme.com",
        phone: "555-0100",
        consentAt: new Date(),
      })
      .returning();
    createdLeadIds.push(row.id);

    expect(row.id).toBeTruthy();
    expect(row.status).toBe("new");
    expect(row.createdAt).toBeInstanceOf(Date);
  });

  test("orgs round-trip through the schema", async () => {
    const [org] = await owner.db
      .insert(orgs)
      .values({ name: "Acme Co" })
      .returning();
    createdOrgIds.push(org.id);

    expect(org.id).toBeTruthy();
  });

  test("RLS is enabled on every application table", async () => {
    const rows = await owner.db.execute<{
      tablename: string;
      rowsecurity: boolean;
    }>(
      sql`SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
    );

    expect(rows.map((r) => r.tablename)).toEqual(applicationTables);
    for (const row of rows) {
      expect(row.rowsecurity, `RLS disabled on ${row.tablename}`).toBe(true);
    }
  });

  test("the runtime connection is an expiring restricted worker", async () => {
    const [role] = await db.execute<{
      rolname: string;
      rolsuper: boolean;
      rolcreatedb: boolean;
      rolcreaterole: boolean;
      rolcanlogin: boolean;
      rolreplication: boolean;
      rolbypassrls: boolean;
      worker_member: boolean;
    }>(sql`
      SELECT
        role.rolname,
        role.rolsuper,
        role.rolcreatedb,
        role.rolcreaterole,
        role.rolcanlogin,
        role.rolreplication,
        role.rolbypassrls,
        pg_has_role(current_user, 'mmhr_worker', 'member') AS worker_member
      FROM pg_roles AS role
      WHERE role.rolname = current_user
    `);

    expect(role.rolname).toMatch(/^mmhr_worker_[0-9a-f]{32}$/);
    expect(role).toMatchObject({
      rolsuper: false,
      rolcreatedb: false,
      rolcreaterole: false,
      rolcanlogin: true,
      rolreplication: false,
      rolbypassrls: false,
      worker_member: true,
    });
  });

  test("the shared worker role is locked and cannot log in", async () => {
    const [role] = await db.execute<{
      rolname: string;
      rolsuper: boolean;
      rolcreatedb: boolean;
      rolcreaterole: boolean;
      rolcanlogin: boolean;
      rolinherit: boolean;
      rolreplication: boolean;
      rolbypassrls: boolean;
    }>(sql`
      SELECT rolname, rolsuper, rolcreatedb, rolcreaterole, rolcanlogin,
        rolinherit, rolreplication, rolbypassrls
      FROM pg_roles
      WHERE rolname = 'mmhr_worker'
    `);

    expect(role).toEqual({
      rolname: "mmhr_worker",
      rolsuper: false,
      rolcreatedb: false,
      rolcreaterole: false,
      rolcanlogin: false,
      rolinherit: false,
      rolreplication: false,
      rolbypassrls: false,
    });
  });

  test("the shared worker role rejects unexpected members", async () => {
    const roleName = `r1_unexpected_${randomBytes(8).toString("hex")}`;

    await owner.client.begin(async (transaction) => {
      await transaction`
        CREATE ROLE ${transaction(roleName)}
        NOLOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE
        NOREPLICATION NOBYPASSRLS
      `;
      await transaction`
        GRANT mmhr_worker TO ${transaction(roleName)}
        WITH ADMIN FALSE, INHERIT TRUE, SET TRUE
      `;

      const [result] = await transaction<{ safe: boolean }[]>`
        SELECT mmhr_private.r1_worker_role_is_safe() AS safe
      `;
      expect(result!.safe).toBe(false);

      await transaction`REVOKE mmhr_worker FROM ${transaction(roleName)}`;
      await transaction`DROP ROLE ${transaction(roleName)}`;
    });
  });

  test("the worker has no raw table privileges", async () => {
    const privileges = await db.execute<{
      table_name: string;
      privilege: string;
      allowed: boolean;
    }>(sql`
      SELECT
        tables.tablename AS table_name,
        privileges.privilege,
        has_table_privilege(
          current_user,
          format('%I.%I', tables.schemaname, tables.tablename),
          privileges.privilege
        ) AS allowed
      FROM pg_tables AS tables
      CROSS JOIN unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']::text[]) AS privileges(privilege)
      WHERE tables.schemaname = 'public'
      ORDER BY tables.tablename, privileges.privilege
    `);

    expect(privileges).toHaveLength(applicationTables.length * 7);
    expect(privileges.every((item) => !item.allowed)).toBe(true);
  });

  test("raw worker DML fails closed", async () => {
    await expect(
      db.insert(leads).values({
        fullName: "Blocked Worker",
        company: "Blocked Co",
        workEmail: "blocked@example.com",
        phone: "555-0199",
        consentAt: new Date(),
      }),
    ).rejects.toThrow();
  });

  test("owner cleanup terminates active ephemeral worker sessions", async () => {
    const loginName = `mmhr_worker_${randomBytes(16).toString("hex")}`;
    const credential = randomBytes(32).toString("base64url");
    await owner.client`
      SELECT mmhr_private.r1_create_ephemeral_worker_login(
        ${loginName},
        ${createScramVerifier(credential)},
        ${new Date(Date.now() + 5 * 60 * 1_000).toISOString()}
      )
    `;

    const workerUrl = new URL(process.env.TEST_MIGRATION_DATABASE_URL!);
    workerUrl.username = loginName;
    workerUrl.password = credential;
    const probe = postgres(workerUrl.toString(), {
      max: 1,
      max_lifetime: 60,
      prepare: false,
    });

    try {
      const [connected] = await probe<{ role_name: string }[]>`
        SELECT current_user AS role_name
      `;
      expect(connected!.role_name).toBe(loginName);

      const [active] = await owner.client<{ count: number }[]>`
        SELECT count(*)::integer AS count
        FROM pg_stat_activity
        WHERE usename = ${loginName}
      `;
      expect(active!.count).toBeGreaterThan(0);

      await owner.client`
        SELECT mmhr_private.r1_disable_ephemeral_worker_login(${loginName})
      `;
      await owner.client`
        SELECT mmhr_private.r1_remove_ephemeral_worker_login(${loginName})
      `;
      const [remaining] = await owner.client<{ exists: boolean }[]>`
        SELECT EXISTS (
          SELECT 1 FROM pg_roles WHERE rolname = ${loginName}
        ) AS exists
      `;
      expect(remaining!.exists).toBe(false);
      await expect(probe`SELECT 1`).rejects.toThrow();
    } finally {
      await probe.end({ timeout: 1 });
      await owner.client`
        SELECT mmhr_private.r1_disable_ephemeral_worker_login(${loginName})
      `;
      await owner.client`
        SELECT mmhr_private.r1_remove_ephemeral_worker_login(${loginName})
      `;
    }
  });

  test("commits login lockout before risky role removal", async () => {
    const loginName = `mmhr_worker_${randomBytes(16).toString("hex")}`;
    const credential = randomBytes(32).toString("base64url");

    try {
      await owner.client`
        SELECT mmhr_private.r1_create_ephemeral_worker_login(
          ${loginName},
          ${createScramVerifier(credential)},
          ${new Date(Date.now() + 5 * 60 * 1_000).toISOString()}
        )
      `;
      await owner.client`
        GRANT SELECT ON public.leads TO ${owner.client(loginName)}
      `;

      await owner.client`
        SELECT mmhr_private.r1_disable_ephemeral_worker_login(${loginName})
      `;
      await expect(
        owner.client`
          SELECT mmhr_private.r1_remove_ephemeral_worker_login(${loginName})
        `,
      ).rejects.toThrow();

      const [locked] = await owner.client<
        {
          rolcanlogin: boolean;
          password_cleared: boolean;
          expired: boolean;
        }[]
      >`
        SELECT
          rolcanlogin,
          rolpassword IS NULL AS password_cleared,
          rolvaliduntil <= clock_timestamp() AS expired
        FROM pg_authid
        WHERE rolname = ${loginName}
      `;
      expect(locked).toEqual({
        rolcanlogin: false,
        password_cleared: true,
        expired: true,
      });
    } finally {
      await owner.client`
        REVOKE ALL PRIVILEGES ON public.leads FROM ${owner.client(loginName)}
      `;
      await owner.client`
        SELECT mmhr_private.r1_disable_ephemeral_worker_login(${loginName})
      `;
      await owner.client`
        SELECT mmhr_private.r1_remove_ephemeral_worker_login(${loginName})
      `;
    }
  });
});
