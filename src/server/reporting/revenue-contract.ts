import "server-only";

import { z } from "zod";

const uuid = z.uuid().transform((value) => value.toLowerCase());
const timestamp = z.iso.datetime({ offset: true });
const currency = z.string().regex(/^[A-Z]{3}$/);
const amountMinorUnits = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

export const revenueEventKinds = [
  "signed_deal",
  "commission_earned",
  "commission_invoiced",
  "commission_collected",
  "commission_outstanding",
  "commission_overdue",
  "commission_disputed",
] as const;
export type RevenueEventKind = (typeof revenueEventKinds)[number];

export const revenueEventSchema = z.strictObject({
  eventId: uuid,
  organizationId: uuid,
  dealId: uuid,
  occurredAt: timestamp,
  kind: z.enum(revenueEventKinds),
  amountMinorUnits,
  currency,
});

export type RevenueEvent = z.output<typeof revenueEventSchema>;

type CurrencyTotals = Readonly<{
  currency: string;
  amountMinorUnits: number;
  eventCount: number;
}>;

export type RevenueReport = Readonly<{
  asOf: string;
  organizationId: string;
  signedDealCount: number;
  totals: Readonly<Record<RevenueEventKind, readonly CurrencyTotals[]>>;
}>;

function parseAsOf(input: string | Date): string {
  const value = input instanceof Date ? input.toISOString() : input;
  if (!timestamp.safeParse(value).success) throw new Error("Invalid revenue report as-of timestamp");
  return value;
}

/** Builds organization-scoped revenue totals from immutable financial events. */
export function summarizeRevenue(eventsInput: readonly unknown[], organizationIdInput: string, asOfInput: string | Date): RevenueReport {
  const organizationResult = uuid.safeParse(organizationIdInput);
  const asOf = parseAsOf(asOfInput);
  if (!organizationResult.success) throw new Error("Invalid revenue report organization");
  const organizationId = organizationResult.data;
  const asOfMs = Date.parse(asOf);
  const seen = new Set<string>();
  const totals = new Map<RevenueEventKind, Map<string, { amountMinorUnits: number; eventCount: number }>>();
  for (const kind of revenueEventKinds) totals.set(kind, new Map());
  let signedDealCount = 0;

  for (const value of eventsInput) {
    const result = revenueEventSchema.safeParse(value);
    if (!result.success) throw new Error("Invalid revenue event");
    const event = result.data;
    if (seen.has(event.eventId)) throw new Error(`Duplicate revenue event: ${event.eventId}`);
    seen.add(event.eventId);
    if (event.organizationId !== organizationId) throw new Error(`Revenue event belongs to another organization: ${event.eventId}`);
    if (Date.parse(event.occurredAt) > asOfMs) throw new Error(`Revenue event is after report as-of timestamp: ${event.eventId}`);
    if (event.kind === "signed_deal") signedDealCount += 1;
    const byCurrency = totals.get(event.kind)!;
    const current = byCurrency.get(event.currency) ?? { amountMinorUnits: 0, eventCount: 0 };
    const nextAmount = current.amountMinorUnits + event.amountMinorUnits;
    if (!Number.isSafeInteger(nextAmount)) throw new Error("Revenue total exceeds safe integer");
    byCurrency.set(event.currency, { amountMinorUnits: nextAmount, eventCount: current.eventCount + 1 });
  }

  const frozenTotals = Object.fromEntries(revenueEventKinds.map((kind) => [
    kind,
    Object.freeze([...totals.get(kind)!.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([currencyValue, value]) => Object.freeze({ currency: currencyValue, ...value }))),
  ])) as Record<RevenueEventKind, readonly CurrencyTotals[]>;
  return Object.freeze({ asOf, organizationId, signedDealCount, totals: Object.freeze(frozenTotals) });
}

export { amountMinorUnits, currency, timestamp, uuid };
