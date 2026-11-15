"use client";

import { useMutation } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTRPC } from "@/lib/trpc/client";
import type { getIntakeRequirementsPage } from "@/server/commands/requirement-read";
import { ResponseValue } from "./requirement-views";
import { emptyPayrollAnswer, PayrollAnswerFields, payrollAnswerForSave, payrollAnswerSchema, type PayrollAnswer } from "./payroll-answer";

type Requirement = Awaited<ReturnType<typeof getIntakeRequirementsPage>>["requirements"][number];
type JsonValue = null | string | number | boolean | JsonValue[] | { [key: string]: JsonValue };
type AnswerMode = "text" | "existing";
type SaveInput = {
  requirementId: string;
  organizationId: string;
  intakeId: string;
  expectedRevision: number;
  stableKey: string;
  label: string;
  importance: "must" | "nice" | "not_applicable";
  weight: number;
  response: JsonValue;
  requirementType: "structured" | "custom";
  correlationId: string;
  idempotencyKey: string;
};

const selectClass = "min-h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
const textareaClass = "min-h-32 w-full resize-y rounded-lg border border-input bg-transparent px-3 py-2 text-base leading-6 text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm";
const formButtonClass = "transition-colors";
const labelClass = "block text-sm font-medium";
const hintClass = "text-xs leading-5 text-muted-foreground";

function requestId(): string | null {
  return typeof globalThis.crypto?.randomUUID === "function" ? globalThis.crypto.randomUUID() : null;
}

/** Only text and empty answers open in the details box. Any other saved answer is kept until replaced. */
function modeForResponse(value: unknown): AnswerMode {
  return value === null || typeof value === "string" ? "text" : "existing";
}

function isBoundedJson(value: unknown, depth = 0): value is JsonValue {
  if (depth > 5) return false;
  if (value === null || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string") return value.length <= 2_000;
  if (Array.isArray(value)) return value.length <= 50 && Array.from(value).every((item) => isBoundedJson(item, depth + 1));
  if (typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) return false;
  const entries = Object.entries(value);
  return entries.length <= 50 && entries.every(([key, item]) => key.length >= 1 && key.length <= 100 && isBoundedJson(item, depth + 1));
}

function responseValidationError(value: JsonValue): string | null {
  if (!isBoundedJson(value)) return "This saved answer is too complex to save again. Choose Replace answer to enter a new answer.";
  const serialized = JSON.stringify(value);
  if (serialized === undefined || new TextEncoder().encode(serialized).length > 8_000) {
    return "This saved answer is too large to save again. Choose Replace answer to enter a new answer.";
  }
  return null;
}

function valueForResponse(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function safeReturnHref(value: string): string {
  if (value === "/customer") return value;
  const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
  const match = new RegExp(`^/customer\\?intake=(${uuid})(?:&requirementsAfter=(${uuid}))?$`, "i").exec(value);
  if (!match) return "/customer";
  return `/customer?intake=${encodeURIComponent(match[1])}${match[2] ? `&requirementsAfter=${encodeURIComponent(match[2])}` : ""}`;
}

function buildResponse(value: string, saved: unknown): { response?: JsonValue; error?: string } {
  if (typeof saved === "string" && value === saved) return { response: saved };
  if (value.length > 2_000) return { error: "Details must be 2,000 characters or less." };
  return { response: value.trim() === "" ? null : value };
}

type SaveRejection = "correction" | "access" | null;
function classifySaveRejection(error: unknown): SaveRejection {
  if (!(error instanceof TRPCClientError)) return null;
  const code = error.data?.code;
  if (code === "BAD_REQUEST") return "correction";
  if (code === "NOT_FOUND" || code === "FORBIDDEN" || code === "UNAUTHORIZED") return "access";
  return null;
}

export function CustomerRequirementForm({
  organizationId,
  intakeId,
  requirement,
  returnHref,
}: {
  organizationId: string;
  intakeId: string;
  requirement?: Requirement;
  returnHref: string;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const save = useMutation(trpc.intakes.saveRequirement.mutationOptions({ retry: false }));
  const existingResponse = requirement?.response ?? null;
  const savedPayroll = requirement?.stableKey === "input_payroll" ? payrollAnswerSchema.safeParse(existingResponse) : null;
  const [payrollTemplate, setPayrollTemplate] = useState(Boolean(savedPayroll?.success));
  const [payrollAnswer, setPayrollAnswer] = useState<PayrollAnswer>(savedPayroll?.success ? savedPayroll.data : emptyPayrollAnswer);
  const initialMode = useMemo(() => modeForResponse(existingResponse), [existingResponse]);
  const [label, setLabel] = useState(requirement?.label ?? "");
  const [importance, setImportance] = useState<"must" | "nice" | "not_applicable">(requirement?.importance ?? "must");
  const [weight, setWeight] = useState(String(requirement?.weight ?? 1));
  // Customers do not choose a type. A saved type stays as it was.
  const requirementType = requirement?.requirementType ?? "custom";
  const [answerMode, setAnswerMode] = useState<AnswerMode>(requirement ? initialMode : "text");
  const [answerValue, setAnswerValue] = useState(valueForResponse(existingResponse));
  const [replacedExisting, setReplacedExisting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [rejected, setRejected] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const attempt = useRef<SaveInput | null>(null);
  const submitting = useRef(false);
  const uncertainAttempt = useRef(false);
  const safeHref = safeReturnHref(returnHref);
  const editingPreserved = Boolean(requirement && modeForResponse(existingResponse) === "existing");

  async function runSave(input: SaveInput) {
    if (submitting.current || save.isPending) return;
    submitting.current = true;
    setValidationError(null);
    try {
      await save.mutateAsync(input);
      setConfirmed(true);
      try { router.replace(safeHref); } catch { /* The confirmed view keeps the safe link available. */ }
      try { router.refresh(); } catch { /* The confirmed view keeps the safe link available. */ }
    } catch (error) {
      const rejection = classifySaveRejection(error);
      if (!uncertainAttempt.current && rejection === "correction") {
        attempt.current = null;
        setLocked(false);
        setRejected(false);
        setValidationError("The server rejected these values. Check the form and try again.");
      } else if (!uncertainAttempt.current && rejection === "access") {
        setLocked(true);
        setRejected(true);
        setValidationError(null);
      } else {
        uncertainAttempt.current = true;
        setLocked(true);
        setRejected(false);
        setValidationError(null);
      }
    } finally {
      submitting.current = false;
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || save.isPending || locked || confirmed) return;
    const trimmedLabel = label.trim();
    if (!trimmedLabel || trimmedLabel.length > 200) {
      setValidationError("Describe what you need in 1 to 200 characters.");
      return;
    }
    const numericWeight = Number(weight);
    if (!Number.isInteger(numericWeight) || numericWeight < 1 || numericWeight > 100) {
      setValidationError("Enter a whole number from 1 to 100 for how much this counts.");
      return;
    }
    const existingError = answerMode === "existing" ? responseValidationError(existingResponse) : null;
    const checkedPayroll = payrollTemplate ? payrollAnswerSchema.safeParse(payrollAnswer) : null;
    const response: { response?: JsonValue; error?: string } = checkedPayroll ? checkedPayroll.success ? { response: payrollAnswerForSave(checkedPayroll.data) } : { error: "Check the payroll answers. Use a two-letter country code or leave it blank." }
      : existingError ? { error: existingError } : answerMode === "existing" ? { response: existingResponse } : buildResponse(answerValue, existingResponse);
    if (response.error || response.response === undefined) {
      setValidationError(response.error ?? "Choose an answer.");
      return;
    }
    const requirementId = requirement?.requirementId ?? requestId();
    const correlationId = requestId();
    const idempotencyKey = requestId();
    if (!requirementId || !correlationId || !idempotencyKey) {
      setValidationError("This browser cannot create a secure save request. Use an updated browser and try again.");
      return;
    }
    const stableKey = requirement?.stableKey ?? (payrollTemplate ? "input_payroll" : `need_${requirementId.replaceAll("-", "")}`);
    const input: SaveInput = {
      requirementId, organizationId, intakeId, expectedRevision: requirement?.revision ?? 0,
      stableKey, label: trimmedLabel, importance, weight: numericWeight, response: response.response,
      requirementType: payrollTemplate ? "structured" : requirementType, correlationId, idempotencyKey,
    };
    attempt.current = input;
    await runSave(input);
  }

  if (confirmed) return <section className="border-l-2 border-foreground pl-5" role="status">
    <h2 className="text-xl font-semibold">Save confirmed</h2>
    <p className="mt-2 max-w-xl text-pretty text-sm leading-6 text-muted-foreground">The requirement is saved. Return to the requirements list to review it.</p>
    <a href={safeHref} className="mt-5 inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground">Return to requirements</a>
  </section>;

  return <form onSubmit={submit} aria-label={requirement ? "Edit intake requirement" : "Add intake requirement"} className="space-y-8">
    <div className="flex flex-wrap items-end justify-between gap-4 border-b pb-6">
      <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Requirement detail</p><h2 className="mt-2 text-balance text-2xl font-semibold tracking-tight">{requirement ? "Edit this requirement" : "Add a requirement"}</h2><p className="mt-2 max-w-2xl text-pretty text-sm leading-6 text-muted-foreground">Describe one thing the new system must support. Answer each question in plain words.</p></div>
      {requirement && <p className="font-mono text-xs tabular-nums text-muted-foreground">Revision {requirement.revision}</p>}
    </div>
    <fieldset disabled={save.isPending || locked} className="space-y-6">
      {!requirement && <div className="space-y-2">
        <label htmlFor="requirement-template" className={labelClass}>Type of requirement</label>
        <select id="requirement-template" className={selectClass} value={payrollTemplate ? "payroll" : "custom"}
          onChange={event => { const payroll = event.target.value === "payroll"; setPayrollTemplate(payroll); if (payroll) setLabel("Payroll processing"); }}>
          <option value="custom">Your own requirement</option><option value="payroll">Payroll processing</option>
        </select></div>}
      <div className="space-y-2">
        <label htmlFor="requirement-label" className={labelClass}>What do you need?</label>
        <p id="requirement-label-hint" className={hintClass}>Describe one need in a few words. For example: Support two payroll groups.</p>
        <Input id="requirement-label" aria-describedby="requirement-label-hint" value={label} maxLength={200} className="min-h-11 text-foreground" onChange={(event) => setLabel(event.target.value)} />
      </div>
      <div className="space-y-2">
        <label htmlFor="requirement-importance" className={labelClass}>How important is this?</label>
        <select id="requirement-importance" value={importance} className={selectClass} onChange={(event) => setImportance(event.target.value as typeof importance)}><option value="must">Must have</option><option value="nice">Nice to have</option><option value="not_applicable">Not applicable</option></select>
      </div>
      <div className="space-y-2">
        <label htmlFor="requirement-weight" className={labelClass}>How much should this count?</label>
        <p id="requirement-weight-hint" className={hintClass}>Enter a whole number from 1 to 100. A higher number counts more when options are compared.</p>
        <Input id="requirement-weight" aria-describedby="requirement-weight-hint" inputMode="numeric" type="number" min={1} max={100} step={1} value={weight} className="min-h-11 text-foreground" onChange={(event) => setWeight(event.target.value)} />
      </div>
      {payrollTemplate ? <PayrollAnswerFields value={payrollAnswer} onChange={setPayrollAnswer}/> : editingPreserved && answerMode === "existing"
        ? <section className="space-y-3" aria-labelledby="answer-heading"><h3 id="answer-heading" className={labelClass}>Details</h3><div className="space-y-4 rounded-lg border bg-muted/30 p-4"><p className="text-sm font-medium">Your saved answer is kept</p><div className="max-h-56 overflow-auto rounded-md bg-background p-3 text-xs leading-5 text-muted-foreground"><ResponseValue value={existingResponse} /></div><Button type="button" variant="outline" className={`${formButtonClass} min-h-11`} onClick={() => { setAnswerMode("text"); setAnswerValue(""); setReplacedExisting(true); }}>Replace answer</Button></div></section>
        : <div className="space-y-2">
          <label htmlFor="requirement-details" className={labelClass}>Details (optional)</label>
          <p id="requirement-details-hint" className={hintClass}>Add anything that helps explain this need, such as how often it happens or who uses it.</p>
          <textarea id="requirement-details" aria-describedby="requirement-details-hint" value={answerValue} maxLength={2_000} className={textareaClass} onChange={(event) => setAnswerValue(event.target.value)} />
          {editingPreserved && replacedExisting && <Button type="button" variant="outline" className={`${formButtonClass} min-h-11`} onClick={() => { setAnswerMode("existing"); setAnswerValue(""); setReplacedExisting(false); }}>Keep saved answer</Button>}
        </div>}
    </fieldset>
    {save.isPending && <p role="status" aria-live="polite" className="text-sm text-muted-foreground">Saving requirement…</p>}
    {validationError && <p role="alert" className="border-l-2 border-destructive pl-5 text-sm leading-6">{validationError}</p>}
    {locked ? rejected ? <section className="flex flex-wrap items-center justify-between gap-4 border-t pt-6"><p role="status" className="text-sm text-muted-foreground">This save was rejected. Return to the requirements list to check current access and saved values.</p><a href={safeHref} className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-semibold underline underline-offset-4 hover:bg-muted">Return to requirements</a></section> : <section className="flex flex-wrap items-center justify-between gap-4 border-t pt-6"><p role="status" className="text-sm text-muted-foreground">We could not confirm this save. It may have succeeded. Retry the unchanged request or return to the requirements list.</p><div className="flex flex-wrap gap-3"><Button type="button" className={`${formButtonClass} min-h-11`} disabled={save.isPending} onClick={() => { if (attempt.current) void runSave(attempt.current); }}>Retry unchanged request</Button><a href={safeHref} className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-semibold underline underline-offset-4 hover:bg-muted">Return to requirements</a></div></section> : <div className="flex flex-wrap items-center justify-end gap-3 border-t pt-6">{!save.isPending && <a href={safeHref} className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-semibold underline underline-offset-4 hover:bg-muted">Return without saving</a>}<Button type="submit" className={`${formButtonClass} min-h-11`} disabled={save.isPending}>{save.isPending ? "Saving…" : requirement ? "Save changes" : "Save requirement"}</Button></div>}
  </form>;
}
