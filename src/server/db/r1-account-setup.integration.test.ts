import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { applyAllMigrations, startRehearsal, stopRehearsal, type RehearsalContext } from "./r1-migration-rehearsal";
import { asAuthenticated, createSecurityPrincipal, restrictAuthSubject, rollbackCase } from "./r1-security-command-fixtures";

describe("caller-only account setup read", () => {
  let context: RehearsalContext;
  beforeAll(async () => {
    context = await startRehearsal("r1-account-setup");
    await applyAllMigrations(context);
  }, 240_000);
  afterAll(async () => { if (context) await stopRehearsal(context); }, 180_000);

  test.each([true, false])("returns only pending caller setup fields, confirmed=%s", async (confirmed) => {
    await rollbackCase(context, async (sql) => {
      const principal = await createSecurityPrincipal(sql, "pending");
      await createSecurityPrincipal(sql, "pending");
      if (!confirmed) {
        await sql`UPDATE auth.users SET email_confirmed_at=NULL WHERE id=${principal.subject}::uuid`;
        await sql`UPDATE public.identities SET email_verified_at=NULL WHERE id=${principal.identityId}::uuid`;
      }
      const rows = await asAuthenticated(sql, principal, (probe) => probe`SELECT * FROM public.mmhr_get_my_account_setup()`, "aal1");
      expect(rows).toHaveLength(1);
      expect(Object.keys(rows[0]!).sort()).toEqual(["email_verified_at", "id", "status"]);
      expect(rows[0]).toMatchObject({ id: principal.identityId, status: "pending" });
      expect(rows[0]!.email_verified_at !== null).toBe(confirmed);
      const protectedRows = await asAuthenticated(sql, principal, (probe) => probe`SELECT * FROM public.mmhr_get_my_identity()`, "aal1");
      expect(protectedRows).toEqual([]);
      const [identity] = await sql`SELECT status FROM public.identities WHERE id=${principal.identityId}::uuid`;
      expect(identity!.status).toBe("pending");
    });
  });

  test("preserves the active caller read boundary", async () => {
    await rollbackCase(context, async (sql) => {
      const principal = await createSecurityPrincipal(sql);
      const rows = await asAuthenticated(sql, principal, (probe) => probe`SELECT * FROM public.mmhr_get_my_account_setup()`, "aal1");
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ id: principal.identityId, status: "active" });
    });
  });

  test.each(["banned", "deleted", "anonymous", "expired_session", "contained", "review", "email_mismatch"] as const)(
    "denies pending setup for %s", async (restriction) => {
      await rollbackCase(context, async (sql) => {
        const principal = await createSecurityPrincipal(sql, "pending");
        if (restriction === "banned" || restriction === "deleted" || restriction === "anonymous") {
          await restrictAuthSubject(sql, principal, restriction);
        }
        if (restriction === "expired_session") await sql`UPDATE auth.sessions SET not_after=now()-interval '1 hour' WHERE id=${principal.sessionId}::uuid`;
        if (restriction === "contained") await sql`UPDATE public.identities SET authorization_not_before=clock_timestamp() WHERE id=${principal.identityId}::uuid`;
        if (restriction === "review") await sql`UPDATE public.identities SET migration_review_required=true WHERE id=${principal.identityId}::uuid`;
        if (restriction === "email_mismatch") await sql`UPDATE auth.users SET email='mismatch@example.invalid' WHERE id=${principal.subject}::uuid`;
        await expect(asAuthenticated(sql, principal, (probe) => probe`SELECT * FROM public.mmhr_get_my_account_setup()`, "aal1"))
          .resolves.toEqual([]);
      });
    },
  );
});
