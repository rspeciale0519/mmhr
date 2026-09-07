"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { acceptInvitationAction, type InvitationAcceptState } from "./actions";

export function InvitationAcceptForm({ invitationId }: { invitationId: string }) {
  const [state, formAction, pending] = useActionState<InvitationAcceptState, FormData>(
    acceptInvitationAction,
    null,
  );

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="invitationId" value={invitationId} />
      {state?.error ? <p role="alert" className="text-sm text-red-600">{state.error}</p> : null}
      {state?.success ? <p role="status" className="text-sm text-green-700">{state.success}</p> : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Accepting…" : "Accept invitation"}
      </Button>
    </form>
  );
}
