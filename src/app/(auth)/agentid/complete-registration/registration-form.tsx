"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { completeAgentIdRegistration } from "../../agentid-actions";

export function AgentIdRegistrationForm({ email, idempotencyKey }: { email: string; idempotencyKey: string }) {
  const [state, action, pending] = useActionState(completeAgentIdRegistration, null);
  return (
    <form action={action} className="flex max-w-sm flex-col gap-4">
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <p className="break-all text-sm">Verified email: {email}</p>
      <div className="flex flex-col gap-2">
        <Label htmlFor="agent-name">Full name</Label>
        <Input id="agent-name" name="fullName" required maxLength={200} autoComplete="name" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="agent-company">Company</Label>
        <Input id="agent-company" name="company" required maxLength={200} autoComplete="organization" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="agent-phone">Direct company phone</Label>
        <Input id="agent-phone" name="directCompanyPhone" type="tel" required maxLength={24} autoComplete="tel" />
      </div>
      <label htmlFor="agent-consent" className="flex items-start gap-2 text-sm">
        <input id="agent-consent" name="consent" type="checkbox" required />
        <span>I agree that MatchMaker HR may contact me about my request. See our <a className="underline" href="/privacy">privacy notice</a>.</span>
      </label>
      {state?.error ? <p role="alert" className="text-sm text-red-600">{state.error}</p> : null}
      <Button type="submit" disabled={pending}>{pending ? "Working…" : "Complete registration"}</Button>
    </form>
  );
}
