import "server-only";

import { randomUUID } from "node:crypto";

import {
  NewsletterServiceError,
  type NewsletterRegistrationRequest,
  type NewsletterRegistrationResult,
  type NewsletterService,
} from "./newsletter-contract";

/**
 * Newsletter signups through Resend.
 *
 * Resend already delivers MMHR's transactional email
 * (src/server/integrations/email/resend-email.ts). For the newsletter it also
 * keeps the list: every subscriber is a Resend "contact", and the newsletter
 * list is one Resend "segment" (Resend renamed "audiences" to "segments" in
 * November 2025). The owner sends each newsletter issue from the Resend
 * dashboard as a "broadcast" to that segment. Resend adds the unsubscribe
 * link to broadcasts and keeps track of who unsubscribed.
 *
 * This file never sends an email. It only adds a contact to the segment.
 *
 * Settings (server-only environment variables, see .env.example):
 * - RESEND_API_KEY: the same secret key the transactional email uses;
 * - RESEND_NEWSLETTER_SEGMENT_ID: the id of the newsletter segment.
 *
 * Consent record: each contact gets two custom properties, `consent_at` (the
 * time the visitor ticked the consent box, as an ISO time) and
 * `consent_source` ("website footer"). Resend only stores a property whose key
 * already exists in the account and fails the whole call otherwise, so the
 * owner must create both properties (type "string") in the Resend dashboard.
 * Until then every signup fails closed and the visitor sees "try again later".
 *
 * Resend's API is called with the built-in `fetch`, in the same style as the
 * transactional email sender, so no extra package is needed.
 */

/** The address of Resend's API. It never changes. */
const apiBaseUrl = "https://api.resend.com";

/** Stop waiting for Resend after 5 seconds so the signup never hangs. */
const requestTimeoutMs = 5_000;

/** Where the consent was given. Stored on the contact as `consent_source`. */
export const newsletterConsentSource = "website footer";

/** Resend ids are UUIDs. Checking the shape keeps odd values out of the URL. */
const segmentIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Returns a trimmed setting, or null when it is missing or looks broken. */
function configuredValue(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized && normalized.length <= 512 && !/[\u0000-\u001f\u007f]/.test(normalized)
    ? normalized
    : null;
}

/** Reads both settings. Null means the newsletter cannot work yet. */
function getConfiguration(): { apiKey: string; segmentId: string } | null {
  const apiKey = configuredValue(process.env.RESEND_API_KEY);
  const segmentId = configuredValue(process.env.RESEND_NEWSLETTER_SEGMENT_ID);
  if (!apiKey || !segmentId || !segmentIdPattern.test(segmentId)) return null;
  return { apiKey, segmentId };
}

/**
 * True only when the Resend key and the newsletter segment id are both set.
 *
 * The site footer calls this to decide whether to show the signup form, so a
 * visitor is never offered a form that can only fail.
 *
 * Note on timing: the marketing pages are built as static pages, so the
 * footer reads this once, when the site is built (`next build`), not on every
 * visit. After setting or removing the variables, deploy again so the footer
 * changes. The `/api/newsletter` route reads the settings on every request.
 */
export function isNewsletterConfigured(): boolean {
  return getConfiguration() !== null;
}

/**
 * Calls one Resend endpoint and returns its HTTP status and JSON body.
 * A network error or timeout becomes a generic "unavailable" error, so no
 * provider detail ever reaches the visitor.
 */
async function callResend(
  apiKey: string,
  method: "POST" | "PATCH",
  path: string,
  body?: Record<string, unknown>,
): Promise<{ status: number; data: unknown }> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      // Never follow a redirect or reuse a cached answer.
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
  } catch {
    throw new NewsletterServiceError("UNAVAILABLE");
  }
  // The body is only read on success, and an unreadable body is treated as empty.
  const data: unknown = response.ok ? await response.json().catch(() => null) : null;
  return { status: response.status, data };
}

export const resendNewsletterService: NewsletterService = {
  async addOrUpdateSubscriber(
    request: NewsletterRegistrationRequest,
  ): Promise<NewsletterRegistrationResult> {
    // Without both settings, stop before any network call.
    const configuration = getConfiguration();
    if (!configuration) throw new NewsletterServiceError("UNAVAILABLE");
    const { apiKey, segmentId } = configuration;

    const properties = { consent_at: request.consentAt, consent_source: newsletterConsentSource };

    // Step 1: create the contact, already in the newsletter segment.
    // `unsubscribed` is left out on purpose: a new contact starts subscribed
    // (Resend's default), and someone who unsubscribed earlier is not
    // silently resubscribed.
    const created = await callResend(apiKey, "POST", "/contacts", {
      email: request.email,
      properties,
      segments: [{ id: segmentId }],
    });
    if (created.status >= 200 && created.status < 300) {
      const id = typeof created.data === "object" && created.data !== null
        ? (created.data as { id?: unknown }).id
        : undefined;
      if (typeof id !== "string" || id.length === 0) throw new NewsletterServiceError("INVALID_RESPONSE");
      return { outcome: "created", correlationId: randomUUID() };
    }

    // Step 2: Resend refuses a request it considers a conflict (409) or
    // invalid (422). The likely reason is that this email is already a
    // contact, for example after an earlier signup or a transactional email.
    // Treat the email as an existing contact: record the new consent on it,
    // then add it to the segment. If the email is not a contact after all, or
    // the request was invalid for another reason (such as a missing custom
    // property), these calls fail too and the signup fails closed.
    if (created.status !== 409 && created.status !== 422) throw new NewsletterServiceError("UNAVAILABLE");

    const contactPath = `/contacts/${encodeURIComponent(request.email)}`;
    const updated = await callResend(apiKey, "PATCH", contactPath, { properties });
    if (updated.status < 200 || updated.status >= 300) throw new NewsletterServiceError("UNAVAILABLE");

    // A second signup with the same email must be a success, not an error.
    // Resend's docs do not say what adding a contact that is already in the
    // segment returns, so a success or a 409 "conflict" both count as "in the
    // segment now".
    const added = await callResend(
      apiKey,
      "POST",
      `${contactPath}/segments/${encodeURIComponent(segmentId)}`,
    );
    const inSegment = (added.status >= 200 && added.status < 300) || added.status === 409;
    if (!inSegment) throw new NewsletterServiceError("UNAVAILABLE");

    return { outcome: "replayed", correlationId: randomUUID() };
  },
};

/** The newsletter service the public route uses. */
export function getConfiguredNewsletterService(): NewsletterService {
  return resendNewsletterService;
}
