import "server-only";

import { z } from "zod";

/**
 * Stable stages for internal pipeline reporting.
 *
 * This contract carries only opaque IDs and allowlisted dimensions. It does
 * not carry names, contact details, free text, commercial values, or source
 * documents.
 */
export const pipelineStages = [
  "new",
  "qualified",
  "evaluation",
  "demo",
  "proposal",
  "selected",
  "contracted",
  "closed_lost",
] as const;

export type PipelineStage = (typeof pipelineStages)[number];

const pipelineStageOrder: Readonly<Record<PipelineStage, number>> = {
  new: 0,
  qualified: 1,
  evaluation: 2,
  demo: 3,
  proposal: 4,
  selected: 5,
  contracted: 6,
  closed_lost: 7,
};

export const pipelineEventTypes = ["deal.created", "deal.stage_changed"] as const;

export type PipelineEventType = (typeof pipelineEventTypes)[number];

const pipelineStageSchema = z.enum(pipelineStages);

const pipelineDimensionsSchema = z
  .object({
    customerSegment: z.enum(["small", "mid_market", "enterprise"]).optional(),
    vendorCategory: z.literal("hr_software").optional(),
    leadSource: z.enum(["contact", "registration", "referral", "outbound", "other"]).optional(),
    ownerRole: z.enum(["super_admin", "admin", "advisor", "sales"]).optional(),
  })
  .strict();

const pipelineEventSchema = z
  .object({
    eventId: z.string().uuid(),
    dealId: z.string().uuid(),
    occurredAt: z.string().datetime({ offset: true }),
    eventType: z.enum(pipelineEventTypes),
    fromStage: pipelineStageSchema.optional(),
    toStage: pipelineStageSchema,
    dimensions: pipelineDimensionsSchema,
  })
  .strict()
  .superRefine((event, context) => {
    if (event.eventType === "deal.created") {
      if (event.toStage !== "new") {
        context.addIssue({
          code: "custom",
          path: ["toStage"],
          message: "deal.created must enter the new stage",
        });
      }
      if (event.fromStage !== undefined) {
        context.addIssue({
          code: "custom",
          path: ["fromStage"],
          message: "deal.created cannot have a previous stage",
        });
      }
    }

    if (event.eventType === "deal.stage_changed" && event.fromStage === undefined) {
      context.addIssue({
        code: "custom",
        path: ["fromStage"],
        message: "deal.stage_changed requires a previous stage",
      });
    }

    if (event.eventType === "deal.stage_changed" && event.fromStage === event.toStage) {
      context.addIssue({
        code: "custom",
        path: ["toStage"],
        message: "stage change must change the stage",
      });
    }

    if (
      event.eventType === "deal.stage_changed"
      && event.fromStage !== undefined
      && event.toStage !== "closed_lost"
      && pipelineStageOrder[event.toStage] <= pipelineStageOrder[event.fromStage]
    ) {
      context.addIssue({
        code: "custom",
        path: ["toStage"],
        message: "deal stages cannot move backwards",
      });
    }

    if (
      event.eventType === "deal.stage_changed"
      && event.fromStage === "closed_lost"
    ) {
      context.addIssue({
        code: "custom",
        path: ["fromStage"],
        message: "closed_lost is terminal",
      });
    }

    if (
      event.eventType === "deal.stage_changed"
      && event.fromStage === "contracted"
    ) {
      context.addIssue({
        code: "custom",
        path: ["fromStage"],
        message: "contracted is terminal",
      });
    }
  });

export type PipelineDimensions = z.infer<typeof pipelineDimensionsSchema>;
export type PipelineEvent = z.infer<typeof pipelineEventSchema>;

export type PipelineDealSnapshot = Readonly<{
  dealId: string;
  currentStage: PipelineStage;
  stageEnteredAt: string;
  eventCount: number;
}>;

export type PipelineReport = Readonly<{
  asOf: string;
  totalDeals: number;
  byStage: Readonly<Record<PipelineStage, number>>;
  currentStageAgeHours: readonly Readonly<{
    dealId: string;
    stage: PipelineStage;
    hours: number;
  }>[];
}>;

function parseEvent(value: unknown): PipelineEvent {
  const result = pipelineEventSchema.safeParse(value);
  if (!result.success) {
    throw new Error("Invalid pipeline event");
  }
  return result.data;
}

function parseAsOf(value: string | Date): string {
  const asOf = value instanceof Date ? value.toISOString() : value;
  if (!z.string().datetime({ offset: true }).safeParse(asOf).success) {
    throw new Error("Invalid report as-of timestamp");
  }
  return asOf;
}

/** Parses the allowlisted event contract and rejects all extra payload fields. */
export function parsePipelineEvent(value: unknown): PipelineEvent {
  return parseEvent(value);
}

/**
 * Rebuilds current pipeline state from immutable source events.
 *
 * Events sort by timestamp and ID. A stale writer, duplicate event, missing
 * creation event, or incorrect previous stage fails instead of hiding drift.
 */
export function projectPipeline(events: readonly unknown[]): readonly PipelineDealSnapshot[] {
  const parsed = events.map(parseEvent).sort(
    (left, right) =>
      Date.parse(left.occurredAt) - Date.parse(right.occurredAt) ||
      (left.eventType === "deal.created" ? 0 : 1) -
        (right.eventType === "deal.created" ? 0 : 1) ||
      left.eventId.localeCompare(right.eventId),
  );
  const seenEvents = new Set<string>();
  const snapshots = new Map<string, PipelineDealSnapshot>();

  for (const event of parsed) {
    if (seenEvents.has(event.eventId)) {
      throw new Error(`Duplicate pipeline event: ${event.eventId}`);
    }
    seenEvents.add(event.eventId);

    const current = snapshots.get(event.dealId);
    if (event.eventType === "deal.created") {
      if (current) throw new Error(`Duplicate deal creation: ${event.dealId}`);
      snapshots.set(event.dealId, {
        dealId: event.dealId,
        currentStage: event.toStage,
        stageEnteredAt: event.occurredAt,
        eventCount: 1,
      });
      continue;
    }

    if (!current) throw new Error(`Pipeline stage change has no deal: ${event.dealId}`);
    if (current.currentStage !== event.fromStage) {
      throw new Error(`Pipeline stage history is out of order: ${event.dealId}`);
    }
    snapshots.set(event.dealId, {
      dealId: current.dealId,
      currentStage: event.toStage,
      stageEnteredAt: event.occurredAt,
      eventCount: current.eventCount + 1,
    });
  }

  return [...snapshots.values()].sort((left, right) => left.dealId.localeCompare(right.dealId));
}

/** Builds a deterministic current-stage report from source events. */
export function summarizePipeline(
  events: readonly unknown[],
  asOfInput: string | Date,
): PipelineReport {
  const asOf = parseAsOf(asOfInput);
  const snapshots = projectPipeline(events);
  const byStage = Object.fromEntries(
    pipelineStages.map((stage) => [stage, 0]),
  ) as Record<PipelineStage, number>;

  const currentStageAgeHours = snapshots.map((snapshot) => {
    if (Date.parse(snapshot.stageEnteredAt) > Date.parse(asOf)) {
      throw new Error(`Pipeline event is after report as-of timestamp: ${snapshot.dealId}`);
    }
    const hours = Math.max(
      0,
      Math.floor((Date.parse(asOf) - Date.parse(snapshot.stageEnteredAt)) / (60 * 60 * 1000)),
    );
    byStage[snapshot.currentStage] += 1;
    return { dealId: snapshot.dealId, stage: snapshot.currentStage, hours };
  });

  return { asOf, totalDeals: snapshots.length, byStage, currentStageAgeHours };
}

export { pipelineDimensionsSchema, pipelineEventSchema };
