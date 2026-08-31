import { z } from "zod";

export const communicationChannels = ["email"] as const;
export const communicationDirections = ["outbound", "inbound"] as const;
export const communicationDeliveryStates = [
  "queued",
  "sent",
  "delivered",
  "failed",
  "bounced",
  "complained",
  "opted_out",
] as const;

export type CommunicationDeliveryState = (typeof communicationDeliveryStates)[number];

const recordTypes = [
  "customer",
  "vendor",
  "contact",
  "deal",
  "rfp",
  "demo",
  "proposal",
  "contract",
  "commission",
  "onboarding",
] as const;

const associationSchema = z.strictObject({
  organizationId: z.uuid(),
  recordType: z.enum(recordTypes),
  recordId: z.uuid(),
});

export const outboundCommunicationSchema = z.strictObject({
  channel: z.literal("email"),
  idempotencyKey: z.uuid().transform((value) => value.toLowerCase()),
  correlationId: z.uuid().transform((value) => value.toLowerCase()),
  templateKey: z.string().trim().toLowerCase().regex(/^[a-z][a-z0-9_.-]{0,127}$/),
  subject: z.string().trim().min(1).max(998),
  body: z.string().min(1).max(100_000),
  recipientIds: z.array(z.uuid()).min(1).max(100),
  associations: z.array(associationSchema).min(1).max(10),
  consent: z.enum(["transactional", "opted_in", "opted_out", "unknown"]),
});

export type OutboundCommunicationRequest = z.infer<typeof outboundCommunicationSchema>;

export type CommunicationPreparationResult =
  | { ok: false; code: "invalid_input" | "consent_required" }
  | { ok: true; request: OutboundCommunicationRequest };

/**
 * Normalizes an outgoing request without selecting a provider or sending data.
 * Consent and organization associations remain explicit for the eventual adapter.
 */
export function prepareOutboundCommunication(input: unknown): CommunicationPreparationResult {
  const parsed = outboundCommunicationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" };
  if (parsed.data.consent === "opted_out" || parsed.data.consent === "unknown") {
    return { ok: false, code: "consent_required" };
  }
  return { ok: true, request: parsed.data };
}

export const communicationDeliveryReceiptSchema = z.strictObject({
  communicationId: z.uuid(),
  providerMessageId: z.string().trim().min(1).max(255).nullable(),
  state: z.enum(communicationDeliveryStates),
  failureCode: z.string().trim().regex(/^[a-z][a-z0-9_.-]{0,63}$/).nullable(),
  retryable: z.boolean(),
});

export type CommunicationDeliveryReceipt = z.infer<typeof communicationDeliveryReceiptSchema>;

export interface EmailService {
  send(request: OutboundCommunicationRequest): Promise<CommunicationDeliveryReceipt>;
}

export interface InboundEmailService {
  verifyAndNormalize(input: unknown): Promise<{
    eventId: string;
    receivedAt: string;
    conversationToken: string;
    senderAddress: string;
    recipientAddresses: readonly string[];
    subject: string | null;
    attachmentCount: number;
  }>;
}
