"use client";

import { useRef, useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useTRPC } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function InvitationControls({ organizationId, invitationId, canResend, canRevoke }: {
  organizationId: string; invitationId: string; canResend: boolean; canRevoke: boolean;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const resend = useMutation(trpc.invitations.resend.mutationOptions({ retry: false }));
  const revoke = useMutation(trpc.invitations.revoke.mutationOptions({ retry: false }));
  const [operation, setOperation] = useState<"resend" | "revoke" | null>(null);
  const [reason, setReason] = useState("");
  const [done, setDone] = useState(false);
  const busy = useRef(false);
  const attempt = useRef<{ fingerprint: string; idempotencyKey: string; correlationId: string } | null>(null);
  const pending = resend.isPending || revoke.isPending;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current || done || !operation || (operation === "resend" ? !canResend : !canRevoke)) return;
    const input = { organizationId, invitationId, reason: reason.trim() };
    const fingerprint = JSON.stringify({ ...input, operation });
    if (attempt.current?.fingerprint !== fingerprint) attempt.current = {
      fingerprint, idempotencyKey: crypto.randomUUID(), correlationId: crypto.randomUUID(),
    };
    busy.current = true;
    try {
      await (operation === "resend" ? resend : revoke).mutateAsync({ ...input,
        idempotencyKey: attempt.current.idempotencyKey, correlationId: attempt.current.correlationId });
      setDone(true);
    } catch {
      // Mutation state reports failure without exposing server details.
    } finally { busy.current = false; }
  }

  if (done) return <div className="space-y-3">
    <p role="status" className="text-sm">{operation === "resend"
      ? "Replacement invitation recorded. Email delivery is not confirmed." : "Invitation revoked."}</p>
    <Button variant="outline" className="min-h-11 transition-colors" onClick={() => router.refresh()}>Refresh invitations</Button>
  </div>;
  if (!operation) return <div className="flex flex-wrap gap-3">
    {canResend && <Button variant="outline" className="min-h-11 transition-colors" onClick={() => setOperation("resend")}>Resend invitation</Button>}
    {canRevoke && <Button variant="outline" className="min-h-11 transition-colors" onClick={() => setOperation("revoke")}>Revoke invitation</Button>}
  </div>;
  return <form onSubmit={submit} aria-label={`${operation === "resend" ? "Resend" : "Revoke"} invitation`} className="space-y-4">
    <p className="text-pretty text-sm text-muted-foreground">{operation === "resend"
      ? "Resend replaces this invitation. The previous invitation will no longer work."
      : "Revoke prevents acceptance of this invitation. It does not remove an existing membership."}</p>
    <label className="block space-y-2 text-sm font-medium">
      <span>Reason for change</span>
      <Input required maxLength={500} className="min-h-11" disabled={pending}
        value={reason} onChange={(event) => setReason(event.target.value)} />
    </label>
    <p className="text-sm text-muted-foreground">The reason stays in audit history. Do not include secrets or links.</p>
    {(resend.isError || revoke.isError) && <p role="alert" className="text-sm text-destructive">
      Change not confirmed. Check your access and reason, then retry the unchanged request.
    </p>}
    <div className="flex flex-wrap gap-3">
      <Button type="submit" disabled={pending} className="min-h-11 transition-colors">
        {pending ? "Saving change…" : operation === "resend" ? "Confirm resend" : "Confirm revoke"}
      </Button>
      <Button type="button" variant="outline" disabled={pending} className="min-h-11 transition-colors"
        onClick={() => { setOperation(null); resend.reset(); revoke.reset(); }}>Cancel</Button>
    </div>
  </form>;
}
