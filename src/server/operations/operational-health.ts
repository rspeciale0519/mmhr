import "server-only";

import { z } from "zod";

/**
 * Provider-neutral health events for internal operations reporting.
 *
 * Events contain opaque references and counters only. They do not carry
 * message content, names, contact details, or analytics properties.
 */
export const operationalHealthKinds = [
  "application_error",
  "job_outcome",
  "communication_delivery",
  "ai_run",
  "provider_cost",
] as const;

export type OperationalHealthKind = (typeof operationalHealthKinds)[number];

export const operationalHealthOutcomes = ["success", "failure", "pending", "unknown"] as const;
export type OperationalHealthOutcome = (typeof operationalHealthOutcomes)[number];

const identifier = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/, "Identifier contains unsupported characters");
const uuid = z.uuid().transform((value) => value.toLowerCase());
const timestamp = z.iso.datetime({ offset: true });
const currency = z.string().regex(/^[A-Z]{3}$/);
const minorUnits = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

export const operationalHealthEventSchema = z
  .strictObject({
    eventId: uuid,
    organizationId: uuid,
    occurredAt: timestamp,
    kind: z.enum(operationalHealthKinds),
    outcome: z.enum(operationalHealthOutcomes),
    sourceId: identifier.nullable(),
    providerId: identifier.nullable(),
    durationMs: z.number().int().nonnegative().max(86_400_000).nullable(),
    costMinorUnits: minorUnits.nullable(),
    currency: currency.nullable(),
  })
  .superRefine((event, context) => {
    if ((event.costMinorUnits === null) !== (event.currency === null)) {
      context.addIssue({
        code: "custom",
        path: [event.costMinorUnits === null ? "currency" : "costMinorUnits"],
        message: "Cost and currency must be provided together",
      });
    }
    if (event.kind === "provider_cost" && event.costMinorUnits === null) {
      context.addIssue({
        code: "custom",
        path: ["costMinorUnits"],
        message: "Provider cost events require a cost",
      });
    }
    if (["job_outcome", "communication_delivery", "ai_run"].includes(event.kind) && event.sourceId === null) {
      context.addIssue({
        code: "custom",
        path: ["sourceId"],
        message: "Operational outcome events require a source",
      });
    }
  });

export type OperationalHealthEvent = z.output<typeof operationalHealthEventSchema>;

type HealthCounts = Readonly<{
  total: number;
  success: number;
  failure: number;
  pending: number;
  unknown: number;
}>;

export type OperationalHealthReport = Readonly<{
  asOf: string;
  organizationId: string;
  totalEvents: number;
  byKind: Readonly<Record<OperationalHealthKind, HealthCounts>>;
  costByCurrency: readonly Readonly<{ currency: string; totalMinorUnits: number }>[];
}>;

function parseAsOf(value: string | Date): string {
  const asOf = value instanceof Date ? value.toISOString() : value;
  if (!timestamp.safeParse(asOf).success) throw new Error("Invalid operational health as-of timestamp");
  return asOf;
}

function parseOrganizationId(value: string): string {
  const parsed = uuid.safeParse(value);
  if (!parsed.success) throw new Error("Invalid operational health organization");
  return parsed.data;
}

function parseEvent(value: unknown): OperationalHealthEvent {
  const parsed = operationalHealthEventSchema.safeParse(value);
  if (!parsed.success) throw new Error("Invalid operational health event");
  return parsed.data;
}

function emptyCounts(): { total: number; success: number; failure: number; pending: number; unknown: number } {
  return { total: 0, success: 0, failure: 0, pending: 0, unknown: 0 };
}

function emptyKinds(): Record<OperationalHealthKind, ReturnType<typeof emptyCounts>> {
  return Object.fromEntries(operationalHealthKinds.map((kind) => [kind, emptyCounts()])) as Record<
    OperationalHealthKind,
    ReturnType<typeof emptyCounts>
  >;
}

/** Parses one redacted health event before any provider or store is called. */
export function parseOperationalHealthEvent(value: unknown): OperationalHealthEvent {
  return parseEvent(value);
}

/** Builds an organization-scoped report from immutable operational events. */
export function summarizeOperationalHealth(
  events: readonly unknown[],
  asOfInput: string | Date,
  organizationIdInput: string,
): OperationalHealthReport {
  const asOf = parseAsOf(asOfInput);
  const organizationId = parseOrganizationId(organizationIdInput);
  const asOfMs = Date.parse(asOf);
  const byKind = emptyKinds();
  const costs = new Map<string, number>();
  const seen = new Set<string>();
  let totalEvents = 0;

  for (const value of events) {
    const event = parseEvent(value);
    if (seen.has(event.eventId)) throw new Error(`Duplicate operational health event: ${event.eventId}`);
    seen.add(event.eventId);
    if (event.organizationId !== organizationId) {
      throw new Error(`Operational health event belongs to another organization: ${event.eventId}`);
    }
    if (Date.parse(event.occurredAt) > asOfMs) {
      throw new Error(`Operational health event is after report as-of timestamp: ${event.eventId}`);
    }

    totalEvents += 1;
    const counts = byKind[event.kind];
    counts.total += 1;
    counts[event.outcome] += 1;
    if (event.costMinorUnits !== null && event.currency !== null) {
      costs.set(event.currency, (costs.get(event.currency) ?? 0) + event.costMinorUnits);
    }
  }

  return {
    asOf,
    organizationId,
    totalEvents,
    byKind,
    costByCurrency: [...costs.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([currencyValue, totalMinorUnits]) => ({ currency: currencyValue, totalMinorUnits })),
  };
}

export { currency, identifier, minorUnits, timestamp };
