import "server-only";

export const emailConfirmationPath = "/auth/confirm";

/** Notices that `/sign-in` shows after an email confirmation link. */
export const emailConfirmationNotices = {
  "email-confirmed": "Email confirmed. Sign in to continue.",
  "confirmation-incomplete": "We could not sign you in from this link. If you confirmed your email, sign in to continue.",
  "confirmation-link-invalid":
    "This confirmation link has expired or was already used. Sign in if your email is confirmed. If not, sign up again to get a new link.",
} as const;

export type EmailConfirmationNotice = keyof typeof emailConfirmationNotices;

export function isEmailConfirmationNotice(value: unknown): value is EmailConfirmationNotice {
  return typeof value === "string" && Object.hasOwn(emailConfirmationNotices, value);
}

/**
 * Uses the configured application origin, never a request host. Sign-up runs
 * only after the exact-origin check, so a missing origin is a configuration error.
 */
export function emailConfirmationUrl(appUrl = process.env.NEXT_PUBLIC_APP_URL): string {
  return new URL(emailConfirmationPath, new URL(appUrl ?? "").origin).href;
}
