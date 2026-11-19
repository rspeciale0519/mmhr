import "server-only";
import { createHash, createHmac } from "node:crypto";

/**
 * Private links for the RFP web form.
 *
 * A vendor opens the form with a link like `/rfp/<token>`. The token is the
 * only key to the form, so it must be impossible to guess.
 *
 * How the token is made: we take the id of the vendor's RFP recipient row
 * and "sign" it with a secret only the server knows (an HMAC). The result is
 * 256 unpredictable bits. Because it is calculated, not random, the server
 * can make the same link again later (for a follow-up email) without ever
 * storing the token. The database stores only a SHA-256 hash of the token,
 * so even someone who read the database could not rebuild a link.
 */

/** Reads the signing secret. It must be long enough to be safe. */
function linkSecret(secret = process.env.RFP_FORM_LINK_SECRET): string | null {
  return secret && secret.length >= 32 ? secret : null;
}

/** True when the server has what it needs to make links. */
export function rfpFormLinksConfigured(secret?: string): boolean {
  return linkSecret(secret) !== null;
}

/** Makes the token for one recipient. Returns null if no secret is set. */
export function rfpFormToken(recipientId: string, secret?: string): string | null {
  const key = linkSecret(secret);
  if (!key) return null;
  // "base64url" is a web-safe spelling of the bytes: letters, digits, - and _.
  return createHmac("sha256", key).update(`rfp-form:${recipientId.toLowerCase()}`).digest("base64url");
}

/** A token is always 43 web-safe characters. Anything else is not a token. */
export function isRfpFormToken(value: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(value);
}

/** The hash the database stores and looks forms up by. */
export function rfpFormTokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** The full link placed in the email, e.g. https://example.com/rfp/<token>. */
export function rfpFormUrl(token: string, baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? ""): string {
  return `${baseUrl.replace(/\/+$/, "")}/rfp/${token}`;
}
