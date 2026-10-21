"use client";

import { useMutation } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ZodError } from "zod";
import { useTRPC } from "@/lib/trpc/client";
import { demoCoordinationCommandSchema, type DemoCoordinationCommand } from "@/lib/demo-coordination";
import { Button } from "@/components/ui/button";

export function useDemoAction() {
  const trpc = useTRPC(), router = useRouter();
  const create = useMutation(trpc.demos.create.mutationOptions({ retry: false }));
  const customer = useMutation(trpc.demos.customerAvailability.mutationOptions({ retry: false }));
  const vendor = useMutation(trpc.demos.vendorAvailability.mutationOptions({ retry: false }));
  const confirm = useMutation(trpc.demos.confirm.mutationOptions({ retry: false }));
  const reopen = useMutation(trpc.demos.reopen.mutationOptions({ retry: false }));
  const complete = useMutation(trpc.demos.complete.mutationOptions({ retry: false }));
  const cancel = useMutation(trpc.demos.cancel.mutationOptions({ retry: false }));
  const noShow = useMutation(trpc.demos.noShow.mutationOptions({ retry: false }));
  const [locked, setLocked] = useState(false), [saved, setSaved] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const attempt = useRef<DemoCoordinationCommand | null>(null), sending = useRef(false);
  async function send(input: DemoCoordinationCommand) {
    if (sending.current || saved) return;
    sending.current = true; setLocked(true); setMessage(null);
    try {
      if (input.action === "create") await create.mutateAsync(input);
      else if (input.action === "customer_availability") await customer.mutateAsync(input);
      else if (input.action === "vendor_availability") await vendor.mutateAsync(input);
      else if (input.action === "confirm") await confirm.mutateAsync(input);
      else if (input.action === "reopen") await reopen.mutateAsync(input);
      else if (input.action === "complete") await complete.mutateAsync(input);
      else if (input.action === "cancel") await cancel.mutateAsync(input);
      else await noShow.mutateAsync(input);
      setSaved(true);
      setMessage(input.action.endsWith("availability") ? "Your acceptable times are saved. MMHR must confirm the meeting."
        : input.action === "confirm" ? "The meeting is confirmed. Customer and vendor portals show the schedule."
        : "Your demo action is saved.");
      try { router.refresh(); } catch { setMessage("Your action is saved. Reload this page to read the current demo."); }
    } catch { setMessage("We could not confirm this action. Retry the unchanged request or reload the page."); }
    finally { sending.current = false; }
  }
  function begin(build: () => Record<string, unknown>) {
    if (locked || saved || sending.current) return;
    try {
      if (typeof crypto.randomUUID !== "function") throw new Error("Use a secure connection to save this action.");
      const parsed = demoCoordinationCommandSchema.safeParse({ ...build(), correlationId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID() });
      if (!parsed.success) { setMessage(parsed.error.issues[0]?.message ?? "Check the demo fields."); return; }
      attempt.current = parsed.data;
      void send(parsed.data);
    } catch (error) { setMessage(error instanceof ZodError ? error.issues[0]?.message ?? "Check the demo fields."
      : error instanceof Error ? error.message : "Check the demo fields."); }
  }
  return { begin, locked, saved, message, pending: create.isPending || customer.isPending || vendor.isPending || confirm.isPending
    || reopen.isPending || complete.isPending || cancel.isPending || noShow.isPending,
    retry: () => { if (attempt.current) void send(attempt.current); },
    reset: () => { if (saved && !sending.current) { setLocked(false); setSaved(false); setMessage(null); attempt.current = null; } } };
}
export function DemoActionStatus({ action }: { action: ReturnType<typeof useDemoAction> }) {
  return <div className="space-y-3">
    {action.message && <p className="text-sm leading-7" role={action.saved ? "status" : "alert"}>{action.message}</p>}
    {action.locked && !action.saved && <div className="flex flex-wrap gap-3">
      <Button type="button" className="min-h-11" disabled={action.pending} onClick={action.retry}>{action.pending ? "Saving…" : "Retry unchanged request"}</Button>
      <Button type="button" variant="outline" className="min-h-11" onClick={() => window.location.reload()}>Reload page</Button>
    </div>}
  </div>;
}
export const demoFieldClass = "w-full rounded-md border bg-background p-3 text-sm leading-6 [overflow-wrap:anywhere]";
