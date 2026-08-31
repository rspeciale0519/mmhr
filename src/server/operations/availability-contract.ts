import "server-only";

import { z } from "zod";

/** Availability observations contain service facts only, never request data. */
export const availabilityOutcomes = ["available", "unavailable"] as const;
export type AvailabilityOutcome = (typeof availabilityOutcomes)[number];

const uuid = z.uuid().transform((value) => value.toLowerCase());
const timestamp = z.iso.datetime({ offset: true });
const serviceId = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,119}$/, "Service identifier contains unsupported characters");

export const availabilityObservationSchema = z.strictObject({
  observationId: uuid,
  serviceId,
  observedAt: timestamp,
  durationSeconds: z.number().int().positive().max(86_400),
  outcome: z.enum(availabilityOutcomes),
  maintenance: z.boolean(),
  source: z.enum(["synthetic", "user"]),
});

export type AvailabilityObservation = z.output<typeof availabilityObservationSchema>;

export const availabilityTargetPercent = 99.9;

export type AvailabilityReport = Readonly<{
  serviceId: string;
  windowStart: string;
  windowEnd: string;
  observedSeconds: number;
  unavailableSeconds: number;
  availabilityPercent: number | null;
  meetsTarget: boolean;
}>;

function parseWindow(value: string | Date, field: string): string {
  const normalized = value instanceof Date ? value.toISOString() : value;
  if (!timestamp.safeParse(normalized).success) throw new Error(`Invalid availability ${field}`);
  return normalized;
}

function parseObservation(value: unknown): AvailabilityObservation {
  const parsed = availabilityObservationSchema.safeParse(value);
  if (!parsed.success) throw new Error("Invalid availability observation");
  return parsed.data;
}

/** Parses one redacted availability observation before persistence or alerting. */
export function parseAvailabilityObservation(value: unknown): AvailabilityObservation {
  return parseObservation(value);
}

/** Calculates a weighted availability percentage for one explicit reporting window. */
export function calculateAvailability(
  observations: readonly unknown[],
  serviceIdInput: string,
  windowStartInput: string | Date,
  windowEndInput: string | Date,
): AvailabilityReport {
  const service = serviceId.safeParse(serviceIdInput.trim());
  if (!service.success) throw new Error("Invalid availability service");
  const windowStart = parseWindow(windowStartInput, "window start");
  const windowEnd = parseWindow(windowEndInput, "window end");
  const startMs = Date.parse(windowStart);
  const endMs = Date.parse(windowEnd);
  if (endMs <= startMs) throw new Error("Availability window must end after it starts");

  const seen = new Set<string>();
  let observedSeconds = 0;
  let unavailableSeconds = 0;

  for (const value of observations) {
    const observation = parseObservation(value);
    if (seen.has(observation.observationId)) {
      throw new Error(`Duplicate availability observation: ${observation.observationId}`);
    }
    seen.add(observation.observationId);
    if (observation.serviceId !== service.data) {
      throw new Error(`Availability observation belongs to another service: ${observation.observationId}`);
    }
    const observedMs = Date.parse(observation.observedAt);
    if (observedMs < startMs || observedMs >= endMs) {
      throw new Error(`Availability observation is outside the reporting window: ${observation.observationId}`);
    }
    if (observation.maintenance) continue;
    observedSeconds += observation.durationSeconds;
    if (observation.outcome === "unavailable") unavailableSeconds += observation.durationSeconds;
  }

  const availabilityPercent =
    observedSeconds === 0 ? null : ((observedSeconds - unavailableSeconds) / observedSeconds) * 100;
  return {
    serviceId: service.data,
    windowStart,
    windowEnd,
    observedSeconds,
    unavailableSeconds,
    availabilityPercent,
    meetsTarget: availabilityPercent !== null && availabilityPercent >= availabilityTargetPercent,
  };
}

export { serviceId, timestamp, uuid };
