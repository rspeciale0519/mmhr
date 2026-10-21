import "server-only";

import { z } from "zod";

export const collaborationRequestSchema = z.strictObject({
  organizationId: z.string().uuid(),
  dealId: z.string().uuid(),
  ownerIdentityId: z.string().uuid(),
  channel: z.enum(["secure_message", "meeting", "review_request"]),
  scheduledAt: z.iso.datetime({ offset: true }).nullable(),
  participantReferences: z.array(z.string().trim().min(1).max(200)).min(1).max(50),
  request: z.string().trim().min(1).max(2_000),
});

export type CollaborationRequest = z.infer<typeof collaborationRequestSchema>;

export function parseCollaborationRequest(value: unknown): CollaborationRequest {
  const parsed = collaborationRequestSchema.parse(value);
  if (parsed.channel === "meeting" && parsed.scheduledAt === null) throw new Error("Meeting coordination requires a time");
  return parsed;
}
