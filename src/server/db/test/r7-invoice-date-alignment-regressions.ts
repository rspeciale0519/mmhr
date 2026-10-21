import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "vitest";
import type { SecurityTransaction } from "../r1-security-command-fixtures";
import type { ManagedFinanceAuthFixture } from "./r7-managed-finance-auth-fixtures";
import { financeInvoices } from "@/server/db/schema/r7-finance";
import { managedInvoicePreparations } from "@/server/db/schema/r7-managed-invoice";

type Dependencies = {
  context(): ManagedFinanceAuthFixture;
  snapshot(): Promise<unknown>;
};

const migrationPath = "drizzle/0165_r7_invoice_date_alignment.sql";
const migrationHash = "a4d688fd04c9f85ff03629244180391f2007859ff31042e578aaae4008f65a14";
const deniedAlignment = {
  code: "42804",
  message: "Invoice date schema alignment requires existing nullable DATE columns",
};
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

/** Append to the existing genuine suite. All temporary DDL rolls back in its owned disposable database. */
export function registerInvoiceDateAlignmentRegressions(dependencies: Dependencies) {
  const owner = () => dependencies.context().fixture.owner;

  function alignmentSql() {
    const bytes = readFileSync(path.resolve(process.cwd(), migrationPath));
    expect(createHash("sha256").update(bytes).digest("hex"), "Exact reviewed DATE assertion bytes").toBe(migrationHash);
    return bytes.toString("utf8");
  }

  async function metadata() {
    const [row] = await owner()`WITH relations AS (
      SELECT c.oid,n.nspname,c.relname,c.relkind,c.relowner,c.relacl,c.relrowsecurity,c.relforcerowsecurity
      FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname IN ('public','mmhr_private') AND c.relkind IN ('r','p','v','m','S','f')
    ) SELECT jsonb_build_object(
      'schemas',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',nspname,'owner',nspowner,'acl',nspacl)
        ORDER BY nspname),'[]') FROM pg_catalog.pg_namespace WHERE nspname IN ('public','mmhr_private')),
      'relations',(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY nspname,relname),'[]') FROM relations r),
      'columns',(SELECT coalesce(jsonb_agg(jsonb_build_object('relation',a.attrelid,'number',a.attnum,
        'name',a.attname,'type',a.atttypid,'modifier',a.atttypmod,'notNull',a.attnotnull,
        'dropped',a.attisdropped,'acl',a.attacl,'identity',a.attidentity,'generated',a.attgenerated,
        'collation',a.attcollation,'default',pg_catalog.pg_get_expr(d.adbin,d.adrelid))
        ORDER BY a.attrelid,a.attnum),'[]') FROM pg_catalog.pg_attribute a JOIN relations r ON r.oid=a.attrelid
        LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attnum>0),
      'policies',(SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.polrelid,p.polname),'[]')
        FROM pg_catalog.pg_policy p JOIN relations r ON r.oid=p.polrelid),
      'constraints',(SELECT coalesce(jsonb_agg(jsonb_build_object('record',to_jsonb(c),
        'definition',pg_catalog.pg_get_constraintdef(c.oid,false)) ORDER BY c.conrelid,c.conname),'[]')
        FROM pg_catalog.pg_constraint c JOIN relations r ON r.oid=c.conrelid),
      'indexes',(SELECT coalesce(jsonb_agg(jsonb_build_object('record',to_jsonb(i),
        'definition',pg_catalog.pg_get_indexdef(i.indexrelid)) ORDER BY i.indexrelid),'[]')
        FROM pg_catalog.pg_index i JOIN relations r ON r.oid=i.indrelid),
      'triggers',(SELECT coalesce(jsonb_agg(jsonb_build_object('record',to_jsonb(t),
        'definition',pg_catalog.pg_get_triggerdef(t.oid,false)) ORDER BY t.tgrelid,t.tgname),'[]')
        FROM pg_catalog.pg_trigger t JOIN relations r ON r.oid=t.tgrelid),
      'functions',(SELECT coalesce(jsonb_agg(jsonb_build_object('oid',p.oid,'schema',n.nspname,
        'name',p.proname,'arguments',pg_catalog.pg_get_function_identity_arguments(p.oid),
        'result',pg_catalog.pg_get_function_result(p.oid),'owner',p.proowner,'acl',p.proacl,
        'securityDefiner',p.prosecdef,'volatility',p.provolatile,'parallel',p.proparallel,
        'strict',p.proisstrict,'leakproof',p.proleakproof,'config',p.proconfig,
        'definition',pg_catalog.pg_get_functiondef(p.oid)) ORDER BY p.oid),'[]')
        FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname IN ('public','mmhr_private') AND p.prokind='f')) proof`;
    return digest(row!.proof);
  }

  async function state() {
    const [extra] = await owner()`SELECT jsonb_build_object(
      'payments',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM public.commission_payments x),
      'disputes',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM public.finance_disputes x),
      'adjustments',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM public.finance_adjustments x),
      'handoffs',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM public.finance_handoffs x)) proof`;
    return { rows: digest({ existing: await dependencies.snapshot(), extra: extra!.proof }), metadata: await metadata() };
  }

  async function populated() {
    const fixture = dependencies.context().fixture;
    expect(fixture.isolation.apiLoopbackOnly).toBe(true);
    const [proof] = await owner()`SELECT
      (SELECT count(*)::integer FROM public.finance_invoices) invoices,
      (SELECT count(*)::integer FROM public.managed_invoice_events) history,
      (SELECT count(*)::integer FROM public.security_command_receipts) receipts,
      (SELECT count(*)::integer FROM public.finance_invoices WHERE issue_date IS NULL) null_issue_dates,
      (SELECT count(*)::integer FROM public.finance_invoices WHERE due_date IS NULL) null_due_dates`;
    expect(proof!.invoices, "Actual earlier invoice journeys must populate this fixture").toBeGreaterThan(0);
    expect(proof!.history).toBeGreaterThan(0);
    expect(proof!.receipts).toBeGreaterThan(0);
    return proof!;
  }

  async function malformed(variant: (sql: SecurityTransaction) => Promise<void>) {
    await populated();
    const before = await state();
    let reachedAssertion = false;
    try {
      await expect(owner().begin(async sql => {
        await variant(sql);
        reachedAssertion = true;
        await sql.unsafe(alignmentSql());
        // A defective assertion must fail this test without committing the deliberately malformed schema.
        throw new Error("Invoice DATE assertion unexpectedly accepted a malformed schema");
      })).rejects.toMatchObject(deniedAlignment);
      expect(reachedAssertion, "The malformed real table must reach the exact migration assertion").toBe(true);
    } finally {
      // No restored grants or column conversions are needed: PostgreSQL rolls back the complete owner transaction.
      expect(await state(), "Full rows/history/receipts and authorization/function metadata after rollback").toEqual(before);
    }
  }

  test("reapplies exact DATE alignment on populated invoices without changing rows, evidence or authorization", async () => {
    for (const column of [financeInvoices.issueDate, financeInvoices.dueDate]) {
      expect(column.getSQLType()).toBe("date");
      expect(column.dataType).toBe("string");
      expect(column.notNull).toBe(false);
      expect(column.mapFromDriverValue("2026-10-03")).toBe("2026-10-03");
    }
    const preciseInstants = ["2026-10-03 23:59:59.999999+00", "2026-10-04 00:00:00.000001+00"];
    for (const [index, column] of [managedInvoicePreparations.issueDate, managedInvoicePreparations.dueDate].entries()) {
      expect(column.getSQLType()).toBe("timestamp with time zone");
      expect(column.dataType).toBe("string");
      expect(column.notNull).toBe(true);
      expect(column.mapFromDriverValue(preciseInstants[index]!)).toBe(preciseInstants[index]);
    }
    const generated = JSON.parse(readFileSync(path.resolve(process.cwd(), "drizzle/meta/0165_snapshot.json"), "utf8"));
    expect(generated).toMatchObject({ dialect: "postgresql", tables: { "public.finance_invoices": { columns: {
      issue_date: { name: "issue_date", type: "date", notNull: false },
      due_date: { name: "due_date", type: "date", notNull: false },
    } } } });
    await populated();
    const before = await state();
    await owner().begin(async sql => {
      await sql.unsafe(alignmentSql());
      await sql.unsafe(alignmentSql());
    });
    expect(await state()).toEqual(before);
  }, 60_000);

  test("rejects a real wrong-type invoice date with 42804 and retains every original DATE value after rollback", async () => {
    await malformed(async sql => {
      // Keep all original values and dependent objects attached to the saved column; do not convert them.
      await sql`ALTER TABLE public.finance_invoices RENAME COLUMN issue_date TO r7_alignment_saved_issue_date`;
      await sql`ALTER TABLE public.finance_invoices ADD COLUMN issue_date timestamp with time zone`;
      const [proof] = await sql`SELECT pg_catalog.format_type(atttypid,atttypmod) type,attnotnull
        FROM pg_catalog.pg_attribute WHERE attrelid='public.finance_invoices'::regclass
        AND attname='issue_date' AND attnum>0 AND NOT attisdropped`;
      expect(proof).toMatchObject({ type: "timestamp with time zone", attnotnull: false });
    });
  }, 60_000);

  test("rejects a missing original invoice date column with 42804 and rolls back its temporary rename", async () => {
    await malformed(async sql => {
      await sql`ALTER TABLE public.finance_invoices RENAME COLUMN due_date TO r7_alignment_saved_due_date`;
      const [proof] = await sql`SELECT count(*)::integer count FROM pg_catalog.pg_attribute
        WHERE attrelid='public.finance_invoices'::regclass AND attname='due_date' AND attnum>0 AND NOT attisdropped`;
      expect(proof!.count).toBe(0);
    });
  }, 60_000);

  test("rejects changed invoice date nullability with 42804 and restores the original nullable column", async () => {
    const proof = await populated();
    // A real null is never filled or deleted to make the temporary schema alteration succeed.
    expect(proof.null_issue_dates, "Populated managed invoice dates must permit this negative DDL setup").toBe(0);
    await malformed(async sql => {
      await sql`ALTER TABLE public.finance_invoices ALTER COLUMN issue_date SET NOT NULL`;
      const [column] = await sql`SELECT atttypid='pg_catalog.date'::regtype is_date,attnotnull
        FROM pg_catalog.pg_attribute WHERE attrelid='public.finance_invoices'::regclass
        AND attname='issue_date' AND attnum>0 AND NOT attisdropped`;
      expect(column).toMatchObject({ is_date: true, attnotnull: true });
    });
  }, 60_000);
}
