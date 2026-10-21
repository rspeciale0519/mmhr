"use client";
import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useTRPC } from "@/lib/trpc/client";
import { portalHandoffCommandSchema, type PortalHandoffCommand } from "@/lib/contract-handoff-portal";
import { Button } from "@/components/ui/button";

export const contractFieldClass = "w-full rounded-md border bg-background p-3 text-sm leading-6 [overflow-wrap:anywhere]";
export function useContractAction() {
  const trpc = useTRPC(), router = useRouter();
  const select = useMutation(trpc.contracts.select.mutationOptions({ retry: false }));
  const withdraw = useMutation(trpc.contracts.withdraw.mutationOptions({ retry: false }));
  const approve = useMutation(trpc.contracts.approve.mutationOptions({ retry: false }));
  const reject = useMutation(trpc.contracts.reject.mutationOptions({ retry: false }));
  const introduce = useMutation(trpc.contracts.introduce.mutationOptions({ retry: false }));
  const transition = useMutation(trpc.contracts.transition.mutationOptions({ retry: false }));
  const signed = useMutation(trpc.contracts.recordSigned.mutationOptions({ retry: false }));
  const attempt = useRef<PortalHandoffCommand | null>(null), sending = useRef(false);
  const [locked, setLocked] = useState(false), [saved, setSaved] = useState(false), [message, setMessage] = useState<string | null>(null);
  async function send(input: PortalHandoffCommand) {
    if (sending.current || saved) return;
    sending.current = true; setLocked(true); setMessage(null);
    try {
      if (input.action === "select") await select.mutateAsync(input);
      else if (input.action === "withdraw_selection") await withdraw.mutateAsync(input);
      else if (input.action === "approve_selection") await approve.mutateAsync(input);
      else if (input.action === "reject_selection") await reject.mutateAsync(input);
      else if (input.action === "introduce") await introduce.mutateAsync(input);
      else if (input.action === "transition") await transition.mutateAsync(input);
      else await signed.mutateAsync(input);
      setSaved(true); setMessage("Your contract action is saved.");
      try { router.refresh(); } catch { setMessage("Your contract action is saved. Reload the page to read the current records."); }
    } catch { setMessage("We could not confirm this action. Retry the unchanged request or reload the page."); }
    finally { sending.current = false; }
  }
  function begin(build: () => Record<string, unknown>) {
    if (locked || saved || sending.current) return;
    try {
      const parsed = portalHandoffCommandSchema.safeParse({ ...build(), correlationId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID() });
      if (!parsed.success) { setMessage(parsed.error.issues[0]?.message ?? "Check the contract fields."); return; }
      attempt.current = parsed.data; void send(parsed.data);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Check the contract fields."); }
  }
  return { begin, locked, saved, message, pending: select.isPending || withdraw.isPending || approve.isPending || reject.isPending
    || introduce.isPending || transition.isPending || signed.isPending, retry: () => { if (attempt.current) void send(attempt.current); } };
}
export function ContractActionStatus({ action }: { action: ReturnType<typeof useContractAction> }) {
  return <div className="space-y-3">{action.message && <p role={action.saved ? "status" : "alert"} className="text-sm leading-7">{action.message}</p>}
    {action.locked && !action.saved && <div className="flex flex-wrap gap-3"><Button type="button" className="min-h-11" disabled={action.pending} onClick={action.retry}>Retry unchanged request</Button>
      <Button type="button" variant="outline" className="min-h-11" onClick={() => window.location.reload()}>Reload page</Button></div>}</div>;
}
