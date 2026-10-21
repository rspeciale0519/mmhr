import "server-only";

import { randomUUID } from "node:crypto";

import {
  NewsletterServiceError,
  type NewsletterRegistrationRequest,
  type NewsletterRegistrationResult,
  type NewsletterService,
} from "./newsletter-contract";

const publicationIdPattern = /^pub_[0-9a-f-]+$/i;
const apiBaseUrl = "https://api.beehiiv.com/v2";
const requestTimeoutMs = 5_000;

function configuredValue(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized && normalized.length <= 512 && !/[\u0000-\u001f\u007f]/.test(normalized)
    ? normalized
    : null;
}

function getConfiguration(): { apiKey: string; publicationId: string } | null {
  const apiKey = configuredValue(process.env.BEEHIIV_API_KEY);
  const publicationId = configuredValue(process.env.BEEHIIV_PUBLICATION_ID);
  if (!apiKey || !publicationId || !publicationIdPattern.test(publicationId)) return null;
  return { apiKey, publicationId };
}

/**
 * Sends a consented subscriber through the provider-neutral newsletter interface.
 * Configuration stays server-only, and provider failures remain generic.
 */
export const beehiivNewsletterService: NewsletterService = {
  async addOrUpdateSubscriber(
    request: NewsletterRegistrationRequest,
  ): Promise<NewsletterRegistrationResult> {
    const configuration = getConfiguration();
    if (!configuration) throw new NewsletterServiceError("UNAVAILABLE");

    let response: Response;
    try {
      response = await fetch(
        `${apiBaseUrl}/publications/${encodeURIComponent(configuration.publicationId)}/subscriptions`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${configuration.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: request.email,
            reactivate_existing: false,
            send_welcome_email: false,
            utm_source: "mmhr",
          }),
          signal: AbortSignal.timeout(requestTimeoutMs),
        },
      );
    } catch {
      throw new NewsletterServiceError("UNAVAILABLE");
    }

    if (response.status === 409) {
      return { outcome: "replayed", correlationId: randomUUID() };
    }
    if (!response.ok) throw new NewsletterServiceError("UNAVAILABLE");

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new NewsletterServiceError("INVALID_RESPONSE");
    }
    if (
      !payload || typeof payload !== "object" || !("data" in payload)
      || !payload.data || typeof payload.data !== "object" || !("id" in payload.data)
      || typeof payload.data.id !== "string" || !/^sub_[0-9a-f-]+$/i.test(payload.data.id)
    ) {
      throw new NewsletterServiceError("INVALID_RESPONSE");
    }
    return { outcome: "created", correlationId: randomUUID() };
  },
};

export function getConfiguredNewsletterService(): NewsletterService {
  return beehiivNewsletterService;
}
