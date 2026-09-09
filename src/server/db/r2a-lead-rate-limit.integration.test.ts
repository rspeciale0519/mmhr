import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

import { createLead } from "@/server/commands/lead-create";

import {
  applyAllMigrations,
  startRehearsal,
  stopRehearsal,
  type RehearsalContext,
} from "./r1-migration-rehearsal";
import {
  rollbackCase,
  type SecuritySql,
  type SecurityTransaction,
} from "./r1-security-command-fixtures";

const rateKey = "0".repeat(64);
const consentAt = "2026-01-01T00:00:00.000Z";

type LeadRow = {
  lead_id: string | null;
  status: string | null;
  owner_identity_id: string | null;
  outcome_code: string;
  correlation_id: string;
};

type LeadPayload = {
  fullName: string;
  company: string;
  workEmail: string;
  phone: string;
  source: string;
  consentAt: string | null;
  idempotencyKey: string;
};

let context: RehearsalContext | undefined;

function source() {
  return `r2a-rate-${randomUUID().replaceAll("-", "")}`;
}

function payload(
  idempotencyKey = randomUUID(),
  suffix = randomUUID(),
  leadSource = source(),
): LeadPayload {
  return {
    fullName: `Rate Limit Lead ${suffix}`,
    company: `Rate Limit Company ${suffix}`,
    workEmail: `buyer-${suffix}@example.invalid`,
    phone: "+12125550100",
    source: leadSource,
    consentAt,
    idempotencyKey,
  };
}

async function asAnonymous<T>(
  transaction: SecurityTransaction,
  callback: (sql: SecurityTransaction) => Promise<T>,
): Promise<T> {
  const completed = await transaction.savepoint(async (probe) => {
    await probe`SET LOCAL ROLE anon`;
    const result = await callback(probe);
    await probe`RESET ROLE`;
    return { value: result };
  });
  return completed.value;
}

async function callLead(
  transaction: SecurityTransaction,
  input: LeadPayload,
): Promise<LeadRow> {
  return asAnonymous(transaction, async (probe) => {
    const [row] = await probe<LeadRow[]>`
      SELECT * FROM public.mmhr_create_lead(
        ${input.fullName}, ${input.company}, ${input.workEmail}, ${input.phone},
        ${input.source}, ${input.consentAt}::timestamptz, ${input.idempotencyKey}::uuid
      )
    `;
    expect(row).toBeDefined();
    return row!;
  });
}

async function seedWindow(
  sql: SecuritySql,
  count: number,
  offsetMinutes = 0,
) {
  await sql`
    INSERT INTO public.lead_rate_limits (rate_key, window_started_at, request_count, updated_at)
    SELECT ${rateKey},
      to_timestamp(floor(extract(epoch FROM clock_timestamp()) / 900) * 900)
        + (${offsetMinutes}::int * interval '1 minute'),
      ${count}, clock_timestamp()
    ON CONFLICT (rate_key, window_started_at) DO UPDATE
      SET request_count = EXCLUDED.request_count, updated_at = EXCLUDED.updated_at
  `;
}

async function currentWindowCount(sql: SecuritySql) {
  const rows = await sql<{ request_count: number }[]>`
    SELECT request_count
    FROM public.lead_rate_limits
    WHERE rate_key = ${rateKey}
      AND window_started_at = to_timestamp(floor(extract(epoch FROM clock_timestamp()) / 900) * 900)
  `;
  return rows[0]?.request_count ?? 0;
}

async function countLeads(sql: SecuritySql, idempotencyKey: string) {
  const rows = await sql<{ count: number }[]>`
    SELECT count(*)::int AS count
    FROM public.leads
    WHERE idempotency_key = ${idempotencyKey}::uuid
  `;
  return rows[0]!.count;
}

async function countAudits(sql: SecuritySql, idempotencyKeys: readonly string[]) {
  let count = 0;
  for (const idempotencyKey of idempotencyKeys) {
    const rows = await sql<{ count: number }[]>`
      SELECT count(*)::int AS count
      FROM public.audit_events
      WHERE command = 'crm.leads.create'
        AND idempotency_key = ${idempotencyKey}
    `;
    count += rows[0]!.count;
  }
  return count;
}

async function countLeadsByKeys(sql: SecuritySql, idempotencyKeys: readonly string[]) {
  let count = 0;
  for (const idempotencyKey of idempotencyKeys) count += await countLeads(sql, idempotencyKey);
  return count;
}

async function waitForStableWindow(sql: SecuritySql) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const rows = await sql<{ remaining_seconds: number }[]>`
      SELECT (900 - (floor(extract(epoch FROM clock_timestamp()))::bigint % 900))::int AS remaining_seconds
    `;
    if ((rows[0]?.remaining_seconds ?? 0) >= 10) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Could not obtain a stable 15-minute window within 10 seconds");
}

async function clearTestState(sql: SecuritySql) {
  await sql`DELETE FROM public.lead_rate_limits WHERE rate_key = ${rateKey}`;
}

describe("R2A durable aggregate lead rate limit", () => {
  beforeAll(async () => {
    context = await startRehearsal("r2a-lead-rate-limit");
    await applyAllMigrations(context);
  }, 240_000);

  afterAll(async () => {
    if (context) await stopRehearsal(context);
  }, 180_000);

  test("denies anonymous table and helper access while RLS survives a temporary grant", async () => {
    await rollbackCase(context!, async (sql) => {
      await seedWindow(sql, 0);
      await sql`GRANT SELECT ON public.lead_rate_limits TO anon`;
      await expect(asAnonymous(sql, (probe) => probe`SELECT * FROM public.lead_rate_limits`))
        .resolves.toEqual([]);
      await expect(asAnonymous(sql, (probe) => probe`SELECT mmhr_private.r2a_consume_lead_rate_limit()`))
        .rejects.toMatchObject({ code: "42501" });
    });

    await context!.client.begin(async (sql) => {
      await expect(asAnonymous(sql, (probe) => probe`SELECT * FROM public.lead_rate_limits`))
        .rejects.toMatchObject({ code: "42501" });
      await expect(asAnonymous(sql, (probe) => probe`SELECT mmhr_private.r2a_consume_lead_rate_limit()`))
        .rejects.toMatchObject({ code: "42501" });
    });
  });

  test("accepts the 100th write and rolls back the 101st lead and audit", async () => {
    await rollbackCase(context!, async (sql) => {
      await waitForStableWindow(sql);
      await seedWindow(sql, 99);
      const accepted = payload();
      const acceptedRow = await callLead(sql, accepted);
      expect(acceptedRow.outcome_code).toBe("created");
      expect(await currentWindowCount(sql)).toBe(100);

      const denied = payload();
      const deniedRow = await callLead(sql, denied);
      expect(deniedRow).toMatchObject({
        lead_id: null,
        status: null,
        owner_identity_id: null,
        outcome_code: "rate_limited",
      });
      expect(await currentWindowCount(sql)).toBe(100);
      expect(await countLeadsByKeys(sql, [accepted.idempotencyKey, denied.idempotencyKey])).toBe(1);
      expect(await countLeads(sql, denied.idempotencyKey)).toBe(0);
      expect(await countAudits(sql, [accepted.idempotencyKey, denied.idempotencyKey])).toBe(1);
      expect(await countAudits(sql, [denied.idempotencyKey])).toBe(0);
    });
  }, 120_000);

  test("invalid input, replay, and conflict do not consume accepted-write capacity", async () => {
    await rollbackCase(context!, async (sql) => {
      await waitForStableWindow(sql);
      await seedWindow(sql, 0);
      const invalid = payload();
      invalid.consentAt = null;
      expect((await callLead(sql, invalid)).outcome_code).toBe("invalid_input");
      expect(await currentWindowCount(sql)).toBe(0);
      expect(await countAudits(sql, [invalid.idempotencyKey])).toBe(0);

      const created = payload();
      const first = await callLead(sql, created);
      expect(first.outcome_code).toBe("created");
      expect((await callLead(sql, created)).outcome_code).toBe("replayed");
      expect((await callLead(sql, { ...created, company: "Different Company" })).outcome_code)
        .toBe("idempotency_conflict");
      expect(await currentWindowCount(sql)).toBe(1);
      expect(await countLeads(sql, created.idempotencyKey)).toBe(1);
      expect(await countAudits(sql, [created.idempotencyKey])).toBe(1);
    });
  }, 120_000);

  test("starts a fresh window after a saturated adjacent window", async () => {
    await rollbackCase(context!, async (sql) => {
      await waitForStableWindow(sql);
      await sql`
        WITH bounds AS (
          SELECT to_timestamp(floor(extract(epoch FROM clock_timestamp()) / 900) * 900) AS started_at
        )
        INSERT INTO public.lead_rate_limits (rate_key, window_started_at, request_count, updated_at)
        SELECT ${rateKey}, started_at + offsets.minutes * interval '1 minute', offsets.request_count, clock_timestamp()
        FROM bounds
        CROSS JOIN (VALUES (-15, 100), (0, 0), (15, 0)) AS offsets(minutes, request_count)
        ON CONFLICT (rate_key, window_started_at) DO UPDATE
          SET request_count = EXCLUDED.request_count, updated_at = EXCLUDED.updated_at
      `;

      expect((await callLead(sql, payload())).outcome_code).toBe("created");
      expect(await currentWindowCount(sql)).toBe(1);
      const previous = await sql<{ request_count: number }[]>`
        SELECT request_count FROM public.lead_rate_limits
        WHERE rate_key = ${rateKey}
          AND window_started_at = to_timestamp(floor(extract(epoch FROM clock_timestamp()) / 900) * 900) - interval '15 minutes'
      `;
      expect(previous[0]?.request_count).toBe(100);
    });
  }, 120_000);

  test("allows only the remaining capacity for concurrent distinct writes", async () => {
    await context!.client.begin(async (sql) => {
      await clearTestState(sql);
      await waitForStableWindow(sql);
      await seedWindow(sql, 98);
    });
    const inputs = [payload(), payload(), payload(), payload()];
    try {
      const results = await Promise.all(inputs.map((input) =>
        context!.client.begin((sql) => callLead(sql, input)),
      ));
      expect(results.filter((row) => row.outcome_code === "created")).toHaveLength(2);
      expect(results.filter((row) => row.outcome_code === "rate_limited")).toHaveLength(2);
      await context!.client.begin(async (sql) => {
        expect(await currentWindowCount(sql)).toBe(100);
        expect(await countLeadsByKeys(sql, inputs.map((input) => input.idempotencyKey))).toBe(2);
        expect(await countAudits(sql, inputs.map((input) => input.idempotencyKey))).toBe(2);
      });
    } finally {
      await context!.client.begin(clearTestState);
    }
  }, 120_000);

  test("replays one concurrent idempotency key without consuming twice", async () => {
    await context!.client.begin(async (sql) => {
      await clearTestState(sql);
      await waitForStableWindow(sql);
      await seedWindow(sql, 99);
    });
    const input = payload();
    try {
      const results = await Promise.all([
        context!.client.begin((sql) => callLead(sql, input)),
        context!.client.begin((sql) => callLead(sql, input)),
      ]);
      expect(results.map((row) => row.outcome_code).sort()).toEqual(["created", "replayed"]);
      await context!.client.begin(async (sql) => {
        expect(await currentWindowCount(sql)).toBe(100);
        expect(await countLeads(sql, input.idempotencyKey)).toBe(1);
        expect(await countAudits(sql, [input.idempotencyKey])).toBe(1);
      });
    } finally {
      await context!.client.begin(clearTestState);
    }
  }, 120_000);

  test("the adapter accepts actual SQL result columns through an injected RPC", async () => {
    await rollbackCase(context!, async (sql) => {
      const input = payload();
      const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
        expect(name).toBe("mmhr_create_lead");
        const row = await callLead(sql, {
          fullName: String(args.full_name), company: String(args.company),
          workEmail: String(args.work_email), phone: String(args.phone),
          source: String(args.source), consentAt: String(args.consent_at),
          idempotencyKey: String(args.idempotency_key),
        });
        return { data: [row], error: null };
      });
      const { phone, ...fields } = input;
      const result = await createLead({ ...fields, directCompanyPhone: phone }, { supabase: { rpc } as never });
      const response = await rpc.mock.results[0]!.value;
      const row = response.data[0]!;
      expect(result).toMatchObject({
        leadId: row.lead_id,
        status: row.status,
        ownerIdentityId: row.owner_identity_id,
        outcomeCode: row.outcome_code,
        correlationId: row.correlation_id,
      });
      expect(result.outcomeCode).toBe("created");
    });
  }, 120_000);
});
