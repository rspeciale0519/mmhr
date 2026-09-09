"use client";

import { useMutation } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { useTRPC } from "@/lib/trpc/client";

export type CustomerIntakeSubmitProps = {
  organizationId: string;
  intakeId: string;
  expectedRevision: number;
};

type SubmitInput = CustomerIntakeSubmitProps & {
  correlationId: string;
  idempotencyKey: string;
};

type Rejection = "fresh-review" | null;

const buttonClass = "min-h-11 transition-colors";

function requestId(): string | null {
  return typeof globalThis.crypto?.randomUUID === "function" ? globalThis.crypto.randomUUID() : null;
}

function classifyRejection(error: unknown): Rejection {
  if (!(error instanceof TRPCClientError)) return null;
  const code = error.data?.code;
  return code === "BAD_REQUEST" || code === "NOT_FOUND" || code === "FORBIDDEN" || code === "UNAUTHORIZED"
    ? "fresh-review" : null;
}

export function CustomerIntakeSubmit({ organizationId, intakeId, expectedRevision }: CustomerIntakeSubmitProps) {
  const trpc = useTRPC();
  const router = useRouter();
  const submit = useMutation(trpc.intakes.submit.mutationOptions({ retry: false }));
  const [reviewing, setReviewing] = useState(false);
  const [checked, setChecked] = useState(false);
  const [locked, setLocked] = useState(false);
  const [rejected, setRejected] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const attempt = useRef<SubmitInput | null>(null);
  const uncertainAttempt = useRef(false);
  const submitting = useRef(false);
  const currentIntakeHref = `/customer?intake=${encodeURIComponent(intakeId)}`;

  async function runSubmit(input: SubmitInput, retry = false) {
    if (submitting.current || submit.isPending || (locked && !retry) || confirmed) return;
    submitting.current = true;
    setMessage(null);
    try {
      await submit.mutateAsync(input);
      setConfirmed(true);
      try { router.replace(currentIntakeHref); } catch { /* The confirmed view keeps a safe link. */ }
      try { router.refresh(); } catch { /* A refresh failure cannot undo confirmation. */ }
    } catch (error) {
      const rejection = classifyRejection(error);
      if (!uncertainAttempt.current && rejection === "fresh-review") {
        setLocked(true);
        setRejected(true);
        setMessage(null);
      } else {
        uncertainAttempt.current = true;
        setLocked(true);
        setRejected(false);
        setMessage(null);
      }
    } finally {
      submitting.current = false;
    }
  }

  function submitConfirmed() {
    if (submitting.current || submit.isPending || locked || confirmed || !checked) return;
    const correlationId = requestId();
    const idempotencyKey = requestId();
    if (!correlationId || !idempotencyKey) {
      setMessage("This browser cannot create a secure submission request. Use an updated browser and try again.");
      return;
    }
    const input = { organizationId, intakeId, expectedRevision, correlationId, idempotencyKey };
    attempt.current = input;
    void runSubmit(input);
  }

  function retryUnchanged() {
    if (attempt.current) void runSubmit(attempt.current, true);
  }

  if (confirmed) return <section className="border-l-2 border-foreground pl-5" role="status">
    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Submission confirmed</p>
    <h2 className="mt-2 text-xl font-semibold">Your submission is confirmed</h2>
    <p className="mt-2 max-w-xl text-pretty text-sm leading-6 text-muted-foreground">Open the saved intake to see its current status and saved answers.</p>
    <a href={currentIntakeHref} className="mt-5 inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground">Open submitted intake</a>
  </section>;

  return <section aria-labelledby="submit-intake-heading" className="mt-12 space-y-6 border-t pt-8">
    <div className="max-w-2xl">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Ready for review</p>
      <h2 id="submit-intake-heading" className="mt-2 text-balance text-2xl font-semibold tracking-tight">Submit your saved intake</h2>
      <p className="mt-2 text-pretty text-sm leading-6 text-muted-foreground">Before you submit, add at least one must-have or nice-to-have requirement. You can still edit your saved answers and requirements now.</p>
    </div>

    {locked ? <section className="flex flex-wrap items-center justify-between gap-4 border-l-2 border-destructive pl-5" role="alert">
      {rejected ? <>
        <p className="max-w-2xl text-sm leading-6">This submission was rejected. Return to the saved intake to check current access and saved values.</p>
        <a href={currentIntakeHref} className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-semibold underline underline-offset-4 hover:bg-muted">Review saved intake</a>
      </> : <>
        <p className="max-w-2xl text-sm leading-6">We could not confirm this submission. It may have succeeded. Retry the unchanged request or review the saved intake.</p>
        <div className="flex flex-wrap gap-3">
          <Button type="button" className={buttonClass} disabled={submit.isPending} onClick={retryUnchanged}>Retry unchanged request</Button>
          <a href={currentIntakeHref} className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-semibold underline underline-offset-4 hover:bg-muted">Review saved intake</a>
        </div>
      </>}
    </section> : !reviewing ? <Button type="button" className={buttonClass} onClick={() => { setReviewing(true); setMessage(null); }}>Review submission</Button> : <section className="space-y-5 rounded-lg border bg-muted/30 p-5" aria-label="Submission confirmation">
      <div className="space-y-3 text-sm leading-6">
        <p className="font-semibold">Review this submission</p>
        <p>Submitting sends all current saved answers and active requirements, including changes from other pages or teammates.</p>
        <p>Editing stops after submission. It does not send an RFP, contact providers, or create an assessment.</p>
      </div>
      <label className="flex min-h-11 items-start gap-3 text-sm leading-6">
        <input type="checkbox" checked={checked} disabled={submit.isPending} className="mt-1 size-4 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" onChange={(event) => setChecked(event.target.checked)} />
        <span>Submit all current saved answers and requirements</span>
      </label>
      {message && <p role="alert" className="border-l-2 border-destructive pl-4 text-sm leading-6">{message}</p>}
      <div className="flex flex-wrap gap-3">
        <Button type="button" className={buttonClass} disabled={!checked || submit.isPending} onClick={submitConfirmed}>{submit.isPending ? "Submitting…" : "Submit saved intake"}</Button>
        {!submit.isPending && <Button type="button" variant="outline" className={buttonClass} onClick={() => { setReviewing(false); setChecked(false); }}>Return to editing</Button>}
      </div>
    </section>}
  </section>;
}
