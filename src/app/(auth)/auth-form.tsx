"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AuthState } from "./actions";

type Props = {
  action: (prev: AuthState, formData: FormData) => Promise<AuthState>;
  mode: "sign-in" | "sign-up";
  submitLabel: string;
};

/**
 * Shared credentials form for sign-in and sign-up. It remains intentionally
 * plain until Pulse tokens and the canonical registration gate reach auth.
 */
export function AuthForm({ action, mode, submitLabel }: Props) {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    action,
    null,
  );

  return (
    <form action={formAction} className="flex max-w-sm flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Work email</Label>
        <Input id="email" name="email" type="email" required autoComplete="email" />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          minLength={mode === "sign-up" ? 12 : 8}
          autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
        />
      </div>

      {state?.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}

      {state?.success ? (
        <p role="status" className="text-sm text-green-700">
          {state.success}
        </p>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending ? "Working…" : submitLabel}
      </Button>
    </form>
  );
}
