"use client";

import { useMutation } from "@tanstack/react-query";
import { useRef, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTRPC } from "@/lib/trpc/client";

type InvitationRole = "viewer" | "contributor" | "organization_admin";
type Attempt = { fingerprint: string; idempotencyKey: string; correlationId: string };

export function InvitationCreateForm({ organizationId }: { organizationId: string }) {
  const trpc = useTRPC();
  const create = useMutation(trpc.invitations.create.mutationOptions({ retry: false }));
  const [email, setEmail] = useState("");
  const [roleKey, setRoleKey] = useState<InvitationRole>("viewer");
  const [reason, setReason] = useState("");
  const attempt = useRef<Attempt | null>(null);
  const submitting = useRef(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || create.isSuccess) return;
    const input = { organizationId, email: email.trim().toLowerCase(), roleKey, reason: reason.trim() };
    const fingerprint = JSON.stringify(input);
    // Keep the same receipt key when a response is lost. Changed input is a new command.
    if (attempt.current?.fingerprint !== fingerprint) {
      attempt.current = { fingerprint, idempotencyKey: crypto.randomUUID(), correlationId: crypto.randomUUID() };
    }
    submitting.current = true;
    try {
      await create.mutateAsync({ ...input, idempotencyKey: attempt.current.idempotencyKey,
        correlationId: attempt.current.correlationId });
    } catch {
      // The mutation error drives the visible failure state. Never expose server error details.
    } finally {
      submitting.current = false;
    }
  }

  if (create.isSuccess) {
    return (
      <section className="space-y-4 border-t pt-6" aria-label="Invitation result">
        <p role="status" className="font-medium">Invitation recorded.</p>
        <p className="text-pretty text-sm leading-6 text-muted-foreground">
          The recipient can view pending invitations after signing in with the invited email address.
          This confirmation does not confirm email delivery.
        </p>
        <Button type="button" className="min-h-11 transition-colors" variant="outline" onClick={() => {
          create.reset(); attempt.current = null; setEmail(""); setReason(""); setRoleKey("viewer");
        }}>Invite another member</Button>
      </section>
    );
  }

  return (
    <form onSubmit={submit} aria-label="Invite a member" className="space-y-6">
      <fieldset disabled={create.isPending} className="space-y-6">
        <legend className="sr-only">Invitation details</legend>
        <div className="space-y-2">
          <label htmlFor="invitation-email" className="text-sm font-medium">Email address</label>
          <Input id="invitation-email" type="email" autoComplete="off" required maxLength={254}
            className="min-h-11" value={email} onChange={(event) => setEmail(event.target.value)} />
        </div>
        <div className="space-y-2">
          <label htmlFor="invitation-role" className="text-sm font-medium">Organization role</label>
          <select id="invitation-role" value={roleKey}
            onChange={(event) => setRoleKey(event.target.value as InvitationRole)}
            aria-describedby="invitation-role-help"
            className="min-h-11 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
            <option value="viewer">Viewer</option>
            <option value="contributor">Contributor</option>
            <option value="organization_admin">Organization administrator</option>
          </select>
          <p id="invitation-role-help" className="text-pretty text-sm text-muted-foreground">
            Choose only the access this member needs. This does not grant a platform role.
          </p>
        </div>
        <div className="space-y-2">
          <label htmlFor="invitation-reason" className="text-sm font-medium">Reason for access</label>
          <Input id="invitation-reason" required maxLength={500} className="min-h-11" value={reason}
            aria-describedby="invitation-reason-help" onChange={(event) => setReason(event.target.value)} />
          <p id="invitation-reason-help" className="text-pretty text-sm text-muted-foreground">
            This reason stays in the audit history. Do not include secrets or links.
          </p>
        </div>
      </fieldset>
      {create.isError && <p role="alert" className="text-pretty text-sm text-destructive">
        Invitation not confirmed. Check your entries and access, then retry. An unchanged request can retry safely.
      </p>}
      <Button type="submit" className="min-h-11 transition-colors" disabled={create.isPending}>
        {create.isPending ? "Creating invitation…" : "Create invitation"}
      </Button>
    </form>
  );
}
