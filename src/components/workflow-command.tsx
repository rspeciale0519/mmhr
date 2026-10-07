"use client";
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

/** Keep an uncertain request unchanged so a retry cannot create another command. */
export function WorkflowCommand<T>({ label, success, prepare, execute, children, disabled = false }: {
  label: string; success: string; prepare: (data: FormData) => T;
  execute: (input: NoInfer<T>) => Promise<unknown>; children?: ReactNode; disabled?: boolean;
}) {
  const router = useRouter();
  const request = useRef<T | null>(null);
  const active = useRef(false);
  const [state,setState] = useState<"idle"|"pending"|"uncertain"|"done">("idle");
  const [message,setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (active.current || disabled || state === "done") return;
    if (request.current === null) {
      try { request.current = prepare(new FormData(event.currentTarget)); }
      catch { setMessage("Check the required fields and try again."); return; }
    }
    active.current = true; setState("pending"); setMessage("");
    try {
      await execute(request.current);
      setState("done"); setMessage(success); router.refresh();
    } catch {
      setState("uncertain");
      setMessage("We could not confirm the result. Retry the same request, or reload to check the saved state.");
    } finally { active.current = false; }
  }
  return <form onSubmit={submit} className="space-y-4">
    <fieldset disabled={disabled || state !== "idle"} className="space-y-4">{children}</fieldset>
    {message && <p role={state === "done" ? "status" : "alert"} className="text-sm leading-6">{message}</p>}
    <div className="flex flex-wrap gap-3">
      <Button type="submit" disabled={disabled || state === "pending" || state === "done"} className="min-h-11">
        {state === "pending" ? "Saving…" : state === "uncertain" ? "Retry same request" : label}
      </Button>
      {state === "uncertain" && <Button type="button" variant="outline" className="min-h-11" onClick={() => window.location.reload()}>Reload saved state</Button>}
    </div>
  </form>;
}
export const workflowInputClass = "mt-2 min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2";
export function commandIds() { return { correlationId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID() }; }
