import "server-only";

import { z } from "zod";

const uuid = z.uuid().transform((value) => value.toLowerCase());
const timestamp = z.iso.datetime({ offset: true });
const identifier = z.string().trim().min(1).max(160).regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/);

export const auditViewerEventSchema = z.strictObject({
  eventId: uuid,
  organizationId: uuid.nullable(),
  actorIdentityId: uuid,
  entityType: identifier,
  entityId: identifier,
  action: identifier,
  occurredAt: timestamp,
  correlationId: uuid,
});

export type AuditViewerEvent = z.output<typeof auditViewerEventSchema>;

export const auditViewerQuerySchema = z.strictObject({
  organizationId: uuid,
  actorIdentityId: uuid.optional(),
  entityType: identifier.optional(),
  entityId: identifier.optional(),
  action: identifier.optional(),
  occurredFrom: timestamp.optional(),
  occurredTo: timestamp.optional(),
  limit: z.number().int().positive().max(100).default(50),
  cursor: z.string().trim().min(1).max(200).optional(),
}).superRefine((query, context) => {
  if (query.occurredFrom && query.occurredTo && Date.parse(query.occurredFrom) > Date.parse(query.occurredTo)) {
    context.addIssue({ code: "custom", path: ["occurredFrom"], message: "Audit date range is reversed" });
  }
});

export type AuditViewerQuery = z.output<typeof auditViewerQuerySchema>;

export type AuditViewerPage = Readonly<{
  rows: readonly AuditViewerEvent[];
  nextCursor: string | null;
}>;

function parseCursor(value: string | undefined): number {
  if (!value) return 0;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error("Invalid audit viewer cursor");
  return parsed;
}

/** Returns only authorized, organization-scoped audit metadata in stable order. */
export function searchAuditEvents(eventsInput: readonly unknown[], queryInput: unknown): AuditViewerPage {
  const query = auditViewerQuerySchema.safeParse(queryInput);
  if (!query.success) throw new Error("Invalid audit viewer query");

  const events = eventsInput.map((value) => {
    const parsed = auditViewerEventSchema.safeParse(value);
    if (!parsed.success) throw new Error("Invalid audit viewer event");
    return parsed.data;
  });
  const seen = new Set<string>();
  for (const event of events) {
    if (seen.has(event.eventId)) throw new Error(`Duplicate audit event: ${event.eventId}`);
    seen.add(event.eventId);
    if (event.organizationId !== null && event.organizationId !== query.data.organizationId) {
      throw new Error(`Audit event belongs to another organization: ${event.eventId}`);
    }
  }

  const fromMs = query.data.occurredFrom ? Date.parse(query.data.occurredFrom) : Number.NEGATIVE_INFINITY;
  const toMs = query.data.occurredTo ? Date.parse(query.data.occurredTo) : Number.POSITIVE_INFINITY;
  const matching = events
    .filter((event) => (query.data.actorIdentityId === undefined || event.actorIdentityId === query.data.actorIdentityId))
    .filter((event) => (query.data.entityType === undefined || event.entityType === query.data.entityType))
    .filter((event) => (query.data.entityId === undefined || event.entityId === query.data.entityId))
    .filter((event) => (query.data.action === undefined || event.action === query.data.action))
    .filter((event) => Date.parse(event.occurredAt) >= fromMs && Date.parse(event.occurredAt) <= toMs)
    .sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt) || right.eventId.localeCompare(left.eventId));

  const offset = parseCursor(query.data.cursor);
  if (offset > matching.length) throw new Error("Audit viewer cursor is out of range");
  const rows = matching.slice(offset, offset + query.data.limit).map((event) => Object.freeze({ ...event }));
  const nextOffset = offset + rows.length;
  return Object.freeze({
    rows: Object.freeze(rows),
    nextCursor: nextOffset < matching.length ? String(nextOffset) : null,
  });
}

export { identifier, timestamp, uuid };
