"use client";

import { useRef, useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTRPC } from "@/lib/trpc/client";

type MemberRole = "organization_admin" | "contributor" | "viewer";
type Operation = "role" | "status" | "revoke";
export function MemberControls({ organizationId, membershipId, status, roleKey,
  canChangeRole, canChangeStatus, canRevoke }: {
  organizationId: string; membershipId: string; status: "active" | "suspended"; roleKey: MemberRole | null;
  canChangeRole: boolean; canChangeStatus: boolean; canRevoke: boolean;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const role = useMutation(trpc.memberships.changeRole.mutationOptions({ retry: false }));
  const state = useMutation(trpc.memberships.changeStatus.mutationOptions({ retry: false }));
  const revoke = useMutation(trpc.memberships.revoke.mutationOptions({ retry: false }));
  const [operation, setOperation] = useState<Operation | null>(null);
  const [nextRole, setNextRole] = useState<MemberRole>(roleKey ?? "viewer");
  const [reason, setReason] = useState("");
  const [done, setDone] = useState(false);
  const busy = useRef(false);
  const attempt = useRef<{ fingerprint: string; idempotencyKey: string } | null>(null);
  const pending = role.isPending || state.isPending || revoke.isPending;
  const nextStatus = status === "active" ? "suspended" : "active";
  const label = operation === "role" ? "Change role" : operation === "revoke" ? "Revoke membership"
    : status === "active" ? "Suspend membership" : "Restore membership";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current || done || !operation || (operation === "role" ? !canChangeRole || !roleKey || status !== "active"
      : operation === "status" ? !canChangeStatus : !canRevoke)) return;
    const metadata = { organizationId, membershipId, reason: reason.trim() };
    const value = operation === "role" ? nextRole : operation === "status" ? nextStatus : "revoked";
    const fingerprint = JSON.stringify({ ...metadata, operation, value });
    if (attempt.current?.fingerprint !== fingerprint) attempt.current = { fingerprint, idempotencyKey: crypto.randomUUID() };
    const input = { ...metadata, idempotencyKey: attempt.current.idempotencyKey };
    busy.current = true;
    try {
      if (operation === "role") await role.mutateAsync({ ...input, roleKey: nextRole });
      else if (operation === "status") await state.mutateAsync({ ...input, status: nextStatus });
      else await revoke.mutateAsync(input);
      setDone(true);
    } catch {
      // Each mutation exposes only the generic error state below.
    } finally { busy.current = false; }
  }
  if (done) return <div className="space-y-3">
    <p role="status" className="text-sm">Membership change recorded.</p>
    <Button className="min-h-11 transition-colors" variant="outline" onClick={() => router.refresh()}>Refresh members</Button>
  </div>;
  if (!operation) return <div className="flex flex-wrap gap-3">
    {canChangeRole && roleKey && status === "active" && <Button className="min-h-11 transition-colors" variant="outline" onClick={() => setOperation("role")}>Change role</Button>}
    {canChangeStatus && <Button className="min-h-11 transition-colors" variant="outline" onClick={() => setOperation("status")}>
      {status === "active" ? "Suspend membership" : "Restore membership"}</Button>}
    {canRevoke && <Button className="min-h-11 transition-colors" variant="outline" onClick={() => setOperation("revoke")}>Revoke membership</Button>}
  </div>;
  return <form onSubmit={submit} aria-label={label} className="space-y-4 border-t pt-4">
    <p className="text-pretty text-sm text-muted-foreground">{operation === "role"
      ? "Choose the organization role this member needs. This does not grant platform access."
      : operation === "revoke" ? "Revocation ends this membership. A new invitation is required to grant access again."
        : status === "active" ? "Suspension stops this member's workspace access until an administrator restores it."
          : "Restoration makes this membership active again. Other access restrictions still apply."}</p>
    <fieldset disabled={pending} className="space-y-4">
      <legend className="sr-only">Membership change</legend>
      {operation === "role" && <label className="block space-y-2 text-sm font-medium">
        <span>New organization role</span>
        <select value={nextRole} onChange={(event) => setNextRole(event.target.value as MemberRole)}
          className="min-h-11 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          <option value="viewer">Viewer</option><option value="contributor">Contributor</option>
          <option value="organization_admin">Organization administrator</option>
        </select>
      </label>}
      <label className="block space-y-2 text-sm font-medium"><span>Reason for change</span>
        <Input required maxLength={500} className="min-h-11" value={reason} onChange={(event) => setReason(event.target.value)} />
      </label>
    </fieldset>
    <p className="text-sm text-muted-foreground">The reason stays in audit history. Do not include secrets or links.</p>
    {(role.isError || state.isError || revoke.isError) && <p role="alert" className="text-sm text-destructive">
      Change not confirmed. Check your access and reason, then retry the unchanged request. The last administrator must retain access.
    </p>}
    <div className="flex flex-wrap gap-3">
      <Button type="submit" disabled={pending || (operation === "role" && nextRole === roleKey)} className="min-h-11 transition-colors">
        {pending ? "Saving change…" : `Confirm: ${label.toLowerCase()}`}
      </Button>
      <Button type="button" disabled={pending} variant="outline" className="min-h-11 transition-colors"
        onClick={() => { setOperation(null); role.reset(); state.reset(); revoke.reset(); }}>Cancel</Button>
    </div>
  </form>;
}
