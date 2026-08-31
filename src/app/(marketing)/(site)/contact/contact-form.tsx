"use client";

import { type FormEvent, useState } from "react";

type SubmissionState = "idle" | "submitting" | "success" | "invalid" | "consentRequired" | "rejected" | "unavailable";

const statusMessages: Record<Exclude<SubmissionState, "idle" | "submitting">, string> = {
  success: "Thanks. Your request was received. We will contact you soon.",
  invalid: "Check the form and try again.",
  consentRequired: "Please confirm your consent before sending.",
  rejected: "This request could not be accepted. Reload the page and try again.",
  unavailable: "We could not send your request. Please try again later.",
};

function newIdempotencyKey() {
  return globalThis.crypto.randomUUID();
}

export default function ContactForm() {
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
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fullName: String(values.get("fullName") ?? ""),
          company: String(values.get("company") ?? ""),
          workEmail: String(values.get("workEmail") ?? ""),
          directCompanyPhone: String(values.get("directCompanyPhone") ?? ""),
          source: "contact",
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
    <form className="pu-fieldset" aria-describedby="contact-form-status" onSubmit={submit}>
      <div className="pu-field">
        <label htmlFor="c-name">Full name</label>
        <input className="pu-input" id="c-name" name="fullName" maxLength={200} required />
      </div>
      <div className="pu-field">
        <label htmlFor="c-company">Company</label>
        <input className="pu-input" id="c-company" name="company" maxLength={200} required />
      </div>
      <div className="pu-field">
        <label htmlFor="c-email">Work email</label>
        <input
          className="pu-input"
          id="c-email"
          name="workEmail"
          type="email"
          maxLength={320}
          required
        />
      </div>
      <div className="pu-field">
        <label htmlFor="c-phone">Direct company phone</label>
        <input
          className="pu-input"
          id="c-phone"
          name="directCompanyPhone"
          type="tel"
          inputMode="tel"
          maxLength={24}
          required
        />
      </div>
      <label className="pu-fine" htmlFor="c-consent">
        <input id="c-consent" name="consent" type="checkbox" required /> I agree that MatchMaker HR may
        use these details to reply to my request. See our <a href="/privacy">privacy notice</a>.
      </label>
      <button className="pu-btn pu-solid pu-lg" type="submit" disabled={state === "submitting"}>
        {state === "submitting" ? "Sending..." : "Send"}
      </button>
      <p className="pu-fine" id="contact-form-status" role="status" aria-live="polite">
        {status ?? "We use your details only to reply to your request."}
      </p>
    </form>
  );
}
