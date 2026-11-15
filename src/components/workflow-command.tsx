"use client";
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

/** Thrown by `prepare` to show a field rule before any request is sent. */
export class WorkflowFieldError extends Error {
  constructor(message: string) { super(message); this.name = "WorkflowFieldError"; }
}

export type CommandFailure = "invalid" | "rejected" | "unknown";

/**
 * Input validation (BAD_REQUEST) runs before the command, so nothing was saved.
 * A refusal is a definite outcome too. Only other failures leave the result unknown.
 */
export function commandFailure(error: unknown): CommandFailure {
  const data = error && typeof error === "object" && "data" in error ? error.data : null;
  const code = data && typeof data === "object" && "code" in data ? String(data.code) : null;
  if (code === "BAD_REQUEST") return "invalid";
  if (code !== null && ["NOT_FOUND", "FORBIDDEN", "UNAUTHORIZED", "CONFLICT"].includes(code)) return "rejected";
  return "unknown";
}

export const defaultInvalidMessage = "The server did not accept these fields. Check each field rule, correct the fields, and try again.";
export const rejectedMessage = "The server refused this request. The saved record or your access changed. Reload the page to check the saved state.";
export const uncertainMessage = "We could not confirm the result. Retry the same request, or reload to check the saved state.";

/** Keep an uncertain request unchanged so a retry cannot create another command. */
export function WorkflowCommand<T>({ label, success, prepare, execute, children, disabled = false, invalidMessage = defaultInvalidMessage }: {
  label: string; success: string; prepare: (data: FormData) => T;
  execute: (input: NoInfer<T>) => Promise<unknown>; children?: ReactNode; disabled?: boolean;
  /** Shown when the server rejects the input. Name the field rules of this form. */
  invalidMessage?: string;
}) {
  const router = useRouter();
  const request = useRef<T | null>(null);
  const active = useRef(false);
  const [state,setState] = useState<"idle"|"pending"|"uncertain"|"rejected"|"done">("idle");
  const [message,setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (active.current || disabled || state === "done" || state === "rejected") return;
    if (request.current === null) {
      try { request.current = prepare(new FormData(event.currentTarget)); }
      catch (error) {
        setMessage(error instanceof WorkflowFieldError ? error.message : "Check the required fields and try again.");
        return;
      }
    }
    active.current = true; setState("pending"); setMessage("");
    try {
      await execute(request.current);
      setState("done"); setMessage(success); router.refresh();
    } catch (error) {
      const failure = commandFailure(error);
      if (failure === "invalid") {
        // Nothing was saved, so the corrected fields can become a new request.
        request.current = null; setState("idle"); setMessage(invalidMessage);
      } else if (failure === "rejected") {
        setState("rejected"); setMessage(rejectedMessage);
      } else {
        setState("uncertain"); setMessage(uncertainMessage);
      }
    } finally { active.current = false; }
  }
  return <form onSubmit={submit} className="space-y-4">
    <fieldset disabled={disabled || state !== "idle"} className="space-y-4">{children}</fieldset>
    {message && <p role={state === "done" ? "status" : "alert"} className="text-sm leading-6">{message}</p>}
    <div className="flex flex-wrap gap-3">
      <Button type="submit" disabled={disabled || state === "pending" || state === "done" || state === "rejected"} className="min-h-11">
        {state === "pending" ? "Saving…" : state === "uncertain" ? "Retry same request" : label}
      </Button>
      {(state === "uncertain" || state === "rejected") && <Button type="button" variant="outline" className="min-h-11" onClick={() => window.location.reload()}>Reload saved state</Button>}
    </div>
  </form>;
}
export const workflowInputClass = "mt-2 min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2";
export const workflowHelpClass = "mt-1 block text-sm font-normal leading-6 text-muted-foreground";
export function commandIds() { return { correlationId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID() }; }
