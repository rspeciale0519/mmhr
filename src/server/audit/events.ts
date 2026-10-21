import "server-only";
import { z } from "zod";

import { securityTimestampSchema, securityUuidSchema } from "./security-values";

// This matches the existing fixed mmhr_get_audit_events response. No actor,
// reason, personal data, or change summary is part of this public DTO.
const eventMetadataSchema = z.object({
  id: securityUuidSchema,
  action: z.string().min(1).max(100),
  entity_type: z.string().min(1).max(100),
  entity_id: z.string().min(1).max(256),
  occurred_at: securityTimestampSchema,
});

export type AuditEventMetadata = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  occurredAt: string;
};

export function parseAuditEventMetadataRows(value: unknown): AuditEventMetadata[] | null {
  const result = z.array(eventMetadataSchema).max(100).safeParse(value);
  if (!result.success) return null;
  return result.data.map((event) => ({
    id: event.id,
    action: event.action,
    entityType: event.entity_type,
    entityId: event.entity_id,
    occurredAt: event.occurred_at,
  }));
}
