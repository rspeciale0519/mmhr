"use client";

import clsx from "clsx";
import { useEffect, useId, useRef, useState, type SubmitEvent } from "react";

import base from "./kit.module.css";

export type NeedsFormSlot =
  | "root" | "grid" | "field" | "wide" | "label" | "hint" | "input" | "select" | "checks" | "check" | "checkbox"
  | "error" | "summary" | "summaryTitle" | "summaryList" | "actions" | "primary" | "secondary" | "success" | "legend";

export type NeedsFormUi = Partial<Record<NeedsFormSlot, string>>;

type Errors = Partial<Record<"company" | "employees" | "email" | "features", string>>;
const features = ["Payroll", "Benefits", "Time tracking", "Hiring"] as const;

export function validateNeeds(data: FormData): Errors {
  const errors: Errors = {};
  const company = String(data.get("company") ?? "").trim();
  const employees = Number(data.get("employees"));
  const email = String(data.get("email") ?? "").trim();
  if (!company) errors.company = "Enter your company name.";
  if (!Number.isInteger(employees) || employees < 1 || employees > 100000) errors.employees = "Enter a whole number of employees from 1 to 100,000.";
  if (data.getAll("features").length === 0) errors.features = "Choose at least one must-have feature.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "Enter a work email address, like name@company.com.";
  return errors;
}

/** A short needs assessment that shows inline and summary validation. */
export function NeedsForm({ ui, submitLabel = "Save my needs" }: { ui: NeedsFormUi; submitLabel?: string }) {
  const id = useId();
  const summaryRef = useRef<HTMLDivElement>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [attempt, setAttempt] = useState(0);

  // Move focus to the summary after each failed attempt, once it has rendered.
  useEffect(() => {
    if (attempt > 0) summaryRef.current?.focus();
  }, [attempt]);

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state === "saving") return;
    const found = validateNeeds(new FormData(event.currentTarget));
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setState("idle");
      setAttempt((count) => count + 1);
      return;
    }
    setState("saving");
    window.setTimeout(() => setState("saved"), 900);
  }

  const describe = (key: keyof Errors, hint?: string) =>
    [hint ? `${id}-${key}-hint` : null, errors[key] ? `${id}-${key}-error` : null].filter(Boolean).join(" ") || undefined;
  const entries = Object.entries(errors) as [keyof Errors, string][];

  return (
    <form className={ui.root} onSubmit={submit} noValidate aria-describedby={entries.length ? `${id}-summary` : undefined}>
      {entries.length > 0 && (
        <div ref={summaryRef} id={`${id}-summary`} className={ui.summary} role="alert" tabIndex={-1}>
          <p className={ui.summaryTitle}>Fix {entries.length === 1 ? "one thing" : `${entries.length} things`} before saving</p>
          <ul className={ui.summaryList}>
            {entries.map(([key, message]) => (
              <li key={key}><a href={`#${id}-${key}`}>{message}</a></li>
            ))}
          </ul>
        </div>
      )}
      <div className={ui.grid}>
        <div className={clsx(base.field, ui.field)}>
          <label className={ui.label} htmlFor={`${id}-company`}>Company name</label>
          <input className={ui.input} id={`${id}-company`} name="company" autoComplete="organization" aria-invalid={Boolean(errors.company)} aria-describedby={describe("company")} />
          {errors.company && <p className={ui.error} id={`${id}-company-error`}>{errors.company}</p>}
        </div>
        <div className={clsx(base.field, ui.field)}>
          <label className={ui.label} htmlFor={`${id}-employees`}>Employees</label>
          <input className={ui.input} id={`${id}-employees`} name="employees" inputMode="numeric" aria-invalid={Boolean(errors.employees)} aria-describedby={describe("employees", "hint")} />
          <p className={ui.hint} id={`${id}-employees-hint`}>Count everyone you pay, including part-time staff.</p>
          {errors.employees && <p className={ui.error} id={`${id}-employees-error`}>{errors.employees}</p>}
        </div>
        <div className={clsx(base.field, ui.field, ui.wide)}>
          <label className={ui.label} htmlFor={`${id}-goal`}>Main goal</label>
          <select className={ui.select} id={`${id}-goal`} name="goal" defaultValue="replace">
            <option value="replace">Replace payroll and benefits</option>
            <option value="add">Add an HR platform for the first time</option>
            <option value="consolidate">Combine several systems into one</option>
          </select>
        </div>
        <fieldset className={clsx(base.field, ui.field, ui.wide)} aria-describedby={describe("features")} id={`${id}-features`}>
          <legend className={ui.legend}>Must-have features</legend>
          <div className={ui.checks}>
            {features.map((feature) => (
              <label key={feature} className={ui.check}>
                <input className={ui.checkbox} type="checkbox" name="features" value={feature} />
                {feature}
              </label>
            ))}
          </div>
          {errors.features && <p className={ui.error} id={`${id}-features-error`}>{errors.features}</p>}
        </fieldset>
        <div className={clsx(base.field, ui.field, ui.wide)}>
          <label className={ui.label} htmlFor={`${id}-email`}>Work email</label>
          <input className={ui.input} id={`${id}-email`} name="email" type="email" autoComplete="email" aria-invalid={Boolean(errors.email)} aria-describedby={describe("email")} />
          {errors.email && <p className={ui.error} id={`${id}-email-error`}>{errors.email}</p>}
        </div>
      </div>
      <div className={ui.actions}>
        <button className={ui.primary} type="submit" disabled={state === "saving"} aria-busy={state === "saving"}>
          {state === "saving" ? "Saving…" : submitLabel}
        </button>
        <button className={ui.secondary} type="reset" onClick={() => { setErrors({}); setState("idle"); }}>Clear</button>
      </div>
      <p className={ui.success} role="status" aria-live="polite">
        {state === "saved" ? "Saved. Your advisor sees your needs after you submit them." : ""}
      </p>
    </form>
  );
}
