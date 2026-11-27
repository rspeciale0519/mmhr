"use client";

import { type FormEvent, useId, useState } from "react";

/**
 * Email signup for HR software news and buyer guides.
 *
 * It posts to the existing public route `/api/newsletter`
 * (src/app/api/newsletter/route.ts). That route accepts exactly three fields
 * (src/server/workflows/newsletter-contract.ts) and rejects anything else:
 * - `email`: the address, at most 254 characters;
 * - `consentAt`: when the visitor ticked the consent box, as an ISO time
 *   (it must not be in the future), so consent is explicit and dated;
 * - `idempotencyKey`: a fresh random UUID for each attempt. (The provider,
 *   Resend, keys subscribers by email, so a repeat signup is harmless.)
 * Because the route rejects unknown fields, this form sends no honeypot
 * field; the route's exact-origin check is its abuse guard.
 *
 * Route answers and what the visitor sees:
 * - 200: subscribed (or already subscribed) -> success message;
 * - 400: the route did not accept the email -> "check the email address";
 * - 403: the request came from another origin -> "reload and try again";
 * - 409: the same key was reused with different data -> "try again";
 * - 503 or a network error: the provider is unavailable or not configured
 *   -> "could not subscribe you right now".
 *
 * Copy rule: promise only what exists, which is HR software news and buyer
 * guides by email, and that the reader can unsubscribe at any time (every
 * newsletter sent from Resend carries an unsubscribe link). Do not mention
 * downloads or reports here.
 *
 * The site footer shows this form only when the newsletter is configured
 * (see ./SiteChrome).
 *
 * Styles: `.co-news` in src/designs/cobalt/pages.css.
 */
type SignupState =
  | "idle"
  | "submitting"
  | "success"
  | "invalidEmail"
  | "consentRequired"
  | "rejected"
  | "conflict"
  | "unavailable";

const messages: Record<Exclude<SignupState, "idle" | "submitting">, string> = {
  success: "Thanks. You are on the list for HR software news and buyer guides.",
  invalidEmail: "Check the email address and try again.",
  consentRequired: "Tick the box to agree to receive these emails.",
  rejected: "This request could not be accepted. Reload the page and try again.",
  conflict: "That did not go through. Please try again.",
  unavailable: "We could not subscribe you right now. Please try again later.",
};

/** A simple shape check; the route does the real validation. */
const emailShape = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function NewsletterSignup() {
  const [state, setState] = useState<SignupState>("idle");
  // useId keeps the label/input pairs unique if the form appears twice on a page.
  const id = useId();
  const emailId = `${id}-email`;
  const consentId = `${id}-consent`;
  const statusId = `${id}-status`;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const email = String(values.get("email") ?? "").trim();

    if (!emailShape.test(email) || email.length > 254) {
      setState("invalidEmail");
      return;
    }
    if (values.get("consent") !== "on") {
      setState("consentRequired");
      return;
    }

    setState("submitting");
    try {
      const response = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          consentAt: new Date().toISOString(),
          idempotencyKey: globalThis.crypto.randomUUID(),
        }),
      });
      if (response.ok) {
        form.reset();
        setState("success");
      } else if (response.status === 400) {
        setState("invalidEmail");
      } else if (response.status === 403) {
        setState("rejected");
      } else if (response.status === 409) {
        setState("conflict");
      } else {
        setState("unavailable");
      }
    } catch {
      setState("unavailable");
    }
  }

  const message = state === "idle" || state === "submitting" ? null : messages[state];
  const isError = message !== null && state !== "success";

  return (
    <form className="co-news" noValidate onSubmit={submit}>
      <p className="co-news-title">HR software news and buyer guides, by email.</p>
      <div className="co-news-row">
        <div className="co-field">
          <label htmlFor={emailId}>Email address</label>
          <input
            id={emailId}
            name="email"
            type="email"
            autoComplete="email"
            maxLength={254}
            required
            aria-invalid={state === "invalidEmail" ? true : undefined}
            aria-describedby={statusId}
          />
        </div>
        <button className="co-btn co-btn-p" type="submit" disabled={state === "submitting"}>
          {state === "submitting" ? "Subscribing…" : "Subscribe"}
        </button>
      </div>
      <div className="co-news-consent">
        <input
          id={consentId}
          name="consent"
          type="checkbox"
          aria-invalid={state === "consentRequired" ? true : undefined}
          aria-describedby={statusId}
        />
        <label htmlFor={consentId}>
          I agree to receive HR software news and buyer guides from MatchMaker HR by email.
          I can unsubscribe at any time. See the <a href="/privacy">privacy policy</a>.
        </label>
      </div>
      {/* One live region for every outcome, present from the start so screen
          readers announce changes to it. */}
      <p
        id={statusId}
        className={isError ? "co-news-status co-news-error" : "co-news-status"}
        role="status"
        aria-live="polite"
      >
        {/* A new span per outcome, so each message plays its short rise-in
            (pages.css). The live region itself never changes. */}
        {message ? <span key={state}>{message}</span> : null}
      </p>
    </form>
  );
}
