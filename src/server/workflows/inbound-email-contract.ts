import "server-only";

import { z } from "zod";

const uuid = z.uuid().transform((value) => value.toLowerCase());
const timestamp = z.iso.datetime({ offset: true });
const emailAddress = z.email().transform((value) => value.trim().toLowerCase());
const reference = z.string().trim().min(1).max(500).regex(
  /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,499}$/,
);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/i).transform((value) => value.toLowerCase());

export const MAX_INBOUND_CLOCK_SKEW_SECONDS = 10 * 60;

const inboundEmailEventSchema = z.strictObject({
  eventId: uuid,
  providerEventId: z.string().trim().min(1).max(255),
  organizationId: uuid.nullable(),
  conversationToken: reference,
  senderAddress: emailAddress,
  recipientAddresses: z.array(emailAddress).min(1).max(100),
  subject: z.string().trim().max(998).nullable(),
  bodyReference: reference,
  attachmentReferences: z.array(reference).max(20),
  rawBodyHash: sha256,
  signedAt: timestamp,
  receivedAt: timestamp,
  signature: z.string().trim().min(16).max(512).regex(/^[A-Za-z0-9+/=_-]+$/),
});

type ParsedInboundEmailEvent = z.output<typeof inboundEmailEventSchema>;
export type InboundEmailEvent = Omit<ParsedInboundEmailEvent, "recipientAddresses" | "attachmentReferences"> & {
  readonly recipientAddresses: readonly string[];
  readonly attachmentReferences: readonly string[];
};
export type InboundEmailVerification = (event: InboundEmailEvent) => Promise<boolean> | boolean;

export class InboundEmailError extends Error {
  constructor(readonly code: "INVALID_INPUT" | "INVALID_SIGNATURE" | "STALE_EVENT" | "REPLAY") {
    super(code === "INVALID_INPUT"
      ? "Inbound email input is invalid"
      : code === "INVALID_SIGNATURE"
        ? "Inbound email signature is invalid"
        : code === "STALE_EVENT"
          ? "Inbound email event is outside the accepted time window"
          : "Inbound email event was already processed");
    this.name = "InboundEmailError";
  }
}

function parseEvent(value: unknown): ParsedInboundEmailEvent {
  const result = inboundEmailEventSchema.safeParse(value);
  if (!result.success) throw new InboundEmailError("INVALID_INPUT");
  return result.data;
}

/** Verifies an inbound event before it can enter a conversation or job queue. */
export async function verifyAndNormalizeInboundEmail(input: unknown, options: {
  verifySignature: InboundEmailVerification;
  seenProviderEventIds: ReadonlySet<string>;
  now: string | Date;
  maxClockSkewSeconds?: number;
}): Promise<InboundEmailEvent> {
  const event = parseEvent(input);
  const now = options.now instanceof Date ? options.now.toISOString() : options.now;
  if (!timestamp.safeParse(now).success) throw new InboundEmailError("INVALID_INPUT");
  if (options.seenProviderEventIds.has(event.providerEventId)) throw new InboundEmailError("REPLAY");
  const maxClockSkew = options.maxClockSkewSeconds ?? MAX_INBOUND_CLOCK_SKEW_SECONDS;
  if (!Number.isInteger(maxClockSkew) || maxClockSkew < 1 || maxClockSkew > 86_400) {
    throw new InboundEmailError("INVALID_INPUT");
  }
  if (Math.abs(Date.parse(now) - Date.parse(event.signedAt)) > maxClockSkew * 1_000) {
    throw new InboundEmailError("STALE_EVENT");
  }
  let verified = false;
  try {
    verified = await options.verifySignature(event);
  } catch {
    throw new InboundEmailError("INVALID_SIGNATURE");
  }
  if (!verified) throw new InboundEmailError("INVALID_SIGNATURE");
  return Object.freeze({
    ...event,
    recipientAddresses: Object.freeze([...event.recipientAddresses]),
    attachmentReferences: Object.freeze([...event.attachmentReferences]),
  });
}

export { inboundEmailEventSchema };
