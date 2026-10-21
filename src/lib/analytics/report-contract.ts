import "server-only";

import { z } from "zod";

export const analyticsReportEventNames = [
  "page_view",
  "lead_form_started",
  "lead_form_submitted",
  "requirements_builder_completed",
  "partner_finder_completed",
  "consent_granted",
  "intake_started",
  "evaluation_started",
  "activation_completed",
  "workflow_action",
  "job_viewed",
] as const;
export type AnalyticsReportEventName = (typeof analyticsReportEventNames)[number];

const uuid = z.uuid().transform((value) => value.toLowerCase());
const timestamp = z.iso.datetime({ offset: true });
const propertyKey = z.string().regex(/^[a-z][a-z0-9_]{0,63}$/);
const propertyValue = z.union([z.string().max(200), z.number().finite(), z.boolean()]);
const safeProperties = z.record(propertyKey, propertyValue).superRefine((properties, context) => {
  if (Object.keys(properties).length > 20) context.addIssue({ code: "custom", message: "Analytics properties are too large" });
  if (Object.keys(properties).some((key) => /(?:email|phone|mobile|name|address|ip|cookie|token|user|person|contact|company|organization|org|message|note|comment|resume|salary|ssn|secret|id$)/i.test(key))) {
    context.addIssue({ code: "custom", message: "Sensitive analytics properties are not allowed" });
  }
});

export const analyticsReportEventSchema = z.strictObject({
  eventId: uuid,
  name: z.enum(analyticsReportEventNames),
  occurredAt: timestamp,
  consent: z.literal("granted"),
  properties: safeProperties,
});

export type AnalyticsReportEvent = z.output<typeof analyticsReportEventSchema>;

export type AnalyticsReport = Readonly<{
  asOf: string;
  totalEvents: number;
  byName: Readonly<Record<AnalyticsReportEventName, number>>;
  funnel: Readonly<{
    marketing: number;
    leads: number;
    intake: number;
    evaluation: number;
    activation: number;
  }>;
  workflowActions: number;
}>;

function parseAsOf(input: string | Date): string {
  const value = input instanceof Date ? input.toISOString() : input;
  if (!timestamp.safeParse(value).success) throw new Error("Invalid analytics report as-of timestamp");
  return value;
}

/** Builds deterministic funnel and product-use totals from consented source events. */
export function summarizeAnalyticsReport(eventsInput: readonly unknown[], asOfInput: string | Date): AnalyticsReport {
  const asOf = parseAsOf(asOfInput);
  const asOfMs = Date.parse(asOf);
  const byName = Object.fromEntries(analyticsReportEventNames.map((name) => [name, 0])) as Record<AnalyticsReportEventName, number>;
  const seen = new Set<string>();
  let totalEvents = 0;

  for (const value of eventsInput) {
    const parsed = analyticsReportEventSchema.safeParse(value);
    if (!parsed.success) throw new Error("Invalid analytics report event");
    const event = parsed.data;
    if (seen.has(event.eventId)) throw new Error(`Duplicate analytics event: ${event.eventId}`);
    seen.add(event.eventId);
    if (Date.parse(event.occurredAt) > asOfMs) throw new Error(`Analytics event is after report as-of timestamp: ${event.eventId}`);
    byName[event.name] += 1;
    totalEvents += 1;
  }

  return Object.freeze({
    asOf,
    totalEvents,
    byName: Object.freeze(byName),
    funnel: Object.freeze({
      marketing: byName.page_view,
      leads: byName.lead_form_submitted,
      intake: byName.intake_started,
      evaluation: byName.evaluation_started,
      activation: byName.activation_completed,
    }),
    workflowActions: byName.workflow_action,
  });
}

export { propertyKey, propertyValue, safeProperties, timestamp, uuid };
