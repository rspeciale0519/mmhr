import { afterAll, describe, expect, test } from "vitest";
import { sql } from "drizzle-orm";

import { db, leads, orgs } from "@/server/db";

describe("first migration", () => {
  afterAll(async () => {
    await db.delete(leads);
    await db.delete(orgs);
  });

  test("leads round-trip through the schema", async () => {
    const [row] = await db
      .insert(leads)
      .values({
        fullName: "Test Lead",
        company: "Acme Co",
        workEmail: "buyer@acme.com",
        phone: "555-0100",
        consentAt: new Date(),
      })
      .returning();

    expect(row.id).toBeTruthy();
    expect(row.status).toBe("new");
    expect(row.createdAt).toBeInstanceOf(Date);
  });

  test("orgs round-trip through the schema", async () => {
    const [org] = await db
      .insert(orgs)
      .values({ name: "Acme Co" })
      .returning();

    expect(org.id).toBeTruthy();
  });

  // The security model rides on RLS (TECH_STACK section 10). Policies remain incomplete,
  // but every org-scoped table must be default-deny from the very first
  // migration — a table that ships with RLS off is a data leak waiting to be
  // forgotten about.
  test("RLS is enabled on every application table", async () => {
    const rows = await db.execute<{ tablename: string; rowsecurity: boolean }>(
      sql`SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
    );

    const expected = [
      "audit_log",
      "invitations",
      "leads",
      "org_members",
      "orgs",
    ];
    expect(rows.map((r) => r.tablename)).toEqual(expected);
    for (const row of rows) {
      expect(row.rowsecurity, `RLS disabled on ${row.tablename}`).toBe(true);
    }
  });
});
