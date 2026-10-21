"use client";

import { type FormEvent, useState } from "react";

type SubmissionState =
  | "idle"
  | "submitting"
  | "success"
  | "invalid"
  | "consentRequired"
  | "rejected"
  | "unavailable";

const statusMessages: Record<Exclude<SubmissionState, "idle" | "submitting">, string> = {
  success: "You are subscribed. Watch your inbox for The Weekly Signal.",
  invalid: "Check your email and consent, then try again.",
  consentRequired: "Please confirm your consent before subscribing.",
  rejected: "This request could not be accepted. Reload the page and try again.",
  unavailable: "We could not subscribe you. Please try again later.",
};

function newIdempotencyKey() {
  return globalThis.crypto.randomUUID();
}

export default function NewsletterForm() {
  const [state, setState] = useState<SubmissionState>("idle");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);

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
          email: String(values.get("email") ?? ""),
          consentAt: new Date().toISOString(),
          idempotencyKey: newIdempotencyKey(),
        }),
      });

      if (response.ok) {
        setState("success");
      } else if (response.status === 400) {
        setState("invalid");
      } else if (response.status === 403) {
        setState("rejected");
      } else {
        setState("unavailable");
      }
    } catch {
      setState("unavailable");
    }
  }

  const status = state === "idle" || state === "submitting" ? undefined : statusMessages[state];

  return (
    <form className="pu-form pu-news-form" aria-describedby="newsletter-form-status" onSubmit={submit}>
      <div className="pu-news-controls">
        <input
          className="pu-input"
          id="pu-news-email"
          name="email"
          type="email"
          maxLength={254}
          placeholder="Work email"
          aria-label="Work email"
          required
          autoComplete="email"
        />
        <button className="pu-btn pu-solid pu-lg" type="submit" disabled={state === "submitting"}>
          {state === "submitting" ? "Subscribing..." : "Subscribe"}
        </button>
      </div>
      <label className="pu-fine pu-news-consent" htmlFor="pu-news-consent">
        <input id="pu-news-consent" name="consent" type="checkbox" required /> I agree to receive The Weekly
        Signal by email. See our <a href="/privacy">privacy notice</a>.
      </label>
      <p className="pu-fine pu-news-status" id="newsletter-form-status" role="status" aria-live="polite">
        {status ?? "Monthly. Unsubscribe whenever."}
      </p>
    </form>
  );
}
