import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

const migration = readFileSync(join(process.cwd(), "drizzle", "0021_r7_finance_persistence.sql"), "utf8");

describe("R7 finance migration review", () => {
  test("creates commission and finance tables", () => {
    for (const table of ["commission_structures", "commission_events", "commission_event_history", "commission_payments", "finance_invoices", "finance_disputes", "finance_adjustments", "finance_handoffs"]) {
      expect(migration).toContain(`CREATE TABLE public.${table}`);
    }
  });

  test("enables RLS and revokes raw access for every table", () => {
    expect((migration.match(/ENABLE ROW LEVEL SECURITY/g) ?? []).length).toBe(8);
    expect(migration).toContain("FROM PUBLIC, anon, authenticated, service_role, mmhr_worker");
  });

  test("installs restrictive deny policies for every table", () => {
    expect((migration.match(/AS RESTRICTIVE FOR ALL TO anon, authenticated USING \(false\) WITH CHECK \(false\)/g) ?? []).length).toBe(8);
  });

  test("enforces effective-dated commission structure bounds", () => {
    expect(migration).toContain("commission_structures_amount_ck");
    expect(migration).toContain("commission_structures_dates_ck");
    expect(migration).toContain("commission_structures_currency_ck");
  });

  test("enforces one idempotent event per organization and deal scope", () => {
    expect(migration).toContain("commission_events_idempotency_uq");
    expect(migration).toContain("commission_events_deal_scope_fk");
    expect(migration).toContain("commission_events_state_ck");
  });

  test("preserves payment and invoice reconciliation bounds", () => {
    expect(migration).toContain("commission_payments_scope_fk");
    expect(migration).toContain("commission_payments_amount_ck");
    expect(migration).toContain("finance_invoices_issue_ck");
    expect(migration).toContain("finance_invoices_dates_ck");
  });

  test("requires resolved dispute and approved adjustment evidence", () => {
    expect(migration).toContain("finance_disputes_resolution_ck");
    expect(migration).toContain("finance_disputes_time_ck");
    expect(migration).toContain("finance_adjustments_direction_ck");
    expect(migration).toContain("finance_adjustments_time_ck");
  });

  test("keeps finance handoffs and history organization-scoped", () => {
    expect(migration).toContain("commission_event_history_scope_fk");
    expect(migration).toContain("finance_handoffs_source_ck");
    expect(migration).toContain("R7 approved finance export or handoff references only");
  });
});
