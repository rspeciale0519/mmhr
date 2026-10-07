"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { signInWithAgentId } from "./agentid-actions";

export function AgentIdButton({ enabled }: { enabled: boolean }) {
  const [state, action, pending] = useActionState(signInWithAgentId, null);
  return (
    <form action={action} className="flex max-w-sm flex-col gap-3">
      <Button variant="outline" type="submit" disabled={!enabled || pending}>
        {pending ? "Working…" : "Sign in with AgentID"}
      </Button>
      {!enabled ? <p className="text-sm text-muted-foreground">AgentID sign-in is not available yet.</p> : null}
      {state?.error ? <p role="alert" className="text-sm text-red-600">{state.error}</p> : null}
    </form>
  );
}
