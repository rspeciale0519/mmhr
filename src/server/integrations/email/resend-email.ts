import "server-only";

/**
 * Small Resend email sender.
 *
 * Resend is the company that delivers our email. This file is the only place
 * that talks to it. Everything else in the app calls `sendResendEmail` and
 * reads the simple result, so no other code needs to know how Resend works.
 */

/** The address of Resend's "send an email" service. It never changes. */
const RESEND_ENDPOINT = "https://api.resend.com/emails";

/** Stop waiting for Resend after 10 seconds so a page can never hang. */
const TIMEOUT_MS = 10_000;

/** One email to send. */
export type ResendEmail = {
  /** Who receives the email. */
  to: string;
  /** The subject line. */
  subject: string;
  /** The formatted (HTML) version of the message. */
  html: string;
  /** A plain-text copy for mail apps that do not show HTML. */
  text: string;
  /**
   * A unique id for this send. If the same id is sent twice (for example
   * after a double click or a retry), Resend delivers the email only once.
   */
  idempotencyKey: string;
};

/** What the caller gets back: success with Resend's message id, or a reason. */
export type ResendResult =
  | { ok: true; providerMessageId: string }
  | { ok: false; reason: "not_configured" | "rejected" | "unavailable" };

/** Settings read from environment variables. Tests pass their own. */
export type ResendConfig = {
  /** Secret key for our Resend account (RESEND_API_KEY). */
  apiKey: string | undefined;
  /** The "From" line, e.g. "MatchMaker HR <rfp@example.com>" (EMAIL_FROM). */
  from: string | undefined;
  /** Where vendor replies go (EMAIL_REPLY_TO). Optional. */
  replyTo: string | undefined;
};

/** Reads the email settings from the server's environment variables. */
export function resendConfigFromEnv(): ResendConfig {
  return {
    apiKey: process.env.RESEND_API_KEY,
    from: process.env.EMAIL_FROM,
    replyTo: process.env.EMAIL_REPLY_TO,
  };
}

/**
 * Sends one email through Resend.
 *
 * It never throws. A caller always gets a result object, so a failed email
 * can be shown to staff as "not sent" and tried again.
 */
export async function sendResendEmail(
  email: ResendEmail,
  config: ResendConfig = resendConfigFromEnv(),
  // `fetch` is the built-in function that makes web requests. Tests replace
  // it with a fake so that no real email is ever sent during a test.
  fetchImplementation: typeof fetch = fetch,
): Promise<ResendResult> {
  // Without a key and a sender we cannot send. Say so instead of guessing.
  if (!config.apiKey || !config.from) return { ok: false, reason: "not_configured" };

  try {
    const response = await fetchImplementation(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": email.idempotencyKey,
      },
      body: JSON.stringify({
        from: config.from,
        to: [email.to],
        subject: email.subject,
        html: email.html,
        text: email.text,
        // Only include a reply address when one is configured.
        ...(config.replyTo ? { reply_to: config.replyTo } : {}),
      }),
      // Never follow a redirect or reuse a cached answer for a send.
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    // 4xx means Resend refused the email (bad address, unverified sender).
    // Trying again will not help, so report it as "rejected".
    if (response.status >= 400 && response.status < 500) return { ok: false, reason: "rejected" };
    // Anything else that is not a success is a temporary problem.
    if (!response.ok) return { ok: false, reason: "unavailable" };

    // On success Resend answers with `{ "id": "..." }`.
    const data: unknown = await response.json();
    const id = typeof data === "object" && data !== null ? (data as { id?: unknown }).id : undefined;
    if (typeof id !== "string" || id.length === 0) return { ok: false, reason: "unavailable" };
    return { ok: true, providerMessageId: id };
  } catch {
    // Network error or timeout. We do not know if it was sent; the
    // idempotency key makes a retry safe.
    return { ok: false, reason: "unavailable" };
  }
}
