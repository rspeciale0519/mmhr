import "server-only";
import { z } from "zod";
import { outboundCommunicationSchema, type CommunicationDeliveryReceipt, type EmailService } from "@/server/workflows/communication-contract";
import { notificationClaimSchema } from "@/server/workflows/rfp-notification-contract";

const testInboxes = ["dev-0001@agentmail.to", "dev-0002@agentmail.to", "dev-0003@agentmail.to"] as const;
const configurationSchema = z.strictObject({
  enabled: z.literal(true), apiKey: z.string().regex(/^[\x21-\x7e]{1,4096}$/), sendingInbox: z.enum(testInboxes),
});
const providerResultSchema = z.object({
  message_id: z.string().min(1).max(255).regex(/^[^\s\x00-\x1f\x7f]+$/),
  thread_id: z.string().min(1).max(255).regex(/^[^\s\x00-\x1f\x7f]+$/),
});
type Configuration = { enabled: false } | z.input<typeof configurationSchema>;
type Dependencies = { fetchImplementation?: typeof fetch; now?: () => number };
const MAX_RESPONSE_BYTES = 16_384;
const REQUEST_TIMEOUT_MS = 5_000;
const CLEANUP_TIMEOUT_MS = 2_000;

/** Bounds the cancellation wait, not the provider's physical termination. */
async function cancelBounded(cancel: () => PromiseLike<unknown>): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.resolve().then(cancel),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("Email cleanup unavailable")), CLEANUP_TIMEOUT_MS);
      }),
    ]);
  } catch { throw new Error("Email cleanup unavailable"); }
  finally { if (timer !== undefined) clearTimeout(timer); }
}

async function boundedResult(response: Response): Promise<unknown> {
  if (!response.body) throw new Error("Email result unavailable");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const result = await reader.read();
      if (result.done) break;
      size += result.value.byteLength;
      if (size > MAX_RESPONSE_BYTES) throw new Error("Email result unavailable");
      chunks.push(result.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } finally {
    try { await cancelBounded(() => reader.cancel()); }
    finally { reader.releaseLock(); }
  }
}

/** Synthetic inbox transport only. No environment lookup or application activation. */
export function createAgentMailTestNotificationEmail(
  value: unknown, configuration: Configuration = { enabled: false }, dependencies: Dependencies = {},
): EmailService {
  const claim = notificationClaimSchema.safeParse(value);
  const config = configurationSchema.safeParse(configuration);
  const fetchImplementation = dependencies.fetchImplementation ?? globalThis.fetch.bind(globalThis);
  const now = dependencies.now ?? Date.now;
  // Copy validated primitives now; later caller mutations cannot change the send.
  const manifest = claim.success ? Object.freeze(claim.data) : null;
  let attempted = false;
  function failure(communicationId: string, failureCode: string): CommunicationDeliveryReceipt {
    return { communicationId, providerMessageId: null, state: "failed", failureCode, retryable: false };
  }
  return {
    async send(value) {
      const request = outboundCommunicationSchema.safeParse(value);
      const id = manifest?.notificationId ?? (request.success ? request.data.idempotencyKey : "00000000-0000-4000-8000-000000000000");
      if (!manifest || !request.success) return failure(id, "source_changed");
      if (attempted) return failure(id, "outcome_unknown");
      const input = request.data;
      const association = input.associations[0];
      if (input.idempotencyKey !== manifest.notificationId || input.correlationId !== manifest.correlationId
        || input.templateKey !== "rfp.portal_notification" || input.consent !== "transactional"
        || input.subject !== manifest.subject || input.body !== manifest.body
        || input.recipientIds.length !== 1 || input.recipientIds[0] !== manifest.recipientIdentityId
        || input.associations.length !== 1 || association.organizationId !== manifest.organizationId
        || association.recordType !== "rfp" || association.recordId !== manifest.rfpId
        || !testInboxes.some(address => address === manifest.recipientEmail)) return failure(id, "source_changed");
      if (!config.success || typeof fetchImplementation !== "function" || typeof now !== "function") {
        return failure(id, "provider_unavailable_pre_dispatch");
      }
      let remaining: number;
      try { remaining = Date.parse(manifest.expiresAt) - now(); }
      catch { return failure(id, "lease_expired"); }
      if (!Number.isFinite(remaining) || remaining <= 0) return failure(id, "lease_expired");
      // Never retry an ambiguous request. Provider keys expire after 24 hours;
      // durable attempt authority must remain the source of retry decisions.
      attempted = true;
      try {
        const response = await fetchImplementation(
          `https://api.agentmail.to/v0/inboxes/${encodeURIComponent(config.data.sendingInbox)}/messages/send`,
          { method: "POST", credentials: "omit", redirect: "error", cache: "no-store",
            signal: AbortSignal.timeout(Math.max(1, Math.min(REQUEST_TIMEOUT_MS, Math.floor(remaining)))),
            headers: { Authorization: `Bearer ${config.data.apiKey}`, "Content-Type": "application/json",
              "Idempotency-Key": manifest.notificationId },
            body: JSON.stringify({ to: [manifest.recipientEmail], subject: manifest.subject, text: manifest.body }),
          },
        );
        if (response.status !== 200) {
          if (response.body) await cancelBounded(() => response.body!.cancel());
          return failure(id, "outcome_unknown");
        }
        const result = providerResultSchema.safeParse(await boundedResult(response));
        if (!result.success) return failure(id, "outcome_unknown");
        return { communicationId: id, providerMessageId: result.data.message_id, state: "sent", failureCode: null, retryable: false };
      } catch {
        // Transport errors can follow a successful provider write. Do not expose
        // response content, credentials, or a misleading safe-retry result.
        return failure(id, "outcome_unknown");
      }
    },
  };
}
